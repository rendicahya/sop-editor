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
      signature: null,
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

export function sampleDocument() {
  const a = ['Mahasiswa', 'Operator Akademik', 'Ketua Program Studi', 'Dosen Pembimbing', 'Sekretaris Departemen'].map(
    (name, i) => ({ id: 'a' + (i + 1), name })
  );
  const [MHS, OPR, KPS, DSN, SEK] = a.map((x) => x.id);
  const rows = [
    ['Upload Pra Proposal', MHS, 'terminator', 'FILKOM Apps', '5 Menit', 'dokumen pra proposal', 'Mahasiswa unggah pra proposal di FILKOM Apps'],
    ['Persetujuan Pra Proposal', DSN, 'decision', 'FILKOM Apps', '3 Hari', 'dokumen pra proposal', 'Calon dosen pembimbing 1 melakukan cek dan persetujuan pada dokumen pra proposal skripsi di FILKOM Apps', 'Disetujui', 'Tidak Disetujui', 1],
    ['Upload Proposal', OPR, 'process', 'FILKOM Apps, Proposal Skripsi', '1 Hari', 'Proposal Skripsi', 'Mahasiswa unggah proposal di FILKOM Apps'],
    ['Verifikasi dan Validasi Akademik', KPS, 'decision', 'FILKOM Apps, SIAKAD', '1 Hari', 'KRS, SKS Lulus', 'Operator Akademik melakukan cek SKS lulus, Mata kuliah Skripsi mahasiswa di KRS', 'Valid', 'Tidak Valid', 3],
    ['Penentuan Dosen Pembimbing', KPS, 'process', 'FILKOM Apps', '1 Hari', 'Dosen pembimbing terpilih', 'Ketua Program Studi menentukan dosen pembimbing ke 2'],
    ['Penerbitan Surat Tugas', OPR, 'process', 'FILKOM Apps', '1 Hari', 'Surat Tugas Pembimbing Skripsi', 'Operator Akademik menerbitkan Surat Tugas Pembimbing Skripsi'],
    ['Presentasi Proposal (P0)', MHS, 'process', 'FILKOM Apps', '1 Hari', 'Proposal Skripsi', 'Mahasiswa presentasi ke dosen pembimbing skripsi'],
    ['Presentasi Progress ke 1 (P1)', MHS, 'process', 'FILKOM Apps', '1 Hari', 'Skripsi', 'Mahasiswa presentasi ke dosen pembimbing skripsi'],
    ['Presentasi Progress ke 2 (P2)', MHS, 'process', 'FILKOM Apps', '1 Hari', 'Skripsi', 'Mahasiswa presentasi ke dosen pembimbing skripsi'],
    ['Pendaftaran Seminar Hasil dan Sidang', MHS, 'process', 'FILKOM Apps', '1 Hari', 'Skripsi', 'Mahasiswa mengajukan seminar hasil dan sidang skripsi di FILKOM Apps'],
    ['Persetujuan Pengajuan Seminar Hasil dan Sidang Skripsi', DSN, 'process', 'FILKOM Apps', '3 Hari', 'Skripsi', 'Dosen pembimbing memproses persetujuan pengajuan seminar hasil dan sidang skripsi'],
    ['Verifikasi dan Validasi Akademik', OPR, 'decision', 'FILKOM Apps', '1 Hari', 'Dokumen Persyaratan Seminar Hasil dan Sidang Skripsi', 'Operator Akademik memproses verifikasi dan validasi dokumen persyaratan pengajuan seminar hasil dan sidang skripsi', 'Valid', 'Tidak Valid', 10],
    ['Penjadwalan Seminar Hasil', SEK, 'process', 'FILKOM Apps', '3 Hari', 'Undangan Seminar Hasil Skripsi', 'Sekretaris departemen menentukan jadwal pelaksanaan seminar hasil skripsi'],
    ['Pelaksanaan Seminar Hasil', MHS, 'decision', 'FILKOM Apps', '1 Hari', 'Skripsi', 'Mahasiswa melaksanakan seminar hasil sesuai ketentuan', 'Lulus', 'Tidak Lulus', 13],
    ['Penjadwalan Sidang Skripsi', SEK, 'process', 'FILKOM Apps', '3 Hari', 'Undangan Sidang Skripsi', 'Sekretaris departemen menentukan jadwal pelaksanaan sidang skripsi'],
    ['Pelaksanaan Sidang Skripsi', MHS, 'decision', 'FILKOM Apps', '1 Hari', 'Skripsi', 'Mahasiswa melaksanakan sidang skripsi sesuai ketentuan', 'Lulus', 'Tidak Lulus', 15],
    ['Penerbitan Surat Keputusan Majelis Penguji Skripsi', OPR, 'process', 'FILKOM Apps', '1 Hari', 'Surat Keputusan Majelis Penguji Skripsi', 'Operator akademik membuat draf SK Majelis Penguji Skripsi yang disahkan Dekan'],
    ['Selesai', OPR, 'terminator', '', '', 'Skripsi', '']
  ];
  const steps = rows.map((r, i) => ({
    ...newStep(r[1], r[2]),
    id: 's' + (i + 1),
    kegiatan: r[0],
    kelengkapan: r[3],
    waktu: r[4],
    output: r[5],
    keterangan: r[6],
    yesLabel: r[7] ?? 'Ya',
    noLabel: r[8] ?? 'Tidak',
    alt: r[9] ? 's' + r[9] : null
  }));

  return {
    format: FORMAT,
    version: VERSION,
    header: {
      institution: 'KEMENTERIAN PENDIDIKAN, KEBUDAYAAN,\nRISET DAN TEKNOLOGI\nFAKULTAS ILMU KOMPUTER\nUNIVERSITAS BRAWIJAYA',
      nomor: 'UN10/F15/05/1/HK.01.02.a/126',
      tglPembuatan: '2023-08-07',
      tglRevisi: '',
      tglEfektif: '2023-10-20',
      disahkanJabatan: 'DEKAN FAKULTAS ILMU KOMPUTER',
      disahkanNama: 'Prof. Ir. Wayan Firdaus Mahmudy, S.Si., M.T., Ph.D.',
      disahkanNip: 'NIP. 197209191997021001',
      signature: null,
      namaSop: 'SKRIPSI'
    },
    sections: {
      dasarHukum: {
        numbered: true,
        items: [
          'Undang-undang Republik Indonesia Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional',
          'Peraturan Pemerintah Republik Indonesia Nomor 12 Tahun 2012 tentang Pendidikan Tinggi.',
          'Peraturan Pemerintah Nomor 4 Tahun 2014 tentang Penyelenggaraan Pendidikan Tinggi Dan Pengelolaan Perguruan Tinggi',
          'Peraturan Rektor Universitas Brawijaya Nomor 64 Tahun 2022 Penyelenggaraan Pendidikan Universitas Brawijaya Tahun Akademik 2022/2023',
          'Buku Pedoman Pendidikan Universitas Brawijaya Tahun Akademik 2022/2023 & Buku Pedoman Pendidikan Fakultas Ilmu Komputer Tahun Akademik 2020/2024.',
          'Buku Panduan Skripsi Versi 3'
        ]
      },
      kualifikasi: { numbered: true, items: a.map((x) => x.name) },
      keterkaitan: { numbered: true, items: [] },
      peralatan: { numbered: true, items: ['FILKOM Apps', 'Transkrip Akademik', 'Jaringan internet'] },
      peringatan: { numbered: false, items: [] },
      pencatatan: { numbered: false, items: ['Disimpan sebagai data elektronik dan manual'] }
    },
    actors: a,
    steps
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
  for (const k of Object.keys(header)) {
    if (k === 'signature') header[k] = isImage(raw.header?.[k]) ? raw.header[k] : null;
    else header[k] = plain(raw.header?.[k]);
  }
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
  if (!actors.length) actors.push(...base.actors);

  usedIds.clear();
  const steps = raw.steps.map((s, i) => {
    const d = newStep(actors[0].id);
    const step = { ...d };
    for (const k of Object.keys(d)) if (k !== 'next' && k !== 'alt' && s?.[k] != null) step[k] = RICH_STEP.has(k) ? rich(s[k]) : plain(s[k]);
    step.id = freshId(s?.id);
    step.actor = stepActors[i] ?? actors[0].id;
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
  });

  return { format: FORMAT, version: VERSION, header, sections, actors, steps };
}

function isImage(v) {
  return v && typeof v.src === 'string' && v.src.startsWith('data:image/') && v.width > 0 && v.height > 0;
}
