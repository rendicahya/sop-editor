import { sampleDocument, normalizeDocument } from './model.js';

const KEY = 'sop-editor:doc';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeDocument(JSON.parse(raw));
  } catch {
    // data rusak atau storage tidak tersedia: mulai dari contoh
  }
  return sampleDocument();
}

export const app = $state({
  doc: load(),
  /** Handle File System Access API untuk "Simpan" berikutnya tanpa dialog. */
  fileHandle: null,
  fileName: null
});

export function persist(json) {
  try {
    localStorage.setItem(KEY, json);
  } catch {
    // kuota penuh / mode privat: abaikan, pengguna tetap bisa simpan JSON manual
  }
}
