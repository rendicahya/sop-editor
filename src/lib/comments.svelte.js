// Komentar peninjauan pada SOP Pustaka Daring (disimpan di Firestore, lihat faculty.svelte.js). Modul ini menyimpan
// komentar SOP yang sedang dibuka dan menghubungkan isian halaman dengan panel komentar.
import { plainText } from './richtext.js';
import { SECTION_DEFS, formatTanggal } from './model.js';

/**
 * sopId: SOP daring tab aktif (null: tab bukan SOP daring). list: semua komentar dan balasannya.
 * status: idle | loading | ready | error. marked: isian (data-field) yang punya komentar terbuka.
 * focus: isian halaman yang terakhir diklik. request: { ref } permintaan berkomentar dari menu klik kanan.
 */
export const notes = $state({ sopId: null, list: [], status: 'idle', error: '', marked: new Set(), focus: null, request: null });

/** Dari menu klik kanan isian: buka panel komentar dengan komentar baru untuk isian `ref`. */
export const commentOn = (ref) => (notes.request = { ref });

const HEADER = {
  namaSop: 'Nama SOP', nomor: 'Nomor SOP', institution: 'Nama instansi', tglPembuatan: 'Tanggal pembuatan', tglRevisi: 'Tanggal revisi',
  tglEfektif: 'Tanggal efektif', disahkanJabatan: 'Jabatan pengesah', disahkanNama: 'Nama pengesah', disahkanNip: 'NIP pengesah'
};
const STEP = { kegiatan: 'Kegiatan', kelengkapan: 'Kelengkapan', waktu: 'Waktu', output: 'Output', keterangan: 'Keterangan' };
const short = (t, n = 200) => {
  const s = plainText(String(t ?? '')).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
};
const sentence = (t) => t.charAt(0) + t.slice(1).toLowerCase();

/** { label, quote } isian `ref` pada dokumen saat ini; null bila isiannya sudah tidak ada. Tanpa `ref`: seluruh SOP. */
export function describeAnchor(doc, ref) {
  if (!ref) return { label: 'Seluruh SOP', quote: '' };
  const [kind, a, b] = ref.split(':');
  if (kind === 'h' || kind === 'd') {
    if (!(a in doc.header)) return null;
    return { label: HEADER[a] ?? a, quote: kind === 'd' ? formatTanggal(doc.header[a]) : short(doc.header[a]) };
  }
  if (kind === 's' || kind === 'sh' || kind === 'sb') {
    const def = SECTION_DEFS.find((d) => d.key === a);
    if (!def) return null;
    const title = sentence(def.title);
    if (kind !== 's') return { label: title, quote: '' };
    const items = doc.sections[a].items;
    const i = Number(b);
    return i < items.length ? { label: `${title} butir ${i + 1}`, quote: short(items[i]) } : null;
  }
  if (kind === 'a') {
    const i = doc.actors.findIndex((x) => x.id === a);
    return i < 0 ? null : { label: `Pelaksana ${i + 1}`, quote: short(doc.actors[i].name) };
  }
  if (kind === 'st' || kind === 'sy') {
    const i = doc.steps.findIndex((s) => s.id === a);
    if (i < 0) return null;
    const s = doc.steps[i];
    if (kind === 'sy') return { label: `Langkah ${i + 1} · Simbol`, quote: short(s.kegiatan) };
    return b in STEP ? { label: `Langkah ${i + 1} · ${STEP[b]}`, quote: short(s[b]) } : null;
  }
  return null;
}

/**
 * Isian yang dikomentari `c` pada dokumen saat ini, atau null bila sudah tidak ada. Butir bagian dirujuk lewat
 * nomor urutnya, jadi bila butir disisipi atau diurutkan ulang, butir yang teksnya sama dengan saat dikomentari dipakai.
 */
export function currentRef(doc, c) {
  if (!c.anchor) return null;
  const [kind, key, idx] = c.anchor.split(':');
  if (kind === 's' && c.quote && doc.sections[key]) {
    const items = doc.sections[key].items;
    if (short(items[Number(idx)]) !== c.quote) {
      const j = items.findIndex((t) => short(t) === c.quote);
      if (j >= 0) return `s:${key}:${j}`;
    }
  }
  return describeAnchor(doc, c.anchor) ? c.anchor : null;
}
