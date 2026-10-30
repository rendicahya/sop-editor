// Estimasi total waktu proses dari kolom Waktu (mutu baku) setiap langkah.
// Satuan dijumlahkan terpisah (menit digabung ke jam, minggu/bulan tidak diubah ke hari) karena
// "1 hari" di SOP bisa berarti hari kerja; yang dikonversi hanya yang pasti (detik → menit → jam).
import { plainText } from './richtext.js';

const UNITS = [
  ['bulan', /^(bulan|bln)$/],
  ['minggu', /^(minggu|mgg|pekan)$/],
  ['hari', /^(hari|hr)$/],
  ['jam', /^(jam|j)$/],
  ['menit', /^(menit|mnt|mins?)$/],
  ['detik', /^(detik|dtk)$/]
];
const WORDS = { setengah: 0.5, satu: 1, se: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10 };
const NUM = String.raw`(?<![a-z\d])(\d+(?:[.,]\d+)?|½|${Object.keys(WORDS).join('|')})`;
const RANGE = String.raw`\s*(?:-|–|—|s\.?\s?d\.?|sampai|hingga|atau)\s*`;
const PART = new RegExp(String.raw`${NUM}(?:${RANGE}${NUM})?\s*([a-z]+)\.?`, 'gi');

const num = (s) => (s === '½' ? 0.5 : WORDS[s.toLowerCase()] ?? parseFloat(s.replace(',', '.')));
const unitOf = (w) => UNITS.find(([, re]) => re.test(w.toLowerCase()))?.[0];

/**
 * Membaca teks waktu seperti "5 Menit", "1-2 hari kerja", "1 jam 30 menit", "maks. 3 hari".
 * Hasil: null bila kosong, false bila tidak terbaca, atau { min: {satuan: n}, max: {satuan: n} }.
 */
export function parseDuration(text) {
  const t = plainText(text ?? '')
    .trim()
    .replace(/(\d+)\s*[x×]\s*(\d+)/gi, (_, a, b) => String(a * b)) // "1x24 jam"
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_, a, b) => String(a / b)); // "1/2 hari"
  if (!t) return null;
  const min = {};
  const max = {};
  let found = false;
  let rest = t;
  for (const m of t.matchAll(PART)) {
    const unit = unitOf(m[3]);
    if (!unit) continue;
    const a = num(m[1]);
    const b = m[2] ? num(m[2]) : a;
    if (![a, b].every((v) => Number.isFinite(v) && v >= 0)) continue;
    min[unit] = (min[unit] ?? 0) + Math.min(a, b);
    max[unit] = (max[unit] ?? 0) + Math.max(a, b);
    found = true;
    rest = rest.replace(m[0], ' ');
  }
  // Angka yang tersisa tanpa satuan (mis. "3") membuat hasilnya meragukan.
  if (!found || /\d/.test(rest)) return false;
  return { min, max };
}

function add(total, part) {
  for (const k of ['min', 'max']) for (const [u, v] of Object.entries(part[k])) total[k][u] = (total[k][u] ?? 0) + v;
}

/** Detik → menit, menit ≥ 60 → jam (konversi yang pasti saja). */
function normalize(t) {
  const o = { ...t };
  if (o.detik) (o.menit = (o.menit ?? 0) + o.detik / 60), delete o.detik;
  if (o.menit >= 60) {
    o.jam = (o.jam ?? 0) + Math.floor(o.menit / 60);
    o.menit %= 60;
    if (!o.menit) delete o.menit;
  }
  return o;
}

const fmt = (v) => (Math.round(v * 100) / 100).toLocaleString('id-ID');

/** Teks total, mis. "21 hari 5 menit" atau "3–5 hari 2 jam". */
export function formatDuration(total) {
  const min = normalize(total.min);
  const max = normalize(total.max);
  const out = [];
  for (const [u] of UNITS) {
    const a = min[u] ?? 0;
    const b = max[u] ?? 0;
    if (!a && !b) continue;
    out.push(Math.abs(a - b) < 1e-9 ? `${fmt(a)} ${u}` : `${fmt(a)}–${fmt(b)} ${u}`);
  }
  return out.join(' ');
}

/**
 * Jalur utama: dari langkah pertama mengikuti alur "lanjut ke" (cabang Ya pada keputusan) sampai
 * akhir alur; putaran balik dan cabang Tidak tidak dihitung.
 */
export function mainPath(steps) {
  const idx = new Map(steps.map((s, i) => [s.id, i]));
  const path = [];
  const seen = new Set();
  for (let i = steps.length ? 0 : null; i != null && !seen.has(i); ) {
    seen.add(i);
    path.push(i);
    const s = steps[i];
    i = s.next === 'auto' ? (i + 1 < steps.length ? i + 1 : null) : s.next === 'none' ? null : idx.get(s.next) ?? null;
  }
  return path;
}

/**
 * Estimasi waktu dokumen: { text, steps (jumlah langkah di jalur utama), counted, skipped (langkah lain),
 * unread: [index] (waktu tak terbaca), empty: [index] (waktu kosong, selain Mulai/Selesai) }.
 */
export function estimateDuration(doc) {
  const steps = doc.steps;
  const path = mainPath(steps);
  const total = { min: {}, max: {} };
  const unread = [];
  const empty = [];
  let counted = 0;
  for (const i of path) {
    const d = parseDuration(steps[i].waktu);
    if (d) add(total, d), counted++;
    else if (d === false) unread.push(i);
    else if (steps[i].shape !== 'terminator') empty.push(i);
  }
  return { text: formatDuration(total), steps: path.length, counted, skipped: steps.length - path.length, unread, empty };
}
