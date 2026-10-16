// Model dokumen SOP. Format JSON yang disimpan/dibuka mengikuti struktur ini.

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

/** "2023-08-07" → "07 Agustus 2023". */
export function formatTanggal(iso) {
  const m = ISO.exec(iso || '');
  return m ? `${m[3]} ${BULAN[+m[2] - 1] ?? ''} ${m[1]}` : '';
}

/** Menerima tanggal ISO atau teks "07 Agustus 2023" (format lama) dan mengembalikan ISO. */
function toIsoDate(v) {
  if (typeof v !== 'string') return '';
  if (ISO.test(v)) return v;
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(v.trim());
  const mi = m ? BULAN.findIndex((b) => b.toLowerCase() === m[2].toLowerCase()) : -1;
  return mi < 0 ? '' : `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

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
      logo: null,
      institution: 'NAMA INSTANSI\nUNIT KERJA',
      nomor: '',
      tglPembuatan: '',
      tglRevisi: '',
      tglEfektif: '',
      disahkanJabatan: '',
      disahkanNama: '',
      disahkanNip: '',
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
    ['Upload Pra Proposal', MHS, 'terminator', 'Filkom APPS', '5 Menit', 'dokumen pra proposal', 'Mahasiswa unggah pra proposal di Filkom APPS'],
    ['Persetujuan Pra Proposal', DSN, 'decision', 'Filkom APPS', '3 Hari', 'dokumen pra proposal', 'Calon dosen pembimbing 1 melakukan cek dan persetujuan pada dokumen pra proposal skripsi di Filkom APPS', 'Disetujui', 'Tidak Disetujui', 1],
    ['Upload Proposal', OPR, 'process', 'Filkom APPS, Proposal Skripsi', '1 Hari', 'Proposal Skripsi', 'Mahasiswa unggah proposal di Filkom APPS'],
    ['Verifikasi dan Validasi Akademik', KPS, 'decision', 'Filkom APPS, SIAKAD', '1 Hari', 'KRS, SKS Lulus', 'Operator Akademik melakukan cek SKS lulus, Mata kuliah Skripsi mahasiswa di KRS', 'Valid', 'Tidak Valid', 3],
    ['Penentuan Dosen Pembimbing', KPS, 'process', 'Filkom APPS', '1 Hari', 'Dosen pembimbing terpilih', 'Ketua Program Studi menentukan dosen pembimbing ke 2'],
    ['Penerbitan Surat Tugas', OPR, 'process', 'Filkom APPS', '1 Hari', 'Surat Tugas Pembimbing Skripsi', 'Operator Akademik menerbitkan Surat Tugas Pembimbing Skripsi'],
    ['Presentasi Proposal (P0)', MHS, 'process', 'Filkom APPS', '1 Hari', 'Proposal Skripsi', 'Mahasiswa presentasi ke dosen pembimbing skripsi'],
    ['Presentasi Progress ke 1 (P1)', MHS, 'process', 'Filkom APPS', '1 Hari', 'Skripsi', 'Mahasiswa presentasi ke dosen pembimbing skripsi'],
    ['Presentasi Progress ke 2 (P2)', MHS, 'process', 'Filkom APPS', '1 Hari', 'Skripsi', 'Mahasiswa presentasi ke dosen pembimbing skripsi'],
    ['Pendaftaran Seminar Hasil dan Sidang', MHS, 'process', 'Filkom APPS', '1 Hari', 'Skripsi', 'Mahasiswa mengajukan seminar hasil dan sidang skripsi di Filkom APPS'],
    ['Persetujuan Pengajuan Seminar Hasil dan Sidang Skripsi', DSN, 'process', 'Filkom APPS', '3 Hari', 'Skripsi', 'Dosen pembimbing memproses persetujuan pengajuan seminar hasil dan sidang skripsi'],
    ['Verifikasi dan Validasi Akademik', OPR, 'decision', 'Filkom APPS', '1 Hari', 'Dokumen Persyaratan Seminar Hasil dan Sidang Skripsi', 'Operator Akademik memproses verifikasi dan validasi dokumen persyaratan pengajuan seminar hasil dan sidang skripsi', 'Valid', 'Tidak Valid', 10],
    ['Penjadwalan Seminar Hasil', SEK, 'process', 'Filkom APPS', '3 Hari', 'Undangan Seminar Hasil Skripsi', 'Sekretaris departemen menentukan jadwal pelaksanaan seminar hasil skripsi'],
    ['Pelaksanaan Seminar Hasil', MHS, 'decision', 'Filkom APPS', '1 Hari', 'Skripsi', 'Mahasiswa melaksanakan seminar hasil sesuai ketentuan', 'Lulus', 'Tidak Lulus', 13],
    ['Penjadwalan Sidang Skripsi', SEK, 'process', 'Filkom APPS', '3 Hari', 'Undangan Sidang Skripsi', 'Sekretaris departemen menentukan jadwal pelaksanaan sidang skripsi'],
    ['Pelaksanaan Sidang Skripsi', MHS, 'decision', 'Filkom APPS', '1 Hari', 'Skripsi', 'Mahasiswa melaksanakan sidang skripsi sesuai ketentuan', 'Lulus', 'Tidak Lulus', 15],
    ['Penerbitan Surat Keputusan Majelis Penguji Skripsi', OPR, 'process', 'Filkom APPS', '1 Hari', 'Surat Keputusan Majelis Penguji Skripsi', 'Operator akademik membuat draf SK Majelis Penguji Skripsi yang disahkan Dekan'],
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
      logo: null,
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
      peralatan: { numbered: true, items: ['Filkom APPS', 'Transkrip Akademik', 'Jaringan internet'] },
      peringatan: { numbered: false, items: [] },
      pencatatan: { numbered: false, items: ['Disimpan sebagai data elektronik dan manual'] }
    },
    actors: a,
    steps
  };
}

/** Memvalidasi & melengkapi JSON yang dibuka agar aman dipakai editor. */
export function normalizeDocument(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Berkas bukan JSON dokumen SOP.');
  if (raw.format !== FORMAT) throw new Error('Berkas JSON ini bukan dokumen SOP Editor.');
  if (!Array.isArray(raw.actors) || !Array.isArray(raw.steps)) throw new Error('Struktur dokumen SOP tidak lengkap.');

  const base = emptyDocument();
  const str = (v) => (typeof v === 'string' ? v : '');
  const header = { ...base.header };
  for (const k of Object.keys(header)) {
    if (k === 'logo' || k === 'signature') header[k] = isImage(raw.header?.[k]) ? raw.header[k] : null;
    else header[k] = str(raw.header?.[k]);
  }
  header.tglPembuatan = toIsoDate(header.tglPembuatan);
  header.tglEfektif = toIsoDate(header.tglEfektif);

  const sections = {};
  for (const s of SECTION_DEFS) {
    const src = raw.sections?.[s.key];
    sections[s.key] = {
      numbered: typeof src?.numbered === 'boolean' ? src.numbered : base.sections[s.key].numbered,
      items: Array.isArray(src?.items) ? src.items.map(str) : []
    };
  }

  const actors = raw.actors.map((x) => ({ id: str(x?.id) || uid(), name: str(x?.name) }));
  if (!actors.length) actors.push(...base.actors);
  const actorIds = new Set(actors.map((x) => x.id));

  const steps = raw.steps.map((s) => {
    const d = newStep(actors[0].id);
    const step = { ...d };
    for (const k of Object.keys(d)) if (typeof s?.[k] === 'string') step[k] = s[k];
    if (!actorIds.has(step.actor)) step.actor = actors[0].id;
    if (!SHAPES.some((x) => x.value === step.shape)) step.shape = 'process';
    step.alt = typeof s?.alt === 'string' ? s.alt : null;
    return step;
  });
  const stepIds = new Set(steps.map((s) => s.id));
  for (const s of steps) {
    if (!['auto', 'none'].includes(s.next) && !stepIds.has(s.next)) s.next = 'auto';
    if (s.alt && !stepIds.has(s.alt)) s.alt = null;
  }

  return { format: FORMAT, version: VERSION, header, sections, actors, steps };
}

function isImage(v) {
  return v && typeof v.src === 'string' && v.src.startsWith('data:image/') && v.width > 0 && v.height > 0;
}
