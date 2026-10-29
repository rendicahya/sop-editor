// Prompt siap salin agar asisten AI menghasilkan JSON yang bisa dibuka aplikasi ini.
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
    { id: 's1', kegiatan: 'Mengajukan permohonan cuti', actor: 'a1', shape: 'terminator', kelengkapan: 'Formulir cuti', waktu: '10 Menit', output: 'Formulir terisi', keterangan: 'Mahasiswa mengisi formulir di SIAKAD' },
    { id: 's2', kegiatan: 'Verifikasi berkas', actor: 'a2', shape: 'decision', kelengkapan: 'Formulir cuti, KRS', waktu: '1 Hari', output: 'Berkas terverifikasi', keterangan: 'Jika tidak lengkap, dikembalikan ke mahasiswa', yesLabel: 'Lengkap', noLabel: 'Tidak Lengkap', alt: 's1' },
    { id: 's3', kegiatan: 'Persetujuan cuti', actor: 'a3', shape: 'process', kelengkapan: 'Berkas terverifikasi', waktu: '2 Hari', output: 'Surat persetujuan', keterangan: '' },
    { id: 's4', kegiatan: 'Selesai', actor: 'a1', shape: 'terminator', kelengkapan: '', waktu: '', output: 'Surat persetujuan', keterangan: '' }
  ]
};

export function aiPrompt(description = '') {
  const desc = description.trim() || '[TULIS DI SINI: nama SOP, unit kerja, siapa saja yang terlibat, dan urutan prosesnya]';
  return `Buatkan dokumen SOP (Standar Operasional Prosedur) instansi pemerintah/perguruan tinggi Indonesia dalam format JSON untuk aplikasi "SOP Editor".

DESKRIPSI PROSES:
${desc}

ATURAN FORMAT:
- Keluarkan HANYA satu objek JSON yang valid, tanpa penjelasan di luar JSON. Jika bisa, berikan juga sebagai berkas .json yang dapat diunduh.
- "format" selalu "sop-editor" dan "version" selalu 1.
- header: isi semua kolom teks. "institution" boleh beberapa baris (pisahkan dengan \\n), ditulis HURUF KAPITAL dari kementerian sampai unit kerja. Tanggal memakai format YYYY-MM-DD; kosongkan ("") bila tidak diketahui. Jangan menyertakan logo atau tanda tangan.
- Pengesah: kecuali deskripsi menyebut pejabat lain, isi "disahkanJabatan" dengan "${DEFAULT_PENGESAH.disahkanJabatan}", "disahkanNama" dengan "${DEFAULT_PENGESAH.disahkanNama}", dan "disahkanNip" dengan "${DEFAULT_PENGESAH.disahkanNip}".
- sections: enam bagian tetap (dasarHukum, kualifikasi, keterkaitan, peralatan, peringatan, pencatatan), masing-masing { "numbered": boolean, "items": [teks, …] }. Gunakan peraturan yang benar-benar ada; bila ragu, tulis "[lengkapi: …]" alih-alih mengarang nomor peraturan.
- actors: daftar pelaksana, masing-masing { "id": "a1", "name": "…" }. Urutannya menjadi urutan kolom pada diagram alir (biasanya urutan kemunculan dalam proses).
- steps: langkah berurutan dari atas ke bawah. Setiap langkah:
  - "id": unik, misalnya "s1", "s2", …
  - "kegiatan": nama kegiatan singkat
  - "actor": id pelaksana dari daftar actors
  - "shape": "terminator" (langkah pertama dan terakhir), "process" (kegiatan biasa), atau "decision" (pemeriksaan/persetujuan yang bisa ditolak)
  - "kelengkapan", "waktu" (contoh "1 Hari", "15 Menit"), "output", "keterangan": teks, boleh ""
  - "next" (opsional): bawaannya langkah berikutnya. Isi id langkah lain untuk melompat, atau "none" bila alur berhenti.
  - Khusus "decision": "yesLabel" dan "noLabel" (contoh "Valid"/"Tidak Valid"); jalur "ya" lanjut ke "next", jalur "tidak" ke "alt" yang berisi id langkah tujuan (biasanya kembali ke langkah sebelumnya untuk perbaikan).
- Gunakan bahasa Indonesia baku.

CONTOH STRUKTUR (isi dengan proses di atas, jangan disalin isinya):
${JSON.stringify(EXAMPLE, null, 2)}`;
}
