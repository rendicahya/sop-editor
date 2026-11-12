// Membaca berkas .sop/.json yang diseret ke Pustaka Daring, termasuk yang dikemas dalam ZIP.
import { unzipSync, strFromU8 } from 'fflate';
import { parseDocumentText } from './model.js';

const MAX_FILES = 500;
const MAX_FILE_BYTES = 5e6; // jauh di atas batas satu SOP di Pustaka Daring; yang lebih besar jelas bukan SOP
const isSop = (name) => /\.(sop|json)$/i.test(name);
const isZip = (file) => /\.zip$/i.test(file.name) || /zip/.test(file.type);
const baseName = (name) => name.replace(/\.(sop|json)$/i, '').trim();

/**
 * Hasil: { items: [{ name, dirs, doc, title }], bad: [nama], other: jumlah berkas lain yang diabaikan }.
 * `dirs`: folder di dalam ZIP tempat berkas itu berada (kosong untuk berkas yang diseret langsung).
 * `title`: diisi nama berkas bila Nama SOP di dalam dokumen kosong.
 */
export async function readSopFiles(files) {
  const items = [];
  const bad = [];
  let other = 0;
  const add = (name, dirs, text) => {
    try {
      const doc = parseDocumentText(text);
      items.push({ name, dirs, doc, title: String(doc.header?.namaSop ?? '').trim() ? undefined : baseName(name.split('/').pop()) || undefined });
    } catch {
      bad.push(name);
    }
  };
  const tooMany = () => new Error(`Terlalu banyak berkas SOP sekaligus (maksimal ${MAX_FILES}). Bagi menjadi beberapa ZIP.`);

  for (const file of files) {
    if (isZip(file)) {
      let entries;
      try {
        let n = items.length;
        entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
          filter: (f) => {
            if (f.name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(f.name)) return false;
            if (!isSop(f.name) || f.originalSize > MAX_FILE_BYTES) return (other++, false);
            if (++n > MAX_FILES) throw tooMany();
            return true;
          }
        });
      } catch (e) {
        if (e.message.startsWith('Terlalu banyak')) throw e;
        throw new Error(`${file.name} bukan berkas ZIP yang bisa dibaca.`);
      }
      const names = Object.keys(entries).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
      for (const path of names) {
        const parts = path.split('/').map((p) => p.trim()).filter(Boolean);
        const dirs = parts.slice(0, -1).map((d) => d.slice(0, 120).trim());
        add(path, dirs, strFromU8(entries[path]));
      }
    } else if (isSop(file.name) && file.size <= MAX_FILE_BYTES) {
      if (items.length >= MAX_FILES) throw tooMany();
      add(file.name, [], await file.text());
    } else {
      other++;
    }
  }
  return { items, bad, other };
}
