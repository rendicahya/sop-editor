// Pustaka dokumen di IndexedDB browser ini. Isi entri hanya berubah saat pengguna menyimpan.
// Entri: { id, title, nomor, fileName, created, updated, json, tags, folder, deleted?, fromPath? }.
// Entri lama bisa masih punya kolom kind (tidak dipakai lagi) dan belum punya folder (= Utama).
// `tags` (label) dan `folder` hanya ada di pustaka, tidak ikut tersimpan di berkas .sop.
// `deleted` (waktu dihapus) menandai entri di "Baru dihapus"; setelah BIN_DAYS hari entri itu dihapus permanen.
// Dokumen tab memakai id tab sebagai id entri, jadi menyimpan tab memperbarui entrinya sendiri.
// Folder: { id, name, parent } di simpanan terpisah; parent null = Utama.

import { plainText } from './richtext.js';

export const BIN_DAYS = 30;
const DAY = 86400000;

/** Teks yang dicari: nama, nomor, berkas, label, pelaksana, kegiatan, dan butir ketentuan. */
export function haystack(e) {
  const parts = [e.title, e.nomor, e.fileName, ...(e.tags ?? [])];
  try {
    const d = JSON.parse(e.json);
    parts.push(...d.actors.map((a) => a.name), ...d.steps.map((s) => plainText(s.kegiatan)));
    for (const s of Object.values(d.sections)) parts.push(...s.items.map((i) => plainText(i.text ?? i)));
  } catch {}
  return parts.filter((p) => typeof p === 'string').join('\n').toLowerCase();
}

const DB = 'sop-editor-library';
const STORE = 'docs';
const FOLDERS = 'folders';

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(FOLDERS)) d.createObjectStore(FOLDERS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn, store = STORE) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** Entri yang aktif (yang ada di "Baru dihapus" dianggap tidak ada). */
export const getEntry = async (id) => {
  const e = await run('readonly', (s) => s.get(id));
  return e && !e.deleted ? e : undefined;
};
export const deleteEntry = (id) => run('readwrite', (s) => s.delete(id));
export const putEntry = (entry) => run('readwrite', (s) => s.put(entry));

/** Mengubah sebagian kolom entri dalam satu transaksi (tidak bertabrakan dengan penyimpanan dokumen). */
export const patchEntry = (id, patch) =>
  run('readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      if (!req.result) return;
      const next = { ...req.result, ...patch };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete next[k];
      s.put(next);
    };
    return req;
  });

/** Label unik dan rapi: spasi dipangkas, tanpa duplikat (tidak peka huruf besar/kecil), urut abjad. */
export function cleanTags(tags) {
  const seen = new Map();
  for (const t of tags ?? []) {
    const v = String(t).trim().replace(/\s+/g, ' ');
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'id'));
}

/**
 * Semua entri, terbaru di atas (isi `json` ikut dibaca untuk pencarian), termasuk yang ada di "Baru dihapus".
 * Entri yang sudah lebih dari BIN_DAYS hari di sana dihapus permanen di sini.
 */
export async function listEntries() {
  const all = (await run('readonly', (s) => s.getAll())) ?? [];
  const limit = Date.now() - BIN_DAYS * DAY;
  const old = all.filter((e) => e.deleted && e.deleted < limit);
  if (old.length) await run('readwrite', (s) => old.forEach((e) => s.delete(e.id)));
  return all.filter((e) => !old.includes(e)).sort((a, b) => b.updated - a.updated);
}

/** Sisa hari sebelum entri di "Baru dihapus" terhapus permanen. */
export const binDaysLeft = (e) => Math.max(1, Math.ceil((e.deleted + BIN_DAYS * DAY - Date.now()) / DAY));

// ---- Folder ----
export const listFolders = async () => (await run('readonly', (s) => s.getAll(), FOLDERS)) ?? [];
export const putFolder = (f) => run('readwrite', (s) => s.put(f), FOLDERS);
export const deleteFolders = (ids) => run('readwrite', (s) => ids.forEach((id) => s.delete(id)), FOLDERS);

/** Nama folder rapi: spasi dipangkas, tanpa garis miring (dipakai sebagai pemisah jalur ZIP). */
export const cleanFolderName = (name) =>
  String(name ?? '')
    .replace(/[\\/]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);

/** Dokumen yang belum berisi apa-apa (dokumen baru) tidak perlu masuk pustaka. */
export function isBlank(doc) {
  return !doc.header.namaSop && doc.steps.length <= 2 && Object.values(doc.sections).every((s) => !s.items.length);
}

/** Menyimpan dokumen tab `id`; dilewati bila isinya sama dengan yang tersimpan atau dokumen baru masih kosong. */
export async function saveDoc(id, json, fileName = null) {
  const doc = JSON.parse(json);
  // Baca dan tulis dalam satu transaksi agar label/folder yang baru diubah di dialog Pustaka tidak tertimpa.
  await run('readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      // Entri di "Baru dihapus" yang disimpan lagi dari tabnya kembali menjadi entri biasa.
      const old = req.result;
      if (old && !old.deleted && old.json === json && old.fileName === fileName) return;
      if (!old && isBlank(doc)) return;
      const now = Date.now();
      s.put({
        id,
        title: doc.header.namaSop,
        nomor: doc.header.nomor,
        fileName,
        created: old?.created ?? now,
        updated: old && old.json === json ? old.updated : now,
        json,
        tags: old?.tags ?? [],
        folder: old?.folder ?? null
      });
    };
    return req;
  });
}
