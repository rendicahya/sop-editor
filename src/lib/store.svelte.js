import { sampleDocument, normalizeDocument } from './model.js';

const KEY = 'sop-editor:doc';
const TABS_KEY = 'sop-editor:tabs';

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null; // data rusak atau storage tidak tersedia
  }
}

function valid(raw) {
  try {
    return raw ? normalizeDocument(raw) : null;
  } catch {
    return null;
  }
}

export const newTabId = () => Math.random().toString(36).slice(2, 10);

/**
 * Isi tab yang tidak aktif (di luar state reaktif): id → { json, handle, past, future }.
 * Dokumen tab aktif selalu ada di app.doc.
 */
export const stash = new Map();

// Tab tersimpan: { active, tabs: [{ id, fileName, json }] }; dokumen tab aktif disimpan terpisah di KEY.
const saved = read(TABS_KEY);
const list = [];
for (const t of Array.isArray(saved?.tabs) ? saved.tabs : []) {
  if (!t?.id) continue;
  if (t.id === saved.active) list.push({ id: t.id, title: '', fileName: t.fileName ?? null });
  else {
    const doc = valid(safeParse(t.json));
    if (!doc) continue;
    list.push({ id: t.id, title: doc.header.namaSop, fileName: t.fileName ?? null });
    stash.set(t.id, { json: JSON.stringify(doc), handle: null, past: [], future: [] });
  }
}
let active = list.find((t) => t.id === saved?.active);
if (!active) list.unshift((active = { id: newTabId(), title: '', fileName: null }));

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const app = $state({
  doc: valid(read(KEY)) ?? sampleDocument(),
  /** Handle File System Access API untuk "Simpan" berikutnya tanpa dialog. */
  fileHandle: null,
  fileName: active.fileName
});

/** Daftar tab (judul tab aktif dibaca langsung dari app.doc). */
export const tabs = $state({ active: active.id, list });

export function persist(json) {
  try {
    localStorage.setItem(KEY, json);
    localStorage.setItem(
      TABS_KEY,
      JSON.stringify({
        active: tabs.active,
        tabs: tabs.list.map((t) =>
          t.id === tabs.active ? { id: t.id, fileName: app.fileName } : { id: t.id, fileName: t.fileName, json: stash.get(t.id)?.json }
        )
      })
    );
  } catch {
    // kuota penuh / mode privat: abaikan, pengguna tetap bisa simpan JSON manual
  }
}
