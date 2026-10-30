// Pustaka dokumen: semua SOP yang pernah diedit tersimpan otomatis di IndexedDB browser ini.
// Entri: { id, kind: 'doc' | 'template', title, nomor, fileName, created, updated, json, tags }.
// `tags` (label pengelompokan) hanya ada di pustaka, tidak ikut tersimpan di berkas .sop.
// Dokumen tab memakai id tab sebagai id entri, jadi setiap perubahan tab memperbarui entrinya sendiri.

const DB = 'sop-editor-library';
const STORE = 'docs';

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const getEntry = (id) => run('readonly', (s) => s.get(id));
export const deleteEntry = (id) => run('readwrite', (s) => s.delete(id));
export const putEntry = (entry) => run('readwrite', (s) => s.put(entry));

/** Mengubah sebagian kolom entri dalam satu transaksi (tidak bertabrakan dengan simpan otomatis). */
export const patchEntry = (id, patch) =>
  run('readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => req.result && s.put({ ...req.result, ...patch });
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

/** Semua entri, terbaru di atas (isi `json` ikut dibaca untuk pencarian). */
export async function listEntries() {
  const all = (await run('readonly', (s) => s.getAll())) ?? [];
  return all.sort((a, b) => b.updated - a.updated);
}

/** Dokumen yang belum berisi apa-apa (dokumen baru) tidak perlu masuk pustaka. */
export function isBlank(doc) {
  return !doc.header.namaSop && doc.steps.length <= 2 && Object.values(doc.sections).every((s) => !s.items.length);
}

/** Menyimpan dokumen tab `id`; dilewati bila kosong atau isinya sama dengan yang tersimpan. */
export async function saveDoc(id, json, fileName = null) {
  const doc = JSON.parse(json);
  // Baca dan tulis dalam satu transaksi agar label yang baru diubah di dialog Pustaka tidak tertimpa.
  await run('readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      const old = req.result;
      if (old && old.json === json && old.fileName === fileName) return;
      if (!old && isBlank(doc)) return;
      const now = Date.now();
      s.put({
        id,
        kind: 'doc',
        title: doc.header.namaSop,
        nomor: doc.header.nomor,
        fileName,
        created: old?.created ?? now,
        updated: old && old.json === json ? old.updated : now,
        json,
        tags: old?.tags ?? []
      });
    };
    return req;
  });
}

// Penyimpanan otomatis ditunda sebentar agar tidak menulis di setiap ketikan.
const pending = new Map();
export function queueSave(id, json, fileName) {
  clearTimeout(pending.get(id)?.timer);
  pending.set(id, { json, fileName, timer: setTimeout(() => flush(id), 600) });
}

export function flush(id) {
  const p = pending.get(id);
  if (!p) return Promise.resolve();
  clearTimeout(p.timer);
  pending.delete(id);
  return saveDoc(id, p.json, p.fileName).catch(() => {}); // storage tidak tersedia: tab tetap ada di localStorage
}

export function flushAll() {
  return Promise.all([...pending.keys()].map(flush));
}
