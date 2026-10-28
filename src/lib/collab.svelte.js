// Kolaborasi real-time: dokumen disinkronkan lewat Yjs (CRDT) antar-browser secara peer-to-peer (WebRTC).
// Browser saling menemukan lewat relay Nostr publik (Trystero), lalu data mengalir langsung antar-peserta.
// Tautan ruang berisi id ruang + kunci; kunci mengenkripsi pesan pencarian peer sehingga hanya pemegang tautan yang bisa bergabung.
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { joinRoom as joinP2P, getRelaySockets } from 'trystero';
import { IndexeddbPersistence } from 'y-indexeddb';
import { tick } from 'svelte';
import { app } from './store.svelte.js';
import { normalizeDocument } from './model.js';
import { syncMap, reconcile } from './ysync.js';

const APP_ID = 'sop-editor-v1';
const USER_KEY = 'sop-editor:user';
const ROOMS_KEY = 'sop-editor:rooms';
const COLORS = ['#d92d20', '#dc6803', '#039855', '#0086c9', '#7a5af8', '#c11574', '#4e5ba6', '#027a48'];
const LOCAL = Symbol('local');
const REMOTE = Symbol('remote');

export const collab = $state({
  /** off | connecting (menunggu isi dokumen dari peserta lain) | ready */
  status: 'off',
  room: null,
  online: false,
  peers: [],
  me: loadUser(),
  canUndo: false,
  canRedo: false
});

let ydoc, root, awareness, p2p, idb, undoManager, relayTimer;

function loadUser() {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY));
    if (u?.name) return u;
  } catch {
    // abaikan
  }
  return { name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] };
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // abaikan
  }
}

function knownRooms() {
  try {
    return JSON.parse(localStorage.getItem(ROOMS_KEY)) ?? [];
  } catch {
    return [];
  }
}

function randomId(bytes) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Membaca undangan dari URL (#room=…&key=…). */
export function inviteFromUrl() {
  const p = new URLSearchParams(location.hash.slice(1));
  const room = p.get('room');
  const key = p.get('key');
  return room && key ? { room, key, known: knownRooms().includes(room) } : null;
}

export function roomLink() {
  return collab.room ? `${location.origin}${location.pathname}#room=${collab.room.id}&key=${collab.room.key}` : '';
}

export function setName(name) {
  collab.me = { ...collab.me, name: name.trim() };
  saveJson(USER_KEY, collab.me);
  awareness?.setLocalStateField('user', collab.me);
}

/** Membuat ruang baru dengan dokumen yang sedang terbuka sebagai isinya. */
export function createRoom() {
  return connect({ id: randomId(9), key: randomId(18) }, true);
}

/** Bergabung ke ruang; dokumen lokal diganti dengan dokumen ruang setelah tersinkron. */
export function joinRoom(invite) {
  return connect({ id: invite.room, key: invite.key }, false);
}

async function connect(room, seed) {
  leaveRoom();
  collab.room = room;
  collab.status = 'connecting';
  history.replaceState(null, '', `#room=${room.id}&key=${room.key}`);
  saveJson(ROOMS_KEY, [room.id, ...knownRooms().filter((r) => r !== room.id)].slice(0, 30));

  ydoc = new Y.Doc();
  root = ydoc.getMap('sop');
  root.observeDeep((_, tr) => {
    if (collab.status === 'connecting') {
      if (root.has('format')) adopt();
    } else if (tr.origin !== LOCAL) {
      applyRemote();
    }
  });

  idb = new IndexeddbPersistence(`${APP_ID}:${room.id}`, ydoc);
  awareness = new Awareness(ydoc);
  awareness.setLocalStateField('user', collab.me);
  awareness.on('change', updatePeers);
  connectPeers(room);

  const current = ydoc;
  await idb.whenSynced;
  if (current !== ydoc || collab.status !== 'connecting') return;
  if (root.has('format')) adopt();
  else if (seed) useLocalDocument();
}

/** Mengisi ruang dengan dokumen lokal (pembuat ruang, atau bila tidak ada peserta lain yang memegang dokumennya). */
export function useLocalDocument() {
  if (!ydoc) return;
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
function connectPeers(room) {
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

export function leaveRoom() {
  clearInterval(relayTimer);
  undoManager?.destroy();
  if (awareness) removeAwarenessStates(awareness, [ydoc.clientID], 'local');
  p2p?.leave();
  awareness?.destroy();
  idb?.destroy();
  ydoc?.destroy();
  ydoc = root = awareness = p2p = idb = undoManager = null;
  Object.assign(collab, { status: 'off', room: null, online: false, peers: [], canUndo: false, canRedo: false });
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

const snapshot = () => JSON.parse(JSON.stringify(app.doc));

/** Dipanggil setiap dokumen lokal berubah: kirim selisihnya ke ruang. */
export function pushLocal(doc) {
  if (collab.status !== 'ready') return;
  ydoc.transact(() => syncMap(root, doc), LOCAL);
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

export function undo() {
  undoManager?.undo();
}

export function redo() {
  undoManager?.redo();
}

/** Memberi tahu peserta lain bagian mana yang sedang kita edit. */
export function setFocus(focus) {
  awareness?.setLocalStateField('focus', focus);
}

function updatePeers() {
  if (!awareness) return;
  collab.peers = [...awareness.getStates()]
    .filter(([id, s]) => id !== ydoc.clientID && s.user?.name)
    .map(([id, s]) => ({ id, name: s.user.name, color: s.user.color, focus: s.focus ?? null }));
}
