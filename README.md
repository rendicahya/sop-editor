# SOP Editor

Aplikasi web (front-end saja, PWA) untuk membuat dan mengedit dokumen SOP berformat standar
(halaman identitas + diagram alir lintas pelaksana), menyimpannya sebagai berkas `.sop` (isinya JSON), dan mengekspornya ke PDF A4 lanskap, Word, Excel, atau gambar PNG.

Dibangun dengan Svelte 5 + Vite, jsPDF, vite-plugin-pwa, serta Firebase untuk Pustaka Daring.

**Demo:** https://rendicahya.github.io/sop-editor/

## Fitur

- **Hanya untuk akun terdaftar.** Aplikasi baru bisa dipakai setelah masuk dengan akun Google (@ub.ac.id atau @gmail.com) yang sudah didaftarkan admin di Pustaka Daring › Anggota. Akun lain hanya melihat pesan "belum terdaftar". Dokumen tetap tersimpan di perangkat dan tidak dikirim ke mana pun hanya karena login. Keanggotaan yang terakhir berhasil diperiksa diingat, jadi aplikasi tetap bisa dibuka saat luring; begitu daring lagi, akun yang sudah dihapus admin langsung tertutup.
- Format baku SOP Universitas Brawijaya: logo UB selalu tercetak; dokumen baru otomatis berisi kop kementerian sampai
  "UNIVERSITAS BRAWIJAYA" (kementerian, Fakultas Ilmu Komputer, UB), awalan nomor SOP `UN10/F15/`, pengesah Dekan FILKOM beserta nama dan NIP-nya,
  serta tanggal pembuatan dan tanggal efektif hari ini. Semuanya tetap bisa diubah.
- **Halaman 1 diedit langsung di pratinjau (WYSIWYG)**: klik teks di halaman untuk mengetik nama instansi, nomor,
  tanggal pembuatan/revisi/efektif (date picker), pengesahan, dan setiap butir ketentuan. Tanda tangan dibubuhkan pejabat pada hasil cetak, di ruang kosong bagian pengesahan.
- Bagian Dasar Hukum, Kualifikasi Pelaksana, Keterkaitan, Peralatan/Perlengkapan, Peringatan, serta
  Pencatatan dan Pendataan, masing-masing bisa bernomor atau tidak (tombol muncul saat judul bagian disorot).
- Daftar pelaksana (kolom diagram) dan langkah kegiatan dengan simbol Mulai/Selesai, Proses, dan Keputusan,
  plus kolom Mutu Baku (Kelengkapan, Waktu, Output) dan Keterangan.
- **Halaman diagram alir juga bisa diedit langsung**: nama pelaksana di kepala tabel serta kolom Kegiatan,
  Kelengkapan, Waktu, Output, dan Keterangan tiap langkah. Klik sel lajur pelaksana lain untuk memindahkan
  simbol langkah ke pelaksana itu. Sorot kepala kolom pelaksana untuk menggeser, menambah, atau menghapus
  pelaksana (hanya bila tidak ada langkah di lajurnya); sorot baris langkah untuk menaikkan/menurunkan,
  menduplikat, menambah, atau menghapus kegiatan.
  Klik simbol untuk mengganti jenisnya dan tujuan alurnya (untuk Keputusan: cabang ya/tidak beserta labelnya).
- **Kegiatan bersama beberapa pelaksana**: di menu simbol, pilih pelaksana lain pada "Dilakukan bersama"; simbolnya
  membentang dari lajur pelaksana paling kiri sampai paling kanan (di pratinjau, PDF, dan DOCX).
- **Periksa dokumen**: tombol **Periksa** di toolbar menampilkan jumlah temuan yang diperbarui langsung. Yang diperiksa:
  langkah yang tidak pernah dicapai, keputusan tanpa cabang ya/tidak, tujuan alur yang sudah dihapus, alur tanpa titik
  akhir atau yang berputar tanpa sampai ke Selesai, akhir alur yang simbolnya bukan Mulai/Selesai, kegiatan kosong,
  serta isian identitas penting (nama, nomor, tanggal, pengesah). Klik temuan untuk langsung menuju isiannya.
  Saran tambahan: kolom Output kosong, kegiatan keputusan yang bukan pertanyaan, kegiatan yang ditulis dua kali,
  pelaksana yang tampaknya sama tetapi ditulis berbeda (mis. "Kasubbag Akademik" dan "Kasubag. akademik"), dan istilah
  di kolom Kelengkapan/Output yang ditulis berganti-ganti (mis. "Form Pendaftaran" dan "formulir pendaftaran").
- **Pengingat tinjauan berkala**: SOP yang berlaku lebih dari 1–5 tahun (dipilih di panel Periksa, bawaan 2 tahun;
  diingat per browser) sejak tanggal efektif atau tanggal revisi terakhir diberi peringatan "sebaiknya ditinjau ulang".
  Di Pustaka Daring, SOP itu berlencana **Perlu ditinjau** dan bisa didaftar sekaligus lewat **Perlu ditinjau** di
  bawah pohon folder.
- **Estimasi total waktu**: kolom Waktu pada jalur utama (dari langkah 1 mengikuti cabang "ya", tanpa putaran balik)
  dijumlahkan dan ditampilkan di bar tab, mis. "24 hari 5 menit". Terbaca: "5 Menit", "1-2 hari kerja" (menjadi
  rentang), "1 jam 30 menit", "1x24 jam", "1/2 hari", "sehari", "maks. 3 hari". Satuan dijumlahkan terpisah (menit
  dibulatkan ke jam, tetapi jam tidak diubah ke hari karena hari kerja berbeda-beda). Panel Periksa merinci isian waktu
  yang tidak terbaca atau masih kosong; klik untuk menuju isiannya.
- **Format teks tebal, miring, dan garis bawah** pada butir ketentuan dan sel tabel langkah (Kegiatan, Kelengkapan,
  Waktu, Output, Keterangan): tombol **B / I / U** di bar tab atau Ctrl+B / Ctrl+I / Ctrl+U. Format ikut tercetak di
  pratinjau, PDF, dan DOCX.
- **Ubah huruf besar/kecil** di isian yang sama lewat tombol **Aa** (HURUF BESAR, huruf kecil, Huruf Awal Kata,
  Huruf awal kalimat) atau Shift+F3 untuk berganti mode seperti di Word. Tanpa seleksi, yang diubah kata di kursor.
- **Daftar poin dan bernomor di dalam sel langkah** lewat tombol daftar di bar tab atau Ctrl+Shift+8 / Ctrl+Shift+7.
  Enter melanjutkan butir (nomor bertambah otomatis), Enter pada butir kosong atau Backspace setelah penanda mengakhiri
  daftar. Baris lanjutan butir menjorok rata dengan teksnya di pratinjau, PDF, dan DOCX.
- **Menu klik kanan** di halaman, isinya sesuai yang diklik: langkah/simbol (ganti simbol, atur alur, pindah
  pelaksana, tambah di atas/bawah, duplikat, naik/turun, hapus), kepala pelaksana (tambah di kiri/kanan, geser,
  hapus), butir ketentuan (tambah di atas/bawah, naik/turun, hapus, bernomor), garis alur (atur jalur, kembalikan
  otomatis). Pada isian teks ada juga potong/salin/tempel/pilih semua serta tebal/miring/garis
  bawah. Bisa dinavigasi dengan ↑/↓, Enter, dan Esc; Shift+klik kanan membuka menu bawaan browser.
- Zoom pratinjau dengan tombol −/+ atau slider di bar tab.
- Konektor diagram dibuat otomatis, termasuk cabang "ya"/"tidak" (labelnya berlatar putih agar tidak tertimpa garis tabel) pada keputusan dan konektor antarhalaman (A, B, …). Jalur garis dicari otomatis agar tidak menembus simbol dan tidak saling menumpuk.
- **Atur jalur garis secara manual** bila jalur otomatis kurang rapi: klik garis untuk memilih sisi keluar/masuk
  simbol, lalu seret kotak kecil pada ruas garis untuk menggesernya. Posisi disimpan relatif terhadap lajur dan baris,
  jadi tetap berlaku saat tata letak berubah. "Kembalikan jalur otomatis" menghapus pengaturan manualnya.
- Pratinjau langsung yang identik dengan hasil PDF, karena keduanya memakai mesin tata letak yang sama.
- **Beberapa SOP sekaligus** dalam tab: Baru, Buka, dan Asisten AI membuka dokumen di tab baru (tab kosong dipakai ulang). Tab bisa diseret untuk mengubah urutan dan ditutup dengan klik tengah. Semua tab kembali seperti semula setelah halaman dimuat ulang (riwayat Undo tidak ikut), sedangkan aplikasi yang baru dibuka selalu kosong; riwayat Undo terpisah per tab.
- **Tanda belum disimpan**: titik pada tab berarti SOP itu punya perubahan yang belum disimpan. Ctrl+S menyimpan ke tempat
  asalnya (Pustaka Daring, Pustaka Lokal, atau berkas) lalu titiknya hilang. Menutup tab bertanda ini menampilkan pilihan
  menyimpan, menutup tanpa menyimpan, atau tidak jadi menutup.
- **Pustaka Lokal**: SOP yang disimpan ke Pustaka Lokal berada di browser (IndexedDB) dan bisa dibuka lagi kapan saja.
  Isinya hanya berubah saat disimpan. Pustaka bisa dicari (nama, nomor, pelaksana, kegiatan, butir ketentuan),
  dan dokumennya bisa diduplikasi.
  **Label** (mis. Akademik, Keuangan) mengelompokkan dokumen: satu entri boleh berlabel lebih dari satu,
  daftar bisa disaring per label atau "Tanpa label", dan label bisa diganti nama atau dihapus sekaligus di semua entri.
- **Pustaka Daring**: SOP bersama secara daring untuk akun @ub.ac.id atau @gmail.com yang didaftarkan admin. Lihat [Pustaka Daring](#pustaka-daring).
  Label hanya ada di pustaka (tidak masuk berkas .sop).
- **Tautan Keterkaitan ke SOP lain**: klik kanan butir Keterkaitan › **Tautkan ke SOP lain…**, lalu pilih SOP dari
  Pustaka Daring (butir kosong otomatis diisi nama SOP itu). Klik kanan judul bagian untuk **Tambah tautan ke SOP lain…**.
  Butir yang tertaut diberi ikon tautan; klik ikonnya (atau menu **Buka …**) untuk membuka SOP itu di tab. Tautan
  menempel pada teks butir, jadi tetap benar saat butir diurutkan ulang, tetapi terlepas bila teksnya diubah.
  Tautan hanya berlaku di aplikasi; hasil cetak dan ekspor tetap berisi teks butirnya saja.
- **Ekspor PDF** menampilkan PDF yang sebenarnya dulu dalam dialog pratinjau; berkas baru diunduh lewat tombol **Unduh PDF**.
  Pilihan **Isi PDF** di dialog itu (diingat per browser): **Bisa disalin** (bawaan), **Dikunci** (PDF terenkripsi
  dengan izin cetak saja; salin dan ubah dilarang di Acrobat, Chrome, Edge, tetapi sebagian penampil seperti Firefox
  mengabaikannya), atau **Gambar** (tiap halaman menjadi gambar 250 dpi sehingga teks sama sekali tidak bisa diseleksi;
  berkas lebih besar). PDF yang dikunci atau berupa gambar tidak berisi data SOP, jadi tidak bisa dibuka lagi di editor.
  Pilihan **Watermark** menambahkan teks miring dan samar di tengah setiap halaman: DRAFT, SALINAN TERKENDALI,
  SALINAN TIDAK TERKENDALI, RAHASIA, CONTOH, atau teks lain (maks. 60 karakter). Watermark hanya ada di PDF,
  tidak di pratinjau editor maupun ekspor lain.
  Pilihan **Halaman** menentukan isi PDF: bagian depan dan diagram (bawaan), **bagian depan saja** (identitas,
  pengesahan, dan ketentuan), atau **diagram saja**. Pilihan ini diingat per browser; PDF sebagian tetap membawa data
  SOP yang utuh sehingga bisa dibuka lagi di editor.
- **PDF gabungan (buku SOP)**: beberapa SOP digabung menjadi satu PDF, diawali halaman daftar isi (nomor, nama, dan
  halaman tiap SOP; klik untuk melompat) dan bookmark per SOP. Dari Pustaka Daring: pilih SOP atau folder lalu
  **Gabung PDF** (isi folder dan subfoldernya ikut), atau klik kanan folder › **Gabung isinya jadi satu PDF…**. Dari
  editor: menu Ekspor › **PDF gabungan semua tab…**. Pilihan Halaman, Isi PDF, dan Watermark berlaku juga di sini.
- **Properti dokumen** (menu Ekspor › Properti dokumen…, atau tombol di pratinjau PDF): judul, penulis, subjek, dan
  kata kunci yang dimasukkan ke metadata berkas PDF, DOCX, dan XLSX. Disimpan di dalam berkas `.sop` (ikut Undo dan
  Pustaka Daring). Kolom yang dikosongkan memakai bawaan: judul "SOP <nama>", penulis dari kepala institusi (tanpa
  baris kementerian), subjek "Standar Operasional Prosedur Nomor <nomor>".
- **Ekspor DOCX** (Word) yang bisa diedit: halaman identitas menjadi tabel Word biasa (daftar bernomor asli), dan
  halaman diagram alir menjadi tabel dengan kolom/baris berukuran sama persis seperti pratinjau. Teks semua sel bisa
  diedit di Word, dan diagramnya (simbol, garis alur berpanah, label, konektor antarhalaman) berupa **shape Word yang
  bisa diedit**, diposisikan di halaman seperti PDF. Tinggi baris diagram dikunci agar tetap sejajar dengan shape, jadi
  perubahan besar (teks bertambah banyak, langkah baru) sebaiknya dilakukan di aplikasi lalu diekspor ulang.
- **Ekspor XLSX** (Excel) mengikuti template SOP (`src/assets/template-sop.xlsx`): sheet **Cover** berisi identitas
  (logo, nomor, tanggal, pengesahan, dan keenam bagian ketentuan) dan sheet **Flowchart** berisi
  tabel langkah. Simbol, garis alur berpanah, label ya/tidak, dan konektor antarhalaman digambar sebagai **shape Excel
  yang bisa diedit**, dengan posisi sama seperti PDF. Pemisah halaman cetak mengikuti PDF dan kepala tabel diulang di
  tiap halaman.
- **Ekspor PNG**: setiap halaman menjadi gambar 200 dpi berlatar putih, dikemas dalam satu berkas ZIP.
- PDF vektor (teks bisa diseleksi). Dokumen SOP wajib memakai **Calibri**, yang disematkan ke PDF. Karena file Calibri
  tidak boleh didistribusikan ulang, font diambil dari perangkat pengguna: tombol **Pakai Calibri perangkat**
  (Local Font Access API, Chrome/Edge desktop) atau **Pilih file Calibri…** (`calibri.ttf` + `calibrib.ttf`, di Windows
  ada di `C:\Windows\Fonts`). Cukup sekali; font disimpan di IndexedDB browser tersebut. Selama Calibri belum tersedia
  dipakai [Carlito](https://github.com/googlefonts/carlito) (metrik identik, jadi tata letak tidak berubah) dan muncul
  peringatan di atas pratinjau.
- Antarmuka memakai font [Inter](https://rsms.me/inter/).
- Simpan/buka berkas `.sop` (berkas `.json` lama tetap bisa dibuka), seret-lepas berkas ke jendela, Undo/Redo.
- **Asisten AI**: salin prompt siap pakai ke asisten AI, lalu tempel jawabannya untuk langsung
  diedit dan diekspor. Bisa menyusun SOP baru dari deskripsi, **mengimpor SOP lama** (PDF, Word, foto/pindaian)
  yang dilampirkan di chat AI, termasuk diagram alir dan formatnya, atau **merevisi SOP yang sedang dibuka** sesuai
  instruksi ("pecah langkah 3", "rapikan keterangan").
- **Cari & ganti** teks di seluruh dokumen (identitas, ketentuan, pelaksana, langkah), per kolom atau sekaligus.
- Mode layar penuh serta mode terang/gelap (mengikuti sistem secara bawaan; halaman dokumen tetap putih).
- Bisa dipasang sebagai aplikasi (PWA), bekerja offline, dan membuka berkas `.sop` lewat "Buka dengan".
- Dirancang untuk laptop/PC; di HP hanya tampil pesan untuk membukanya dari laptop/PC.

## Penggunaan

| Pintasan | Aksi |
| --- | --- |
| Ctrl+S | Simpan ke tempat asal SOP: Pustaka Daring, Pustaka Lokal, atau berkas .sop |
| Ctrl+Shift+S | Simpan sebagai berkas .sop baru |
| Ctrl+O | Buka berkas |
| Alt+W | Tutup tab dokumen (Ctrl+W juga bisa di aplikasi terpasang) |
| Ctrl+Shift+P | Pratinjau & ekspor PDF |
| Ctrl+P | Cetak (lewat PDF, hasilnya sama dengan ekspor; tombol **Cetak** juga ada di pratinjau PDF) |
| Ctrl+F / Ctrl+H | Cari & ganti (Esc untuk menutup) |
| Ctrl+Z / Ctrl+Y | Urungkan / Ulangi per langkah (format dan ubah huruf menjadi langkah tersendiri) |
| Ctrl+B / Ctrl+I / Ctrl+U | Tebal / miring / garis bawah (di butir ketentuan dan sel langkah) |
| Shift+F3 | Ganti huruf: BESAR → kecil → Awal Kata |
| Ctrl+Shift+8 / Ctrl+Shift+7 | Daftar poin / bernomor (di sel langkah) |

Pada butir ketentuan di halaman 1: **Enter** membuat butir baru (memecah di posisi kursor), **Backspace** di awal butir
menggabungkannya dengan butir sebelumnya, **Alt+↑/↓** memindahkan butir, dan **↑/↓** di awal/akhir butir berpindah
antarbutir.

**Seret-lepas:** arahkan kursor ke langkah, pelaksana, atau butir ketentuan, lalu seret pegangan **⠿** (di kiri baris
langkah, di atas kolom pelaksana, atau di kiri butir) ke posisi baru; garis biru menandai tempat lepasnya, dan halaman
bergulir sendiri saat kursor mendekati tepi. Esc membatalkan, Ctrl+Z mengurungkan.

Di Chrome/Edge, "Simpan" berikutnya langsung menimpa berkas yang sama (File System Access API).
Di browser lain, berkas diunduh.

### Asisten AI

1. Klik **Asisten AI**, lalu tulis deskripsi singkat prosesnya (opsional).
2. Klik **Salin** untuk menyalin prompt.
3. Masukkan prompt ke asisten AI. Prompt berisi aturan format, contoh, serta nama dan NIP dekan bawaan sebagai pengesah,
   sehingga AI menjawab dengan JSON dokumen SOP.
4. Salin jawabannya ke kolom **Tempel jawaban dari AI**, atau unduh berkas `.json` dari AI lalu buka seperti biasa.
5. Klik **Buka di editor**. Periksa kembali isinya (terutama dasar hukum) sebelum diekspor.

**Impor SOP lama:** pilih tab **Impor SOP lama**, lampirkan berkas SOP lama di chat AI, lalu tempel promptnya. Prompt
meminta AI menyalin teks apa adanya, membaca pelaksana dari kolom letak simbol, mengikuti panah dan cabang keputusan,
serta mempertahankan teks tebal/miring/garis bawah. Secara bawaan kop instansi dan pengesah diperbarui ke bawaan saat
ini (bisa dimatikan). Catatan tambahan untuk AI bisa ditulis di dialog. Bandingkan hasilnya dengan dokumen asli,
terutama arah panah.

**Revisi SOP ini:** pilih tab **Revisi SOP ini**, tulis instruksi perubahan, lalu salin prompt. Prompt berisi seluruh
dokumen yang sedang dibuka dan meminta AI mengubah hanya bagian yang diminta serta
mempertahankan id langkah. Jawaban yang ditempel menggantikan dokumen aktif sebagai satu langkah Undo;
jalur garis manual dipertahankan.

Pembuka JSON sengaja toleran terhadap jawaban AI: teks pengantar dan pembungkus ```` ```json ```` diabaikan,
`format` boleh tidak ada, `<strong>`/`<em>`/`**tebal**` diseragamkan menjadi tag format, `actor` boleh berisi nama pelaksana (pelaksana baru ditambahkan otomatis), id yang hilang
atau ganda dibuat ulang, `next`/`alt` boleh berisi nomor urut atau nama kegiatan, dan sinonim simbol
("start", "keputusan", …) dikenali.

### Pustaka Daring

SOP disimpan di Firestore sebagai teks JSON saja; server menolak isi yang memuat gambar.

| Tindakan | Lihat | Edit | Pemilik dan admin |
| --- | --- | --- | --- |
| Membuka, menduplikat, melihat riwayat dan daftar hak akses | Ya | Ya | Ya |
| Berkomentar, membalas, menandai komentar selesai | Ya | Ya | Ya |
| Mengedit isi SOP, mengubah nama SOP dan folder | | Ya | Ya |
| Menambah SOP dan subfolder ke dalam folder, memindahkan, menghapus, mengatur hak akses | | | Ya |

- Hanya akun yang didaftarkan admin (@ub.ac.id atau @gmail.com) yang bisa masuk. **Semua anggota** berarti semua akun terdaftar itu, dan semua anggota bisa melihat daftar email anggota untuk memilih kepada siapa file dibagikan.
- **Hak akses** diberikan per anggota atau per grup, sebagai Lihat atau Edit, pada file maupun folder. Pilihan **Semua anggota** tersedia untuk yang dipakai bersama. Pemilik selalu bisa melihat dan mengedit.
- **Grup** (mis. per prodi atau unit) dibuat dan diisi oleh admin di tab **Admin**. Anggota baru bisa langsung dimasukkan ke grup saat didaftarkan. Hak yang diberikan ke grup berlaku untuk semua anggotanya: yang ditambahkan ke grup langsung mendapatkannya, dan yang dikeluarkan langsung kehilangan. Menghapus grup tidak menghapus anggotanya.
- File dan subfolder **mengikuti folder induknya** secara bawaan, termasuk pemilik folder itu. Pilihan **Khusus** pada file atau subfolder menggantikan hak dari induk sepenuhnya. File baru di tingkat utama hanya bisa dilihat pemiliknya.
- Daftar hak disalin ke setiap dokumen karena kueri Firestore tidak bisa menelusuri rantai folder. Aplikasi menyebarkan perubahan ke isi folder dan menyelesaikannya saat daftar dimuat berikutnya bila terputus; aturan server hanya menerima salinan yang sama persis dengan daftar folder induk.
- **Folder** bertingkat tanpa batas kedalaman. Semua anggota bisa membuat folder di tingkat utama; isi sebuah folder hanya bisa ditambah pemiliknya dan admin. Dokumen diunggah ke folder yang sedang dipilih, dan pencarian mencakup semua yang bisa dilihat.
- **Seret dan lepas** SOP atau folder ke folder di pohon, ke breadcrumb, atau ke area daftar untuk memindahkannya (di komputer; di layar sentuh pakai menu Pindahkan). Folder tertutup terbuka sendiri bila disorot sebentar.
- Folder hanya bisa dihapus bila kosong. Isi yang tidak terlihat oleh penghapusnya, dan folder yang induknya tidak terlihat, tampil di tingkat utama.
- SOP yang dihapus masuk **Recycle bin**. Pengguna hanya melihat, memulihkan, dan menghapus permanen yang dia hapus sendiri; admin menangani semuanya.
- **Duplikat** menghasilkan SOP milik penyalinnya dengan hak akses yang sama seperti aslinya: semua yang bisa melihat
  atau mengedit aslinya mendapat hak yang sama pada salinan (ditandai **Khusus** bila berbeda dari folder tempatnya).
- **Riwayat lama bisa dihapus** oleh pemilik SOP dan admin: per versi (ikon tempat sampah di Riwayat), atau sekaligus
  lewat **Hapus riwayat lama…** dengan menyisakan sejumlah versi terbaru (0 = hapus seluruh riwayat; isi saat ini tetap
  utuh). Ruang yang dipakai versi itu dikembalikan ke kuota pustaka. Tidak bisa dibatalkan.
- Setiap penyimpanan membuat versi di **Riwayat**. Bila SOP sudah diubah orang lain, penyimpan memilih: timpa, simpan sebagai salinan, atau batal. Pemegang hak Lihat hanya bisa menyimpan sebagai salinan.
- **Bandingkan versi** (Riwayat › Bandingkan versi…, atau ikon bandingkan pada satu versi): dua versi mana pun, isi
  terkini, atau isi tab yang belum disimpan dibandingkan berdampingan. Yang ditampilkan: identitas SOP, butir
  ketentuan, pelaksana, dan kegiatan (ditambah, dihapus, diubah, atau dipindah) dengan perbedaan per kata.
- **Kembalikan versi saat SOP terbuka di tab**: isi versi lama dimuat ke tab itu sebagai perubahan biasa (bisa di-Undo)
  dan baru menjadi isi terkini setelah disimpan. Bila SOP tidak terbuka, versi lama langsung menjadi isi terkini.
- **Peta keterkaitan** (di bawah pohon folder): diagram SOP yang saling tertaut lewat butir Keterkaitan. Arahkan ke
  SOP untuk menyorot tautannya, klik untuk melihat yang dirujuk dan merujuknya, klik dua kali untuk membuka.
- **Komentar peninjauan** (tombol **Komentar** di toolbar): siapa pun yang bisa melihat SOP, termasuk pemegang hak
  Lihat, bisa berkomentar, membalas, menandai **Selesai**, dan membukanya lagi. Klik isian di halaman lalu tulis
  komentar, atau klik kanan isian › **Komentari…**; komentar juga bisa untuk seluruh SOP. Isian yang punya komentar
  terbuka diberi penanda kuning, komentar yang isiannya sudah berubah sejak dikomentari diberi tanda "diubah", dan
  komentar baru dari orang lain langsung muncul. Teks komentar hanya bisa diubah penulisnya; komentar bisa dihapus
  penulisnya, pemilik SOP, dan admin (balasannya ikut terhapus). Komentar terpisah dari isi SOP: tidak masuk riwayat,
  berkas .sop, maupun hasil ekspor, dan ekspor mengingatkan bila masih ada komentar yang belum selesai.
- **Sebut orang di komentar**: ketik `@` lalu pilih dari saran (hanya anggota yang bisa melihat SOP itu). Orang yang
  disebut melihat angka di tombol **Pustaka** dan daftar **Menyebut saya** (di bawah pohon folder) berisi komentar dari
  SOP mana pun yang menyebutnya; klik untuk membuka SOP dan komentarnya.
- **Ada komentar**: tiap SOP di daftar menampilkan jumlah komentar yang belum selesai, dan menu **Ada komentar** di
  bawah pohon folder mendaftar semua SOP yang masih punya komentar terbuka.
- **Tautan langsung**: klik kanan SOP (atau tab SOP daring) › **Salin tautan**, atau **Salin tautan** pada komentar.
  Tautan `…/sop-editor/?sop=ID` membuka SOP itu setelah penerimanya masuk (perlu hak lihat), dan tautan komentar
  sekaligus menyorot komentarnya.
- **Kunci edit**: SOP yang sedang terbuka di tab pemegang hak edit terkunci. Orang lain, termasuk pemegang hak Lihat,
  tidak bisa membukanya (dari daftar, tautan, maupun Keterkaitan) sampai tab itu ditutup; di daftar tampil
  "Terkunci, sedang diedit oleh …". Server juga menolak penyimpanan dari selain pemegang kunci. Kunci lepas sendiri
  sekitar 5 menit setelah browser pemegangnya tertutup, atau setelah sekitar 15 menit tanpa klik atau ketikan. Tidak
  ada yang bisa mengambil alih kunci sebelum itu, termasuk admin. Bila kunci ternyata dipegang orang lain, tab yang belum
  berubah ditutup, sedangkan tab berisi perubahan dilepas dari Pustaka Daring agar isinya tidak hilang.
- Pemakaian dan batas penyimpanan hanya tampil untuk admin. Angkanya perkiraan dari ukuran JSON, belum termasuk indeks Firestore.

Menyiapkan proyek Firebase (cukup sekali):

```bash
cd firebase
npm install
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes
```

Indeks di `firebase/firestore.indexes.json` dibutuhkan daftar **Menyebut saya** (kueri `mentions` lintas SOP);
pasang ulang dengan `npm run deploy:indexes` bila berubah.

Lalu di Firebase Console, buat dokumen `members/<email-admin>` berisi kolom `role` = `admin`. Anggota lain didaftarkan dari tab **Admin** di aplikasi; banyak email bisa ditempel sekaligus, dipisah koma, spasi,
titik koma, atau baris baru (format "Nama &lt;email&gt;" juga diterima). Email yang sudah terdaftar tidak diubah perannya,
hanya dimasukkan ke grup yang dipilih; alamat yang tidak sah dilewati setelah konfirmasi.

Batasan akses ditegakkan oleh `firebase/firestore.rules`. Setelah mengubahnya, jalankan `npm test` di folder `firebase/` (perlu Java) lalu deploy ulang.

## Pengembangan

```bash
npm install
npm run dev       # http://localhost:5173/sop-editor/
npm run build     # hasil di dist/
npm run preview
npm run icons     # buat ulang ikon PWA dari public/favicon.svg
```

Struktur utama:

| Berkas | Isi |
| --- | --- |
| `src/lib/model.js` | Struktur dokumen, validasi/normalisasi JSON, format tanggal |
| `src/lib/layout.js` | Mesin tata letak: dokumen → halaman berisi primitif (rect, poly, text, image, …) |
| `src/lib/PageSvg.svelte` | Renderer pratinjau (SVG) |
| `src/lib/PageFields.svelte` | Lapisan isian edit-langsung di atas halaman identitas dan diagram alir (posisi dari `page.fields`) |
| `src/assets/logo-ub.png` | Logo Universitas Brawijaya yang disematkan ke setiap dokumen |
| `src/lib/pdf.js` | Renderer PDF (jsPDF) |
| `src/lib/docx.js` | Ekspor DOCX: WordprocessingML ditulis langsung (diagram sebagai shape Word) lalu dikemas dengan fflate |
| `src/lib/png.js` | Ekspor PNG: tiap halaman digambar ke canvas lalu dikemas ZIP |
| `src/lib/validate.js` | Pemeriksa dokumen: alur diagram dan isian penting |
| `src/lib/duration.js` | Estimasi total waktu: membaca kolom Waktu dan menjumlahkannya di jalur utama |
| `src/lib/library.js` | Pustaka dokumen di IndexedDB: simpan per tab (id tab = id entri), daftar, hapus |
| `src/lib/LibraryDialog.svelte` | Dialog Pustaka: cari, label, duplikat |
| `src/lib/faculty.svelte.js` | Pustaka Daring: login, baca/tulis Firestore, riwayat, keterangan sedang diedit; Firebase dimuat saat pertama dipakai |
| `src/lib/FacultyDialog.svelte` | Dialog Pustaka Daring: pohon folder, daftar file, menu klik kanan, Recycle bin, tab Admin |
| `src/lib/AccessDialog.svelte` | Dialog hak akses file dan folder |
| `src/lib/FacultyConflict.svelte` | Pilihan saat penyimpanan bertabrakan |
| `firebase/firestore.rules` | Aturan akses Pustaka Daring, diuji oleh `firebase/rules.test.js` di emulator |
| `src/lib/xlsx.js` | Ekspor XLSX: mengisi template SOP (gaya, tema, logo), diagram sebagai shape DrawingML |
| `src/lib/fonts.js` | Font dokumen: Calibri dari perangkat (disimpan di IndexedDB) atau Carlito sebagai pengganti |
| `src/lib/aiPrompt.js` | Prompt untuk menghasilkan dokumen SOP dengan AI |
| `src/lib/richtext.js` | Format tebal/miring/garis bawah: parse tag, pemenggalan baris berformat, isian contenteditable |
| `src/lib/findReplace.js` | Daftar kolom teks dokumen, pencarian, dan penggantian |

## Deploy ke GitHub Pages

Workflow `.github/workflows/deploy.yml` membangun dan men-deploy setiap push ke `main`.
Aktifkan sekali di **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Base path diambil dari nama repositori. Untuk domain kustom, build dengan `BASE_PATH=/`.

## Format berkas (.sop, berisi JSON)

```jsonc
{
  "format": "sop-editor",
  "version": 1,
  "header": {
    "namaSop": "...", "nomor": "...",
    "tglPembuatan": "2023-08-07", "tglRevisi": "", "tglEfektif": "2023-10-20", // ISO, dicetak "07 Agustus 2023"
    ... // logo tidak disimpan (baku)
  },
  "sections": { "dasarHukum": { "numbered": true, "items": ["..."] }, ... },
  "actors": [{ "id": "a1", "name": "Mahasiswa" }],
  "steps": [{
    "id": "s1", "kegiatan": "...", "actor": "a1", "shape": "terminator | process | decision",
    "with": ["a2"], // opsional: pelaksana lain pada kegiatan bersama
    "kelengkapan": "", "waktu": "", "output": "", "keterangan": "",
    "next": "auto | none | <id langkah>", "alt": "<id langkah> | null",
    "yesLabel": "Ya", "noLabel": "Tidak"
  }],
  // opsional: tautan butir Keterkaitan ke SOP Pustaka Daring, dicocokkan dengan teks butirnya
  "links": [{ "text": "SOP Registrasi Mahasiswa", "sop": "<id SOP daring>", "title": "Registrasi Mahasiswa" }],
  // opsional: properti dokumen untuk metadata berkas ekspor; kolom yang tidak ada memakai nilai bawaan
  "meta": { "title": "...", "author": "...", "subject": "...", "keywords": "..." }
}
```

Butir `sections` serta `kegiatan`, `kelengkapan`, `waktu`, `output`, dan `keterangan` boleh berisi tag format
`<b>…</b>`, `<i>…</i>`, dan `<u>…</u>` (boleh bertumpuk). Hanya tiga tag itu yang dikenali, jadi teks seperti `< 3 hari`
tetap apa adanya. Kolom lain selalu teks polos.

## Rencana Pengembangan (Future Works)

**Diagram alir**
- Simbol tambahan: dokumen, data/arsip, dan sub-proses yang merujuk ke SOP lain.
- Klik simbol di pratinjau untuk langsung membuka langkah terkait di editor.

**Dokumen & tata letak**
- Pilihan ukuran kertas (A4/F4/Letter), margin, dan ukuran font.
- Nomor halaman dan footer (mis. "Halaman 1 dari 3", nomor SOP) di setiap halaman.
- Pemenggalan kata yang lebih baik untuk nama pelaksana yang panjang di kolom sempit.
- QR code verifikasi atau tanda tangan digital pada bagian pengesahan.

**Pengelolaan berkas**
- Berbagi via tautan (JSON terkompresi di URL) tanpa server.
- Ekspor SVG per halaman; impor langkah dari Excel/CSV.

**AI**
- Integrasi langsung dengan API penyedia AI (kunci API milik pengguna) agar SOP dibuat tanpa salin-tempel.
- Buat SOP dari notulen atau peraturan (impor SOP lama sudah tersedia).

**Editor**
- Antarmuka dwibahasa (Indonesia/Inggris).
- Cari & ganti dengan ekspresi reguler dan opsi "seluruh kata".

**Kualitas & infrastruktur**
- Uji otomatis untuk mesin tata letak (snapshot primitif per halaman) dan normalisasi JSON.
- `svelte-check` dan lint di CI sebelum deploy.
- Subset font Carlito untuk memperkecil ukuran cache PWA.

## Lisensi

Kode aplikasi: © 2026 Randy Cahya Wihandika, hak cipta dilindungi (lihat [LICENSE](LICENSE)). Kode boleh dilihat, tetapi tidak boleh disalin, diubah atau disebarkan tanpa izin tertulis. Font Carlito: SIL Open Font License 1.1 (`public/fonts/Carlito-OFL.txt`). Inter: SIL Open Font License 1.1.
