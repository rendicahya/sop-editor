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
    title: 'Buka tur lagi',
    text: 'Tur ini bisa dibuka lagi kapan saja lewat tombol ini.'
  }
];
