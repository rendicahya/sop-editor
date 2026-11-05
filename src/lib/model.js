// Model dokumen SOP. Format JSON yang disimpan/dibuka mengikuti struktur ini.
import { normalizeMarkup, plainText } from './richtext.js';

export const FORMAT = 'sop-editor';
export const VERSION = 1;

export const SHAPES = [
  { value: 'terminator', label: 'Mulai / Selesai' },
  { value: 'process', label: 'Proses' },
  { value: 'decision', label: 'Keputusan' }
];

export const SECTION_DEFS = [
  { key: 'dasarHukum', title: 'DASAR HUKUM' },
  { key: 'kualifikasi', title: 'KUALIFIKASI PELAKSANA' },
  { key: 'keterkaitan', title: 'KETERKAITAN' },
  { key: 'peralatan', title: 'PERALATAN/PERLENGKAPAN' },
  { key: 'peringatan', title: 'PERINGATAN' },
  { key: 'pencatatan', title: 'PENCATATAN DAN PENDATAAN' }
];

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2023-08-07" → "07 Agustus 2023". Teks lain (tanggal revisi dari berkas lama) dicetak apa adanya. */
export function formatTanggal(iso) {
  const m = ISO.exec(iso || '');
  return m ? `${m[3]} ${BULAN[+m[2] - 1] ?? ''} ${m[1]}` : iso || '';
}

/** Menerima tanggal ISO atau teks "07 Agustus 2023" (format lama) dan mengembalikan ISO. */
function toIsoDate(v) {
  if (typeof v !== 'string') return '';
  if (ISO.test(v)) return v;
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(v.trim());
  const mi = m ? BULAN.findIndex((b) => b.toLowerCase() === m[2].toLowerCase()) : -1;
  return mi < 0 ? '' : `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Tanggal hari ini (zona waktu lokal) dalam format ISO. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Kop baku SOP di lingkungan UB (logo UB selalu dicetak, lihat layout.js). */
export const DEFAULT_INSTITUTION = 'KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI\nFAKULTAS ILMU KOMPUTER\nUNIVERSITAS BRAWIJAYA';

// Pengesah default SOP FILKOM: dekan yang sedang menjabat.
export const DEFAULT_PENGESAH = {
  disahkanJabatan: 'DEKAN FAKULTAS ILMU KOMPUTER',
  disahkanNama: 'Ir. Tri Astoto Kurniawan, S.T., M.T., Ph.D., IPM.',
  disahkanNip: 'NIP. 197105182003121001'
};

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function newStep(actorId, shape = 'process') {
  return {
    id: uid(),
    kegiatan: '',
    actor: actorId,
    shape,
    kelengkapan: '',
    waktu: '',
    output: '',
    keterangan: '',
    next: 'auto', // 'auto' = langkah berikutnya, 'none' = tidak ada, atau id langkah
    alt: null, // cabang "tidak" untuk keputusan (id langkah)
    yesLabel: 'Ya',
    noLabel: 'Tidak'
  };
}

/** Menghapus langkah `i`; rujukan alur ke langkah itu dikembalikan ke bawaan. */
export function removeStep(steps, i) {
  const id = steps[i].id;
  steps.splice(i, 1);
  for (const s of steps) {
    if (s.next === id) s.next = 'auto';
    if (s.alt === id) s.alt = null;
  }
}

export function emptyDocument() {
  const actors = [{ id: uid(), name: 'Pelaksana 1' }];
  const sections = {};
  for (const s of SECTION_DEFS) {
    sections[s.key] = { numbered: !['peringatan', 'pencatatan'].includes(s.key), items: [] };
  }
  return {
    format: FORMAT,
    version: VERSION,
    header: {
      institution: DEFAULT_INSTITUTION,
      nomor: 'UN10/F15/',
      tglPembuatan: todayIso(),
      tglRevisi: '',
      tglEfektif: todayIso(),
      ...DEFAULT_PENGESAH,
      namaSop: ''
    },
    sections,
    actors,
    steps: [
      { ...newStep(actors[0].id, 'terminator'), kegiatan: 'Mulai' },
      { ...newStep(actors[0].id, 'terminator'), kegiatan: 'Selesai' }
    ]
  };
}

/** Kolom langkah yang boleh berformat tebal/miring/garis bawah. */
export const RICH_STEP = new Set(['kegiatan', 'kelengkapan', 'waktu', 'output', 'keterangan']);

// Sinonim bentuk yang sering dipakai AI atau manusia.
const SHAPE_ALIAS = {
  start: 'terminator', end: 'terminator', mulai: 'terminator', selesai: 'terminator', terminal: 'terminator',
  proses: 'process', activity: 'process', task: 'process',
  keputusan: 'decision', condition: 'decision', kondisi: 'decision'
};

/**
 * Membaca teks JSON dokumen. Toleran terhadap jawaban AI yang tersalin bersama pembungkus
 * ```json … ``` atau kalimat pengantar: yang diambil adalah objek JSON terluar.
 */
export function parseDocumentText(text) {
  const t = String(text).trim();
  try {
    return normalizeDocument(JSON.parse(t));
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = fenced ? fenced[1] : t;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) throw new SyntaxError('Teks tidak berisi JSON.');
  return normalizeDocument(JSON.parse(body.slice(a, b + 1)));
}

/** Memvalidasi & melengkapi JSON yang dibuka agar aman dipakai editor. */
export function normalizeDocument(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Berkas bukan JSON dokumen SOP.');
  if (raw.format != null && raw.format !== FORMAT) throw new Error('Berkas JSON ini bukan dokumen SOP Editor.');
  if (!Array.isArray(raw.steps)) throw new Error('Struktur dokumen SOP tidak lengkap: daftar "steps" tidak ditemukan.');

  const base = emptyDocument();
  const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
  // Isian konten boleh berformat (<b>, <i>, <u>); isian lain selalu teks polos.
  const rich = (v) => normalizeMarkup(str(v));
  const plain = (v) => plainText(rich(v));
  const header = { ...base.header };
  // Hanya kolom teks yang dikenal yang dibaca, jadi tanda tangan dari berkas lama tidak ikut terbawa.
  for (const k of Object.keys(header)) header[k] = plain(raw.header?.[k]);
  header.tglPembuatan = toIsoDate(header.tglPembuatan);
  header.tglEfektif = toIsoDate(header.tglEfektif);
  // Tanggal revisi dulu teks bebas: dikonversi bila bisa, selain itu teksnya dipertahankan.
  header.tglRevisi = toIsoDate(header.tglRevisi) || header.tglRevisi.trim();

  const sections = {};
  for (const s of SECTION_DEFS) {
    const src = raw.sections?.[s.key];
    const items = Array.isArray(src) ? src : src?.items;
    sections[s.key] = {
      numbered: typeof src?.numbered === 'boolean' ? src.numbered : base.sections[s.key].numbered,
      items: Array.isArray(items) ? items.map(rich) : []
    };
  }

  // Pelaksana boleh berupa objek {id, name} atau sekadar nama.
  const actors = [];
  const usedIds = new Set();
  const freshId = (id) => {
    let v = str(id).trim();
    if (!v || usedIds.has(v)) v = uid();
    usedIds.add(v);
    return v;
  };
  for (const x of Array.isArray(raw.actors) ? raw.actors : []) {
    const name = plain(typeof x === 'string' ? x : x?.name);
    actors.push({ id: freshId(typeof x === 'string' ? '' : x?.id), name });
  }
  // `actor` di langkah boleh berisi id atau nama pelaksana; nama yang belum ada ditambahkan.
  const findActor = (v) => {
    const key = str(v).trim();
    if (!key) return null;
    const lower = key.toLowerCase();
    let a = actors.find((x) => x.id === key) ?? actors.find((x) => x.name.trim().toLowerCase() === lower);
    if (!a) actors.push((a = { id: freshId(''), name: key }));
    return a.id;
  };
  const stepActors = raw.steps.map((s) => findActor(s?.actor));
  // `with`: pelaksana lain pada kegiatan bersama (id atau nama), tanpa pelaksana utama dan tanpa duplikat.
  const stepWith = raw.steps.map((s, i) => {
    const list = Array.isArray(s?.with) ? s.with : s?.with ? [s.with] : [];
    return [...new Set(list.map(findActor).filter((id) => id && id !== stepActors[i]))];
  });
  if (!actors.length) actors.push(...base.actors);

  usedIds.clear();
  const steps = raw.steps.map((s, i) => {
    const d = newStep(actors[0].id);
    const step = { ...d };
    for (const k of Object.keys(d)) if (k !== 'next' && k !== 'alt' && s?.[k] != null) step[k] = RICH_STEP.has(k) ? rich(s[k]) : plain(s[k]);
    step.id = freshId(s?.id);
    step.actor = stepActors[i] ?? actors[0].id;
    if (stepWith[i].length && stepActors[i]) step.with = stepWith[i];
    const shape = step.shape.trim().toLowerCase();
    step.shape = SHAPES.some((x) => x.value === shape) ? shape : (SHAPE_ALIAS[shape] ?? 'process');
    return step;
  });

  // `next`/`alt` boleh berisi id langkah, nomor urut langkah (1, 2, …), atau nama kegiatan.
  const ids = new Map(raw.steps.map((s, i) => [str(s?.id).trim(), steps[i].id]).filter(([k]) => k));
  const target = (v) => {
    if (v == null || v === '') return null;
    const key = str(v).trim();
    if (ids.has(key)) return ids.get(key);
    if (/^\d+$/.test(key) && steps[+key - 1]) return steps[+key - 1].id;
    return steps.find((t) => plainText(t.kegiatan).trim().toLowerCase() === plainText(key).toLowerCase())?.id ?? null;
  };
  raw.steps.forEach((s, i) => {
    const n = str(s?.next).trim().toLowerCase();
    steps[i].next = !n || n === 'auto' ? 'auto' : n === 'none' ? 'none' : (target(s.next) ?? 'auto');
    steps[i].alt = target(s?.alt);
    const route = normalizeRoute(s?.route, actors, ids);
    if (route) steps[i].route = route;
  });

  return { format: FORMAT, version: VERSION, header, sections, actors, steps };
}

const EXIT_SIDES = ['bottom', 'left', 'right'];
const ENTRY_SIDES = ['top', 'bottom', 'left', 'right'];

/**
 * Jalur manual garis alur per cabang (`next`, `alt`): sisi keluar (`from`), sisi masuk (`to`),
 * posisi ruas tegak `x` ({ actor, f }) dan ruas mendatar `y` ({ step, f }), f = pecahan 0–1 lebar lajur/tinggi baris.
 */
function normalizeRoute(raw, actors, ids) {
  if (!raw || typeof raw !== 'object') return null;
  const frac = (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : null);
  const out = {};
  for (const b of ['next', 'alt']) {
    const r = raw[b];
    if (!r || typeof r !== 'object') continue;
    const o = {};
    if (EXIT_SIDES.includes(r.from)) o.from = r.from;
    if (ENTRY_SIDES.includes(r.to)) o.to = r.to;
    if (actors.some((a) => a.id === r.x?.actor) && frac(r.x.f) !== null) o.x = { actor: r.x.actor, f: r.x.f };
    const step = ids.get(String(r.y?.step ?? ''));
    if (step && frac(r.y.f) !== null) o.y = { step, f: r.y.f };
    if (Object.keys(o).length) out[b] = o;
  }
  return Object.keys(out).length ? out : null;
}
