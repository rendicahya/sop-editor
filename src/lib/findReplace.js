import { SECTION_DEFS } from './model.js';

const HEADER_FIELDS = [
  ['institution', 'Nama instansi'],
  ['namaSop', 'Nama SOP'],
  ['nomor', 'Nomor SOP'],
  ['disahkanJabatan', 'Jabatan pengesah'],
  ['disahkanNama', 'Nama pengesah'],
  ['disahkanNip', 'NIP pengesah']
];

const STEP_FIELDS = [
  ['kegiatan', 'Kegiatan'],
  ['kelengkapan', 'Kelengkapan'],
  ['waktu', 'Waktu'],
  ['output', 'Output'],
  ['keterangan', 'Keterangan'],
  ['yesLabel', 'Label ya'],
  ['noLabel', 'Label tidak']
];

/**
 * Semua kolom teks dokumen yang bisa dicari: { obj, key, label, tab } untuk kolom di panel editor,
 * atau { obj, key, label, ref } untuk isian halaman identitas (ref = data-field di pratinjau).
 */
export function textFields(doc) {
  const out = [];
  for (const [key, label] of HEADER_FIELDS) out.push({ obj: doc.header, key, label, ref: 'h:' + key });
  for (const { key: sec, title } of SECTION_DEFS) {
    const items = doc.sections[sec]?.items ?? [];
    items.forEach((_, i) => out.push({ obj: items, key: i, label: `${title} · butir ${i + 1}`, ref: `s:${sec}:${i}` }));
  }
  doc.actors.forEach((a, i) => out.push({ obj: a, key: 'name', label: `Pelaksana ${i + 1}`, tab: 'pelaksana' }));
  doc.steps.forEach((s, i) => {
    for (const [key, label] of STEP_FIELDS) {
      if (s.shape !== 'decision' && (key === 'yesLabel' || key === 'noLabel')) continue;
      out.push({ obj: s, key, label: `Langkah ${i + 1} · ${label}`, tab: 'langkah' });
    }
  });
  return out.filter((f) => typeof f.obj[f.key] === 'string');
}

export function searchPattern(query, caseSensitive) {
  if (!query) return null;
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
}

/** Kolom yang cocok beserta potongan teks: [{ field, count, parts: [{ text, hit }] }]. */
export function findMatches(doc, pattern) {
  if (!pattern) return [];
  const results = [];
  for (const field of textFields(doc)) {
    const value = field.obj[field.key];
    const parts = [];
    let last = 0;
    let count = 0;
    for (const m of value.matchAll(pattern)) {
      parts.push({ text: value.slice(last, m.index), hit: false }, { text: m[0], hit: true });
      last = m.index + m[0].length;
      count++;
    }
    if (!count) continue;
    parts.push({ text: value.slice(last), hit: false });
    results.push({ field, count, parts: clip(parts) });
  }
  return results;
}

// Potong teks panjang di sekitar kecocokan agar daftar hasil tetap ringkas.
function clip(parts, ctx = 40) {
  return parts.map((p, i) => {
    if (p.hit || p.text.length <= ctx * 2) return p;
    const t = p.text.replace(/\s+/g, ' ');
    if (i === 0) return { ...p, text: '…' + t.slice(-ctx) };
    if (i === parts.length - 1) return { ...p, text: t.slice(0, ctx) + '…' };
    return { ...p, text: t.slice(0, ctx) + ' … ' + t.slice(-ctx) };
  });
}

/** Ganti semua kecocokan di satu kolom; mengembalikan jumlah penggantian. */
export function replaceIn(field, pattern, replacement) {
  const value = field.obj[field.key];
  let n = 0;
  const next = value.replace(pattern, () => (n++, replacement));
  if (n) field.obj[field.key] = next;
  return n;
}
