// Langkah tur pengenalan. Langkah yang targetnya tidak tampil saat tur dibuka dilewati.
export const TOUR_STEPS = [
  {
    title: 'Selamat datang di SOP Editor',
    text: 'Aplikasi ini menyusun dokumen SOP sesuai template: halaman identitas dan diagram alir dibuat otomatis dari isian Anda. Tur singkat ini menunjukkan bagian-bagian utamanya.'
  },
  {
    target: '[data-tour="page"]',
    title: 'Ketik langsung di halaman',
    text: 'Klik teks di halaman untuk mengubahnya. Klik kanan pada kegiatan, pelaksana, atau butir untuk menambah, memindah, atau menghapus. Diagram alir menyesuaikan sendiri.'
  },
  {
    target: '.no-doc',
    title: 'Mulai SOP pertama Anda',
    text: 'Belum ada SOP yang terbuka. Buat SOP baru, buka berkas .sop, atau pilih dari Pustaka. Isinya nanti diketik langsung di halaman; klik kanan untuk menambah kegiatan atau pelaksana, dan diagram alir menyesuaikan sendiri.'
  },
  {
    target: '.font-warn',
    title: 'Font Calibri',
    text: 'Dokumen SOP wajib memakai Calibri. Bila pemberitahuan ini muncul, ambil Calibri dari perangkat atau pilih filenya. Cukup sekali; font disimpan di browser ini.'
  },
  {
    target: '.fmt',
    title: 'Format teks',
    text: 'Tebal, miring, garis bawah, daftar poin/bernomor, dan ubah huruf besar/kecil untuk butir ketentuan dan sel tabel langkah yang sedang diedit.'
  },
  {
    target: '.tabs',
    title: 'Beberapa SOP sekaligus',
    text: 'Tiap SOP terbuka di tabnya sendiri. Seret tab untuk mengurutkan, klik kanan untuk menu tab. Tab yang terbuka tetap ada saat aplikasi dibuka lagi.'
  },
  {
    target: '[data-tour="new"]',
    title: 'Mulai atau buka SOP',
    text: 'Baru membuat SOP kosong, Buka memuat berkas .sop dari perangkat. Berkas .sop juga bisa langsung diseret ke jendela ini.'
  },
  {
    target: '.toolbar .lib-btn',
    title: 'Pustaka Lokal dan Daring',
    text: 'Pustaka Lokal menyimpan SOP di browser ini, lengkap dengan folder dan riwayat versi. Pustaka Daring dipakai bersama rekan: berbagi, komentar, dan tinjauan.'
  },
  {
    target: '[data-tour="save"]',
    title: 'Simpan',
    text: 'Pilih tujuan: Pustaka Lokal, Pustaka Daring, atau berkas .sop. Setelah itu Ctrl+S menyimpan ke tempat yang sama.'
  },
  {
    target: '[data-tour="ai"]',
    title: 'Asisten AI',
    text: 'Susun SOP baru dari uraian singkat, impor SOP lama dari PDF atau Word, atau minta revisi SOP yang sedang dibuka.'
  },
  {
    target: '.check-btn',
    title: 'Periksa kelengkapan',
    text: 'Menandai alur yang putus dan isian penting yang masih kosong. Klik salah satu temuan untuk melompat ke tempatnya.'
  },
  {
    target: '.notes-btn',
    title: 'Komentar',
    text: 'Untuk SOP di Pustaka Daring: tinggalkan catatan pada bagian tertentu, sebut rekan dengan @, dan tandai selesai bila sudah ditangani.'
  },
  {
    target: '[data-tour="export"]',
    title: 'Ekspor dan cetak',
    text: 'Unduh PDF, cetak langsung, atau ekspor ke Word, Excel, dan gambar PNG.'
  },
  {
    target: '.adm-btn',
    title: 'Admin',
    text: 'Khusus admin: atur anggota, grup, isian bawaan untuk SOP baru, dan pemakaian penyimpanan.'
  },
  {
    target: '[data-tour="tour"]',
    title: 'Bantuan',
    text: 'Tur ini dan daftar pintasan keyboard bisa dibuka lagi kapan saja lewat tombol ini (pintasan juga dengan Ctrl+/). Dialog Pustaka, Asisten AI, dan Admin punya tombol ? sendiri untuk tur singkat isinya.'
  }
];

// Tur singkat di dalam dialog (tombol ? di kepala dialog).
const L = '[data-pane="local"]';
export const LOCAL_TOUR = [
  {
    title: 'Pustaka Lokal',
    text: 'SOP di sini tersimpan di browser ini saja, tidak ikut ke perangkat lain. Data hilang bila data situs browser dihapus, jadi sesekali unduh cadangannya.'
  },
  { target: `${L} .search`, title: 'Cari', text: 'Cari nama, nomor, label, atau isi SOP di semua folder.' },
  { target: `${L} .tagbar`, title: 'Saring dengan label', text: 'Tampilkan SOP berlabel tertentu atau yang perlu ditinjau. Label diatur dari tombol Label pada tiap SOP.' },
  { target: `${L} .crumbs`, title: 'Lokasi folder', text: 'Klik nama folder untuk naik ke atas. SOP dan folder bisa diseret ke sini untuk dipindahkan.' },
  {
    target: `${L} .selbar`,
    title: 'Pilih dan kelola',
    text: 'Centang beberapa SOP untuk menggabung PDF, mengunduh ZIP, memindah, menyalin ke Pustaka Daring, atau menghapus. Di kanan: folder baru, impor .sop/.zip, daftar induk (XLSX), cadangan (ZIP), Baru dihapus, dan urutan.'
  },
  { target: `${L} .list`, title: 'Daftar SOP', text: 'Klik untuk membuka di tab. Seret ke folder untuk memindah. Berkas .sop atau .zip bisa dilepas di sini untuk diimpor.' },
  {
    target: `${L} .list > li:not(.folder) .acts`,
    title: 'Tindakan per SOP',
    text: 'Pratinjau tanpa membuka, riwayat versi (bisa dibandingkan dan dipulihkan), label, duplikat, pindah, unduh .sop, dan hapus. Yang dihapus disimpan 30 hari di Baru dihapus.'
  }
];

const D = '[data-pane="faculty"]';
export const FACULTY_TOUR = [
  {
    title: 'Pustaka Daring',
    text: 'SOP yang dipakai bersama anggota fakultas. Setiap SOP dan folder punya hak akses: private, grup tertentu, atau semua anggota. SOP yang sedang diedit dikunci agar tidak tertimpa.'
  },
  { target: `${D} .search`, title: 'Cari', text: 'Cari nama, nomor, pembuat, atau isi SOP di semua folder (Ctrl+F).' },
  { target: `${D} aside .tree`, title: 'Folder', text: 'Klik untuk membuka folder. Seret SOP atau folder ke sini untuk memindah. Klik kanan untuk menu folder.' },
  {
    target: `${D} aside nav`,
    title: 'Daftar khusus',
    text: 'Perlu ditinjau (SOP yang sudah lama berlaku), Ada komentar, Menyebut saya, Peta keterkaitan antar-SOP, dan Recycle bin.'
  },
  {
    target: `${D} .crumbs`,
    title: 'Lokasi dan tombol',
    text: 'Filter, urutan, daftar induk (XLSX), cadangan (ZIP), hak akses folder, SOP baru, folder baru, unggah, dan muat ulang.'
  },
  {
    target: `${D} .list`,
    title: 'Daftar SOP',
    text: 'Klik untuk membuka. Ctrl+klik atau Shift+klik memilih beberapa, klik kanan membuka menu. Berkas .sop atau .zip bisa dilepas di sini untuk diunggah. Daftar ini juga bisa dipakai dengan keyboard; lihat Pintasan keyboard.'
  },
  {
    target: `${D} .list > li:has(.acts)`,
    title: 'Tindakan per SOP',
    text: 'Arahkan mouse ke baris untuk melihat tombolnya: pratinjau, duplikat sebagai milik Anda, riwayat, hak akses, ubah nama, pindah, dan hapus.'
  }
];

const A = '[data-help="ai"]';
export const AI_TOUR = [
  {
    title: 'Asisten AI',
    text: 'Aplikasi ini menyiapkan prompt; Anda menjalankannya di asisten AI pilihan Anda, lalu menempelkan jawabannya di sini. Tidak ada data yang dikirim aplikasi ini ke layanan AI.'
  },
  { target: `${A} .seg`, title: 'Pilih jenis', text: 'Susun SOP baru dari uraian, impor SOP lama dari PDF/Word/foto, atau revisi SOP yang sedang dibuka.' },
  { target: `${A} [data-help="step1"]`, title: '1. Uraikan', text: 'Tulis deskripsi proses atau instruksi revisi. Untuk impor, lampirkan berkas SOP lama di chat AI.' },
  { target: `${A} [data-help="step2"]`, title: '2. Salin prompt', text: 'Prompt berisi aturan format SOP dan isian Anda. Bisa dilihat dulu sebelum disalin.' },
  { target: `${A} [data-help="step3"]`, title: '3. Kirim ke AI', text: 'Tempel prompt di chat asisten AI lalu kirim.' },
  { target: `${A} [data-help="step4"]`, title: '4. Tempel jawaban', text: 'Salin seluruh jawaban AI lalu tempel di sini.' },
  { target: `${A} .actions`, title: '5. Buka hasilnya', text: 'SOP baru dibuka di tab baru; revisi menggantikan dokumen ini dan bisa diurungkan dengan Ctrl+Z.' }
];

// `page`: halaman dialog Admin yang dibuka saat langkah itu tampil (lihat AdminDialog).
const M = '[data-help="admin"]';
export const ADMIN_TOUR = [
  { title: 'Admin', text: 'Pengaturan yang berlaku untuk semua anggota. Hanya admin yang bisa membuka dialog ini.' },
  { target: `${M} nav`, title: 'Halaman', text: 'Bawaan SOP baru, Anggota, Grup, dan Penyimpanan. Tur ini membuka tiap halaman bergantian.' },
  {
    page: 'defaults',
    target: `${M} [data-help="defaults"]`,
    title: 'Bawaan SOP baru',
    text: 'Kop instansi, awalan nomor, dan pengesah yang otomatis terisi di setiap SOP baru dan dipakai Asisten AI. SOP yang sudah ada tidak berubah.'
  },
  {
    page: 'members',
    target: `${M} [data-help="members"]`,
    title: 'Anggota',
    text: 'Hanya email yang terdaftar di sini yang bisa memakai aplikasi. Tempel beberapa email sekaligus, pilih peran, dan grupnya.'
  },
  {
    page: 'groups',
    target: `${M} [data-help="groups"]`,
    title: 'Grup',
    text: 'Kelompokkan anggota (mis. per prodi) agar hak akses SOP dan folder bisa diberikan sekaligus.'
  },
  {
    page: 'storage',
    target: `${M} [data-help="storage"]`,
    title: 'Penyimpanan',
    text: 'Perkiraan pemakaian penyimpanan daring dan batasnya. Bila batas terlampaui, anggota tidak bisa menyimpan ke Pustaka Daring sampai batasnya dinaikkan atau ada yang dihapus.'
  }
];
