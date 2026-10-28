// Mesin kolaborasi (Yjs + Trystero + IndexedDB). Dimuat terpisah saat pertama kali masuk ruang,
// supaya pustaka-pustaka ini tidak ikut memperlambat pembukaan aplikasi.
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { joinRoom as joinP2P, getRelaySockets } from 'trystero';
import { IndexeddbPersistence } from 'y-indexeddb';
import { tick } from 'svelte';
import { app } from './store.svelte.js';
import { normalizeDocument } from './model.js';
import { syncMap, reconcile } from './ysync.js';
import { collab } from './collab.svelte.js';

const APP_ID = 'sop-editor-v1';
const LOCAL = Symbol('local');
const REMOTE = Symbol('remote');

/** Membuka sesi ruang; seed = isi ruang dengan dokumen lokal bila ruang masih kosong. */
export function startSession(room, seed) {
  let closed = false;
  let undoManager, relayTimer, p2p;

  const ydoc = new Y.Doc();
  const root = ydoc.getMap('sop');
  root.observeDeep((_, tr) => {
    if (collab.status === 'connecting') {
      if (root.has('format')) adopt();
    } else if (tr.origin !== LOCAL) {
      applyRemote();
    }
  });

  const idb = new IndexeddbPersistence(`${APP_ID}:${room.id}`, ydoc);
  const awareness = new Awareness(ydoc);
  awareness.setLocalStateField('user', collab.me);
  awareness.on('change', updatePeers);
  connectPeers();

  idb.whenSynced.then(() => {
    if (closed || collab.status !== 'connecting') return;
    if (root.has('format')) adopt();
    else if (seed) useLocalDocument();
  });

  /** Mengisi ruang dengan dokumen lokal (pembuat ruang, atau bila tidak ada peserta lain yang memegang dokumennya). */
  function useLocalDocument() {
    ydoc.transact(() => syncMap(root, snapshot()), LOCAL);
    ready();
  }

  function adopt() {
    try {
      app.doc = normalizeDocument(root.toJSON());
    } catch {
      return; // isi ruang belum lengkap atau rusak: tunggu pembaruan berikutnya
    }
    app.fileHandle = null;
    app.fileName = null;
    ready();
  }

  function ready() {
    collab.status = 'ready';
    undoManager = new Y.UndoManager(root, { trackedOrigins: new Set([LOCAL]), captureTimeout: 400 });
    const flags = () => {
      collab.canUndo = undoManager.undoStack.length > 0;
      collab.canRedo = undoManager.redoStack.length > 0;
    };
    undoManager.on('stack-item-added', flags);
    undoManager.on('stack-item-popped', flags);
    undoManager.on('stack-cleared', flags);
    flags();
  }

  // Protokol sinkronisasi antar-peer:
  //  sv → saat peer baru tersambung, kirim state vector kita; peer membalas dengan pembaruan yang belum kita punya.
  //  up → pembaruan dokumen Yjs. aw → status kehadiran (nama, warna, bagian yang sedang diedit).
  function connectPeers() {
    p2p = joinP2P({ appId: APP_ID, password: room.key, relayConfig: { warnOnRelayFailure: false } }, room.id);
    const sv = p2p.makeAction('sv');
    const up = p2p.makeAction('up');
    const aw = p2p.makeAction('aw');
    const bytes = (d) => (d instanceof Uint8Array ? d : new Uint8Array(d));
    const peerClients = new Map();

    p2p.onPeerJoin = (peerId) => {
      sv.send(Y.encodeStateVector(ydoc), { target: peerId });
      aw.send(encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()]), { target: peerId });
    };
    p2p.onPeerLeave = (peerId) => {
      const ids = [...(peerClients.get(peerId) ?? [])];
      peerClients.delete(peerId);
      if (ids.length) removeAwarenessStates(awareness, ids, REMOTE);
    };
    sv.onMessage = (d, { peerId }) => up.send(Y.encodeStateAsUpdate(ydoc, bytes(d)), { target: peerId });
    up.onMessage = (d) => Y.applyUpdate(ydoc, bytes(d), REMOTE);
    aw.onMessage = (d, { peerId }) => applyAwarenessUpdate(awareness, bytes(d), peerId);

    ydoc.on('update', (u, origin) => {
      if (origin !== REMOTE) up.send(u);
    });
    awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin === 'local') aw.send(encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]));
      else if (typeof origin === 'string') {
        const set = peerClients.get(origin) ?? new Set();
        for (const id of [...added, ...updated]) set.add(id);
        peerClients.set(origin, set);
      }
    });

    const relays = () => (collab.online = Object.values(getRelaySockets()).some((s) => s.readyState === WebSocket.OPEN));
    relays();
    relayTimer = setInterval(relays, 3000);
  }

  // Perubahan dari peserta lain (atau undo/redo) diterapkan ke state Svelte di tempat,
  // lalu posisi kursor di kolom yang sedang difokus dipulihkan.
  function applyRemote() {
    let doc;
    try {
      doc = normalizeDocument(root.toJSON());
    } catch {
      return;
    }
    const sel = captureSelection();
    reconcile(app.doc, doc);
    if (sel) tick().then(() => restoreSelection(sel));
  }

  function updatePeers() {
    if (closed) return;
    collab.peers = [...awareness.getStates()]
      .filter(([id, s]) => id !== ydoc.clientID && s.user?.name)
      .map(([id, s]) => ({ id, name: s.user.name, color: s.user.color, focus: s.focus ?? null }));
  }

  return {
    useLocalDocument,
    /** Dipanggil setiap dokumen lokal berubah: kirim selisihnya ke ruang. */
    push: (doc) => ydoc.transact(() => syncMap(root, doc), LOCAL),
    undo: () => undoManager?.undo(),
    redo: () => undoManager?.redo(),
    setUser: (user) => awareness.setLocalStateField('user', user),
    /** Memberi tahu peserta lain bagian mana yang sedang kita edit. */
    setFocus: (focus) => awareness.setLocalStateField('focus', focus),
    leave() {
      closed = true;
      clearInterval(relayTimer);
      undoManager?.destroy();
      removeAwarenessStates(awareness, [ydoc.clientID], 'local');
      p2p?.leave();
      awareness.destroy();
      idb.destroy();
      ydoc.destroy();
    }
  };
}

const snapshot = () => JSON.parse(JSON.stringify(app.doc));

function captureSelection() {
  const el = document.activeElement;
  if (!el || !('value' in el)) return null;
  try {
    return el.selectionStart == null ? null : { el, value: el.value, start: el.selectionStart, end: el.selectionEnd };
  } catch {
    return null;
  }
}

function restoreSelection({ el, value, start, end }) {
  if (document.activeElement !== el || el.value === value) return;
  const v = el.value;
  let p = 0;
  while (p < v.length && p < value.length && v[p] === value[p]) p++;
  const shift = (x) => (x <= p ? x : Math.max(p, x + v.length - value.length));
  try {
    el.setSelectionRange(shift(start), shift(end));
  } catch {
    // jenis input tanpa seleksi
  }
}
