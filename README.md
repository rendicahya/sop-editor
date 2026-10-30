# SOP Editor

Aplikasi web (front-end saja, PWA) untuk membuat dan mengedit dokumen SOP berformat standar
(halaman identitas + diagram alir lintas pelaksana), menyimpannya sebagai berkas `.sop` (isinya JSON), dan mengekspornya ke PDF A4 lanskap, Word, atau Excel.

Dibangun dengan Svelte 5 + Vite, jsPDF, vite-plugin-pwa, serta Yjs + Trystero untuk kolaborasi real-time.

**Demo:** https://rendicahya.github.io/sop-editor/

## Fitur

- Format baku SOP Universitas Brawijaya: logo UB selalu tercetak; dokumen baru otomatis berisi kop kementerian sampai
  "UNIVERSITAS BRAWIJAYA" (kementerian, Fakultas Ilmu Komputer, UB), awalan nomor SOP `UN10/F15/`, pengesah Dekan FILKOM beserta nama dan NIP-nya,
  serta tanggal pembuatan dan tanggal efektif hari ini. Semuanya tetap bisa diubah.
- **Halaman 1 diedit langsung di pratinjau (WYSIWYG)**: klik teks di halaman untuk mengetik nama instansi, nomor,
  tanggal pembuatan/revisi/efektif (date picker), pengesahan, gambar tanda tangan/stempel, dan setiap butir ketentuan.
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
- **Format teks tebal, miring, dan garis bawah** pada butir ketentuan dan sel tabel langkah (Kegiatan, Kelengkapan,
  Waktu, Output, Keterangan): tombol **B / I / U** di bar tab atau Ctrl+B / Ctrl+I / Ctrl+U. Format ikut tercetak di
  pratinjau, PDF, dan DOCX.
- **Ubah huruf besar/kecil** di isian yang sama lewat tombol **Aa** (HURUF BESAR, huruf kecil, Huruf Awal Kata,
  Huruf awal kalimat) atau Shift+F3 untuk berganti mode seperti di Word. Tanpa seleksi, yang diubah kata di kursor.
- **Daftar poin dan bernomor di dalam sel langkah** lewat tombol daftar di bar tab atau Ctrl+Shift+8 / Ctrl+Shift+7.
  Enter melanjutkan butir (nomor bertambah otomatis), Enter pada butir kosong atau Backspace setelah penanda mengakhiri
  daftar. Baris lanjutan butir menjorok rata dengan teksnya di pratinjau, PDF, dan DOCX.
- Zoom pratinjau dengan tombol −/+ atau slider di bar tab.
- Konektor diagram dibuat otomatis, termasuk cabang "ya"/"tidak" pada keputusan dan konektor antarhalaman (A, B, …). Jalur garis dicari otomatis agar tidak menembus simbol dan tidak saling menumpuk.
- **Atur jalur garis secara manual** bila jalur otomatis kurang rapi: klik garis untuk memilih sisi keluar/masuk
  simbol, lalu seret kotak kecil pada ruas garis untuk menggesernya. Posisi disimpan relatif terhadap lajur dan baris,
  jadi tetap berlaku saat tata letak berubah. "Kembalikan jalur otomatis" menghapus pengaturan manualnya.
- Pratinjau langsung yang identik dengan hasil PDF, karena keduanya memakai mesin tata letak yang sama.
- **Beberapa SOP sekaligus** dalam tab: Baru, Buka, Contoh, dan Asisten AI membuka dokumen di tab baru (tab kosong dipakai ulang). Tab bisa diseret untuk mengubah urutan dan ditutup dengan klik tengah. Semua tab tersimpan otomatis di browser; riwayat Undo terpisah per tab. Saat bergabung di ruang kolaborasi, ruang terikat pada tab yang aktif.
- **Ekspor PDF** menampilkan PDF yang sebenarnya dulu dalam dialog pratinjau; berkas baru diunduh lewat tombol **Unduh PDF**.
- **Ekspor DOCX** (Word) yang bisa diedit: halaman identitas menjadi tabel Word biasa (daftar bernomor asli), dan
  halaman diagram alir menjadi tabel dengan kolom/baris berukuran sama persis seperti pratinjau. Teks semua sel bisa
  diedit di Word, sedangkan diagramnya (simbol, garis, label, konektor) disisipkan sebagai gambar vektor (SVG, dengan
  cadangan PNG untuk Word lama) di belakang tabel. Tinggi baris diagram dikunci agar tetap sejajar dengan gambar, jadi
  perubahan besar (teks bertambah banyak, langkah baru) sebaiknya dilakukan di aplikasi lalu diekspor ulang.
- **Ekspor XLSX** (Excel) mengikuti template SOP (`src/assets/template-sop.xlsx`): sheet **Cover** berisi identitas
  (logo, nomor, tanggal, pengesahan beserta tanda tangan, dan keenam bagian ketentuan) dan sheet **Flowchart** berisi
  tabel langkah. Simbol, garis alur berpanah, label ya/tidak, dan konektor antarhalaman digambar sebagai **shape Excel
  yang bisa diedit**, dengan posisi sama seperti PDF. Pemisah halaman cetak mengikuti PDF dan kepala tabel diulang di
  tiap halaman.
- PDF vektor (teks bisa diseleksi). Dokumen SOP wajib memakai **Calibri**, yang disematkan ke PDF. Karena file Calibri
  tidak boleh didistribusikan ulang, font diambil dari perangkat pengguna: tombol **Pakai Calibri perangkat**
  (Local Font Access API, Chrome/Edge desktop) atau **Pilih file Calibri…** (`calibri.ttf` + `calibrib.ttf`, di Windows
  ada di `C:\Windows\Fonts`). Cukup sekali; font disimpan di IndexedDB browser tersebut. Selama Calibri belum tersedia
  dipakai [Carlito](https://github.com/googlefonts/carlito) (metrik identik, jadi tata letak tidak berubah) dan muncul
  peringatan di atas pratinjau.
- Antarmuka memakai font [Inter](https://rsms.me/inter/).
- Simpan/buka berkas `.sop` (berkas `.json` lama tetap bisa dibuka), seret-lepas berkas ke jendela, simpan otomatis ke browser, Undo/Redo.
- **Kolaborasi real-time** tanpa server: edit satu dokumen bersama lewat tautan undangan, lihat siapa sedang
  mengedit bagian mana, dan ketik bersamaan di kolom yang sama tanpa saling menimpa.
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
| Ctrl+S / Ctrl+Shift+S | Simpan / Simpan sebagai |
| Ctrl+O | Buka berkas |
| Ctrl+Shift+P | Pratinjau & ekspor PDF |
| Ctrl+F / Ctrl+H | Cari & ganti (Esc untuk menutup) |
| Ctrl+Z / Ctrl+Y | Urungkan / Ulangi per langkah (format dan ubah huruf menjadi langkah tersendiri) |
| Ctrl+B / Ctrl+I / Ctrl+U | Tebal / miring / garis bawah (di butir ketentuan dan sel langkah) |
| Shift+F3 | Ganti huruf: BESAR → kecil → Awal Kata |
| Ctrl+Shift+8 / Ctrl+Shift+7 | Daftar poin / bernomor (di sel langkah) |

Pada butir ketentuan di halaman 1: **Enter** membuat butir baru (memecah di posisi kursor), **Backspace** di awal butir
menggabungkannya dengan butir sebelumnya, **Alt+↑/↓** memindahkan butir, dan **↑/↓** di awal/akhir butir berpindah
antarbutir.

Di Chrome/Edge, "Simpan" berikutnya langsung menimpa berkas yang sama (File System Access API).
Di browser lain, berkas diunduh.

Tombol **Contoh** memuat contoh SOP Skripsi untuk melihat semua fitur.

### Asisten AI

1. Klik **Asisten AI**, tulis deskripsi singkat prosesnya (opsional), lalu **Salin prompt**.
2. Tempel prompt ke asisten AI. Prompt berisi aturan format, contoh, serta nama dan NIP dekan bawaan sebagai pengesah, sehingga AI menjawab
   dengan JSON dokumen SOP.
3. Salin jawabannya ke kolom **Tempel jawaban AI** lalu **Buka di editor**, atau unduh berkas `.json` dari AI lalu buka
   seperti biasa. Periksa kembali isinya (terutama dasar hukum) sebelum diekspor.

**Impor SOP lama:** pilih tab **Impor SOP lama**, lampirkan berkas SOP lama di chat AI, lalu tempel promptnya. Prompt
meminta AI menyalin teks apa adanya, membaca pelaksana dari kolom letak simbol, mengikuti panah dan cabang keputusan,
serta mempertahankan teks tebal/miring/garis bawah. Secara bawaan kop instansi dan pengesah diperbarui ke bawaan saat
ini (bisa dimatikan). Catatan tambahan untuk AI bisa ditulis di dialog. Bandingkan hasilnya dengan dokumen asli,
terutama arah panah.

**Revisi SOP ini:** pilih tab **Revisi SOP ini**, tulis instruksi perubahan, lalu salin prompt. Prompt berisi seluruh
dokumen yang sedang dibuka (tanpa gambar tanda tangan) dan meminta AI mengubah hanya bagian yang diminta serta
mempertahankan id langkah. Jawaban yang ditempel menggantikan dokumen aktif sebagai satu langkah Undo; tanda tangan dan
jalur garis manual dipertahankan.

Pembuka JSON sengaja toleran terhadap jawaban AI: teks pengantar dan pembungkus ```` ```json ```` diabaikan,
`format` boleh tidak ada, `<strong>`/`<em>`/`**tebal**` diseragamkan menjadi tag format, `actor` boleh berisi nama pelaksana (pelaksana baru ditambahkan otomatis), id yang hilang
atau ganda dibuat ulang, `next`/`alt` boleh berisi nomor urut atau nama kegiatan, dan sinonim simbol
("start", "keputusan", …) dikenali.

### Kolaborasi

1. Klik **Kolaborasi**, isi nama, lalu **Buat ruang**. Dokumen yang sedang terbuka menjadi isi ruang.
2. Salin tautan undangan dan bagikan. Penerima mengisi nama lalu **Gabung**; dokumennya diganti dengan dokumen ruang.
3. Semua perubahan langsung tersinkron. Avatar peserta tampil di toolbar, dan kartu langkah yang sedang diedit orang lain diberi bingkai berwarna beserta namanya.
4. Undo/Redo di dalam ruang hanya membatalkan perubahan Anda sendiri.

Cara kerjanya:

- Dokumen disimpan sebagai CRDT [Yjs](https://yjs.dev), sehingga suntingan bersamaan digabung otomatis
  (teks per karakter; pilihan, tanggal, dan gambar diganti utuh).
- Browser saling menemukan lewat relay [Nostr](https://nostr.com) publik ([Trystero](https://github.com/dmotz/trystero)),
  lalu data dikirim langsung antar-peserta melalui WebRTC. Tidak ada server yang menyimpan dokumen.
- Tautan berisi id ruang dan kunci acak; kunci mengenkripsi proses pencarian peer, jadi hanya pemegang tautan yang bisa
  bergabung. Bagikan tautan hanya kepada orang yang boleh mengedit.
- Isi ruang tersimpan di IndexedDB setiap peserta. Membuka tautan lagi (atau memuat ulang halaman) langsung masuk
  kembali ke ruang, dan dokumen tetap bisa dibuka meski peserta lain sedang offline.
- Keterbatasan: koneksi peer-to-peer tanpa server TURN bisa gagal di jaringan dengan NAT/firewall ketat
  (sebagian jaringan kantor/kampus). Peserta yang bergabung baru melihat dokumen setelah tersambung dengan minimal satu
  peserta lain yang memegang isi ruang.

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
| `src/lib/model.js` | Struktur dokumen, contoh, validasi/normalisasi JSON, format tanggal |
| `src/lib/layout.js` | Mesin tata letak: dokumen → halaman berisi primitif (rect, poly, text, image, …) |
| `src/lib/PageSvg.svelte` | Renderer pratinjau (SVG) |
| `src/lib/PageFields.svelte` | Lapisan isian edit-langsung di atas halaman identitas dan diagram alir (posisi dari `page.fields`) |
| `src/assets/logo-ub.png` | Logo Universitas Brawijaya yang disematkan ke setiap dokumen |
| `src/lib/pdf.js` | Renderer PDF (jsPDF) |
| `src/lib/docx.js` | Ekspor DOCX: WordprocessingML ditulis langsung lalu dikemas dengan fflate |
| `src/lib/xlsx.js` | Ekspor XLSX: mengisi template SOP (gaya, tema, logo), diagram sebagai shape DrawingML |
| `src/lib/fonts.js` | Font dokumen: Calibri dari perangkat (disimpan di IndexedDB) atau Carlito sebagai pengganti |
| `src/lib/aiPrompt.js` | Prompt untuk menghasilkan dokumen SOP dengan AI |
| `src/lib/richtext.js` | Format tebal/miring/garis bawah: parse tag, pemenggalan baris berformat, isian contenteditable |
| `src/lib/findReplace.js` | Daftar kolom teks dokumen, pencarian, dan penggantian |
| `src/lib/collab.svelte.js` | State ruang kolaborasi (status, peserta, tautan); memuat mesinnya saat pertama kali masuk ruang |
| `src/lib/collabSession.js` | Mesin kolaborasi (dimuat terpisah): Yjs, koneksi P2P (Trystero), kehadiran, undo per pengguna |
| `src/lib/ysync.js` | Selisih dua arah antara dokumen JSON dan struktur Yjs |

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
    "signature": { "src": "data:image/png;base64,...", "width": 0, "height": 0 }, ... // logo tidak disimpan (baku)
  },
  "sections": { "dasarHukum": { "numbered": true, "items": ["..."] }, ... },
  "actors": [{ "id": "a1", "name": "Mahasiswa" }],
  "steps": [{
    "id": "s1", "kegiatan": "...", "actor": "a1", "shape": "terminator | process | decision",
    "with": ["a2"], // opsional: pelaksana lain pada kegiatan bersama
    "kelengkapan": "", "waktu": "", "output": "", "keterangan": "",
    "next": "auto | none | <id langkah>", "alt": "<id langkah> | null",
    "yesLabel": "Ya", "noLabel": "Tidak"
  }]
}
```

Butir `sections` serta `kegiatan`, `kelengkapan`, `waktu`, `output`, dan `keterangan` boleh berisi tag format
`<b>…</b>`, `<i>…</i>`, dan `<u>…</u>` (boleh bertumpuk). Hanya tiga tag itu yang dikenali, jadi teks seperti `< 3 hari`
tetap apa adanya. Kolom lain selalu teks polos.

## Rencana Pengembangan (Future Works)

**Diagram alir**
- Latar putih di belakang label cabang agar tidak tertimpa garis tabel.
- Simbol tambahan: dokumen, data/arsip, dan sub-proses yang merujuk ke SOP lain.
- Klik simbol di pratinjau untuk langsung membuka langkah terkait di editor.
- Peringatan validasi: langkah yang tidak terjangkau, keputusan tanpa cabang "tidak", alur tanpa titik akhir.

**Dokumen & tata letak**
- Pilihan ukuran kertas (A4/F4/Letter), margin, dan ukuran font.
- Nomor halaman dan footer (mis. "Halaman 1 dari 3", nomor SOP) di setiap halaman.
- Pemenggalan kata yang lebih baik untuk nama pelaksana yang panjang di kolom sempit.
- Riwayat revisi (daftar tanggal dan ringkasan perubahan).
- QR code verifikasi atau tanda tangan digital pada bagian pengesahan.

**Pengelolaan berkas**
- Pustaka multi-dokumen di browser (IndexedDB): daftar, cari, duplikasi, dan templat SOP.
- Keterkaitan antar-SOP yang bisa ditautkan ke dokumen lain di pustaka.
- Berbagi via tautan (JSON terkompresi di URL) tanpa server.
- Ekspor tambahan: PNG/SVG per halaman; impor langkah dari Excel/CSV.
- Diagram di DOCX sebagai bentuk Word yang bisa diedit (saat ini berupa gambar).

**Kolaborasi**
- Konfigurasi server TURN (mis. dari layanan pihak ketiga) agar tetap tersambung di jaringan yang ketat.
- Opsi sinkronisasi lewat server (Firebase/Supabase/y-websocket) untuk dokumen terpusat, login akun institusi, dan
  hak akses baca saja / edit.
- Kursor dan sorotan teks peserta lain di dalam kolom, serta komentar per langkah.
- Daftar ruang yang pernah diikuti dan riwayat versi (snapshot Yjs) yang bisa dipulihkan.

**AI**
- Integrasi langsung dengan API penyedia AI (kunci API milik pengguna) agar SOP dibuat tanpa salin-tempel.
- Buat SOP dari notulen atau peraturan (impor SOP lama sudah tersedia).

**Editor**
- Seret-lepas untuk mengurutkan langkah, butir, dan pelaksana.
- Antarmuka dwibahasa (Indonesia/Inggris).
- Cari & ganti dengan ekspresi reguler dan opsi "seluruh kata".

**Kualitas & infrastruktur**
- Uji otomatis untuk mesin tata letak (snapshot primitif per halaman) dan normalisasi JSON.
- `svelte-check` dan lint di CI sebelum deploy.
- Memperbarui GitHub Actions ke versi berbasis Node 24.
- Subset font Carlito untuk memperkecil ukuran cache PWA.

## Lisensi

Kode aplikasi: lihat [LICENSE](LICENSE). Font Carlito: SIL Open Font License 1.1 (`public/fonts/Carlito-OFL.txt`). Inter: SIL Open Font License 1.1.
