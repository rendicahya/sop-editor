// Prompt siap salin agar asisten AI menghasilkan JSON yang bisa dibuka aplikasi ini:
// menyusun SOP baru dari deskripsi, atau menyalin SOP lama (PDF/Word/foto) ke format aplikasi.
import { DEFAULT_INSTITUTION, DEFAULT_PENGESAH } from './model.js';

const EXAMPLE = {
  format: 'sop-editor',
  version: 1,
  header: {
    institution: DEFAULT_INSTITUTION,
    nomor: 'UN00/F00/01/HK.01.02/001',
    tglPembuatan: '2026-01-15',
    tglRevisi: '',
    tglEfektif: '2026-02-01',
    ...DEFAULT_PENGESAH,
    namaSop: 'PENGAJUAN CUTI AKADEMIK'
  },
  sections: {
    dasarHukum: { numbered: true, items: ['Peraturan … tentang …'] },
    kualifikasi: { numbered: true, items: ['Mahasiswa aktif', 'Operator akademik yang memahami SIAKAD'] },
    keterkaitan: { numbered: true, items: ['SOP Registrasi Mahasiswa'] },
    peralatan: { numbered: true, items: ['SIAKAD', 'Formulir cuti akademik'] },
    peringatan: { numbered: false, items: ['Jika tidak dilaksanakan, status mahasiswa menjadi tidak aktif'] },
    pencatatan: { numbered: false, items: ['Disimpan sebagai data elektronik dan manual'] }
  },
  actors: [
    { id: 'a1', name: 'Mahasiswa' },
    { id: 'a2', name: 'Operator Akademik' },
    { id: 'a3', name: 'Ketua Program Studi' }
  ],
  steps: [
    { id: 's1', kegiatan: 'Mengajukan permohonan cuti', actor: 'a1', shape: 'terminator', kelengkapan: 'Formulir cuti', waktu: '10 Menit', output: 'Formulir terisi', keterangan: 'Mahasiswa mengisi formulir di <i>SIAKAD</i>' },
    { id: 's2', kegiatan: 'Verifikasi berkas', actor: 'a2', shape: 'decision', kelengkapan: 'Formulir cuti, KRS', waktu: '1 Hari', output: 'Berkas terverifikasi', keterangan: 'Jika <b>tidak lengkap</b>, dikembalikan ke mahasiswa', yesLabel: 'Lengkap', noLabel: 'Tidak Lengkap', alt: 's1' },
    { id: 's3', kegiatan: 'Persetujuan cuti', actor: 'a3', shape: 'process', kelengkapan: 'Berkas terverifikasi', waktu: '2 Hari', output: 'Surat persetujuan', keterangan: '' },
    { id: 's4', kegiatan: 'Selesai', actor: 'a1', shape: 'terminator', kelengkapan: '', waktu: '', output: 'Surat persetujuan', keterangan: '' }
  ]
};

const PENGESAH_RULE =
  `isi "disahkanJabatan" dengan "${DEFAULT_PENGESAH.disahkanJabatan}", "disahkanNama" dengan "${DEFAULT_PENGESAH.disahkanNama}", ` +
  `dan "disahkanNip" dengan "${DEFAULT_PENGESAH.disahkanNip}"`;

/** Aturan struktur JSON yang sama untuk kedua prompt. */
const formatRules = (header) => `ATURAN FORMAT:
- Keluarkan HANYA satu objek JSON yang valid, tanpa penjelasan di luar JSON. Jika bisa, berikan juga sebagai berkas .json yang dapat diunduh.
- "format" selalu "sop-editor" dan "version" selalu 1.
${header}
- sections: enam bagian tetap (dasarHukum, kualifikasi, keterkaitan, peralatan, peringatan, pencatatan), masing-masing { "numbered": boolean, "items": [teks, …] }.
- actors: daftar pelaksana, masing-masing { "id": "a1", "name": "…" }. Urutannya menjadi urutan kolom pada diagram alir.
- steps: langkah berurutan dari atas ke bawah. Setiap langkah:
  - "id": unik, misalnya "s1", "s2", …
  - "kegiatan": nama kegiatan
  - "actor": id pelaksana dari daftar actors
  - "shape": "terminator" (Mulai/Selesai, biasanya langkah pertama dan terakhir), "process" (kegiatan biasa), atau "decision" (pemeriksaan/persetujuan yang bisa ditolak)
  - "kelengkapan", "waktu" (contoh "1 Hari", "15 Menit"), "output", "keterangan": teks, boleh ""
  - "next" (opsional): bawaannya langkah berikutnya. Isi id langkah lain untuk melompat, atau "none" bila alur berhenti.
  - Khusus "decision": "yesLabel" dan "noLabel" (contoh "Valid"/"Tidak Valid"); jalur "ya" lanjut ke "next", jalur "tidak" ke "alt" yang berisi id langkah tujuan (biasanya kembali ke langkah sebelumnya untuk perbaikan).
- Format teks: butir sections serta kolom kegiatan, kelengkapan, waktu, output, dan keterangan boleh memakai tag <b>tebal</b>, <i>miring</i>, dan <u>garis bawah</u> (boleh bertumpuk, mis. <b><i>…</i></b>). Jangan memakai Markdown (**…**) atau tag lain. Kolom lain selalu teks polos.
- Daftar di dalam sel kolom langkah: satu butir per baris (dipisah \\n), diawali "• " untuk poin atau "1. ", "2. ", … untuk nomor.`;

export function aiPrompt(description = '') {
  const desc = description.trim() || '[TULIS DI SINI: nama SOP, unit kerja, siapa saja yang terlibat, dan urutan prosesnya]';
  return `Buatkan dokumen SOP (Standar Operasional Prosedur) instansi pemerintah/perguruan tinggi Indonesia dalam format JSON untuk aplikasi "SOP Editor".

DESKRIPSI PROSES:
${desc}

${formatRules(`- header: isi semua kolom teks. "institution" boleh beberapa baris (pisahkan dengan \\n), ditulis HURUF KAPITAL dari kementerian sampai unit kerja. Tanggal memakai format YYYY-MM-DD; kosongkan ("") bila tidak diketahui. Jangan menyertakan logo atau tanda tangan.
- Pengesah: kecuali deskripsi menyebut pejabat lain, ${PENGESAH_RULE}.
- Dasar hukum: gunakan peraturan yang benar-benar ada; bila ragu, tulis "[lengkapi: …]" alih-alih mengarang nomor peraturan.`)}
- Tulis istilah asing dengan <i>miring</i>. Gunakan format lain seperlunya saja.
- Gunakan bahasa Indonesia baku.

CONTOH STRUKTUR (isi dengan proses di atas, jangan disalin isinya):
${JSON.stringify(EXAMPLE, null, 2)}`;
}

/**
 * Prompt untuk menyalin SOP lama yang dilampirkan pengguna di chat AI.
 * `update`: kop dan pengesah diganti dengan bawaan saat ini (SOP lama biasanya disahkan ulang).
 */
export function aiImportPrompt(note = '', update = true) {
  const extra = note.trim() ? `\nCATATAN TAMBAHAN DARI PENGGUNA (utamakan bila bertentangan dengan aturan di bawah):\n${note.trim()}\n` : '';
  const header = update
    ? `- header: salin nomor SOP, nama SOP, dan tanggal dari dokumen. Namun "institution" diisi "${DEFAULT_INSTITUTION.replace(/\n/g, '\\n')}" dan pengesah diperbarui: ${PENGESAH_RULE}.`
    : `- header: salin semua kolom dari dokumen apa adanya, termasuk kop instansi ("institution", baris dipisah \\n) dan pengesah (jabatan, nama, NIP).`;
  return `Saya melampirkan dokumen SOP (Standar Operasional Prosedur) lama, berupa PDF, Word, atau foto/pindaian. Salin isinya menjadi JSON untuk aplikasi "SOP Editor".
${extra}
CARA MEMBACA DOKUMEN:
- Halaman identitas: kotak kop (logo dan nama instansi), lalu baris NOMOR SOP, TGL PEMBUATAN, TGL REVISI, TGL EFEKTIF, DISAHKAN OLEH, NAMA SOP, serta bagian DASAR HUKUM, KUALIFIKASI PELAKSANA, KETERKAITAN, PERALATAN/PERLENGKAPAN, PERINGATAN, dan PENCATATAN DAN PENDATAAN.
- Halaman diagram alir: tabel dengan kolom No., Kegiatan, Pelaksana (satu kolom per pelaksana), Mutu Baku (Kelengkapan, Waktu, Output), dan Keterangan. Bila tabel berlanjut ke beberapa halaman, gabungkan semua barisnya menjadi satu daftar langkah dan abaikan kepala tabel yang berulang.
- Pelaksana sebuah langkah adalah kolom tempat simbolnya berada. Simbol oval/sudut membulat = "terminator", persegi panjang = "process", belah ketupat = "decision".
- Ikuti panah: lompatan ke langkah yang bukan langkah berikutnya diisi di "next"; cabang keputusan memakai label di dekat panahnya ("Ya"/"Tidak", "Valid"/"Tidak Valid", dsb.) sebagai yesLabel/noLabel, dengan tujuan cabang "tidak" di "alt". Konektor antarhalaman (lingkaran/segilima berhuruf) hanya penyambung, bukan langkah.
- Butir bernomor pada bagian identitas → "numbered": true; tanpa nomor → false. Bagian yang kosong atau berisi "-" → items [].

ATURAN PENYALINAN:
- Salin teks persis seperti di dokumen (ejaan, huruf kapital, singkatan, nomor peraturan). Jangan meringkas, menambah, atau memperbaiki isi.
- Pertahankan format tebal, miring, dan garis bawah pada butir dan sel tabel memakai tag di bawah.
- Tanggal ditulis YYYY-MM-DD (mis. "20 Oktober 2023" → "2023-10-20"); kosongkan ("") bila tidak ada.
- Teks yang tidak terbaca ditulis "[tidak terbaca]". Jangan menyertakan logo, tanda tangan, atau stempel.

${formatRules(header)}

CONTOH STRUKTUR (hanya bentuknya; isinya harus dari dokumen terlampir):
${JSON.stringify(EXAMPLE, null, 2)}`;
}
