# SOP Editor

Aplikasi web (front-end saja, PWA) untuk membuat dan mengedit dokumen SOP berformat standar
(halaman identitas + diagram alir lintas pelaksana), menyimpannya sebagai berkas `.sop` (isinya JSON), dan mengekspornya ke PDF A4 lanskap atau Word.

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
- Zoom pratinjau dengan tombol −/+ atau slider di bar tab.
- Konektor diagram dibuat otomatis, termasuk cabang "ya"/"tidak" pada keputusan dan konektor antarhalaman (A, B, …). Jalur garis dicari otomatis agar tidak menembus simbol dan tidak saling menumpuk.
- Pratinjau langsung yang identik dengan hasil PDF, karena keduanya memakai mesin tata letak yang sama.
- **Beberapa SOP sekaligus** dalam tab: Baru, Buka, Contoh, dan Buat dengan AI membuka dokumen di tab baru (tab kosong dipakai ulang). Tab bisa diseret untuk mengubah urutan dan ditutup dengan klik tengah. Semua tab tersimpan otomatis di browser; riwayat Undo terpisah per tab. Saat bergabung di ruang kolaborasi, ruang terikat pada tab yang aktif.
- **Ekspor PDF** menampilkan PDF yang sebenarnya dulu dalam dialog pratinjau; berkas baru diunduh lewat tombol **Unduh PDF**.
- **Ekspor DOCX** (Word) yang bisa diedit: halaman identitas menjadi tabel Word biasa (daftar bernomor asli), dan
  halaman diagram alir menjadi tabel dengan kolom/baris berukuran sama persis seperti pratinjau. Teks semua sel bisa
  diedit di Word, sedangkan diagramnya (simbol, garis, label, konektor) disisipkan sebagai gambar vektor (SVG, dengan
  cadangan PNG untuk Word lama) di belakang tabel. Tinggi baris diagram dikunci agar tetap sejajar dengan gambar, jadi
  perubahan besar (teks bertambah banyak, langkah baru) sebaiknya dilakukan di aplikasi lalu diekspor ulang.
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
- **Buat dengan AI**: salin prompt siap pakai ke asisten AI, lalu tempel jawabannya untuk langsung
  diedit dan diekspor.
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
| Ctrl+Z / Ctrl+Y | Urungkan / Ulangi (saat fokus di luar kolom teks) |

Pada butir ketentuan di halaman 1: **Enter** membuat butir baru (memecah di posisi kursor), **Backspace** di awal butir
menggabungkannya dengan butir sebelumnya, **Alt+↑/↓** memindahkan butir, dan **↑/↓** di awal/akhir butir berpindah
antarbutir.

Di Chrome/Edge, "Simpan" berikutnya langsung menimpa berkas yang sama (File System Access API).
Di browser lain, berkas diunduh.

Tombol **Contoh** memuat contoh SOP Skripsi untuk melihat semua fitur.

### Buat dengan AI

1. Klik **Buat dengan AI**, tulis deskripsi singkat prosesnya (opsional), lalu **Salin prompt**.
2. Tempel prompt ke asisten AI. Prompt berisi aturan format, contoh, serta nama dan NIP dekan bawaan sebagai pengesah, sehingga AI menjawab
   dengan JSON dokumen SOP.
3. Salin jawabannya ke kolom **Tempel jawaban AI** lalu **Buka di editor**, atau unduh berkas `.json` dari AI lalu buka
   seperti biasa. Periksa kembali isinya (terutama dasar hukum) sebelum diekspor.

Pembuka JSON sengaja toleran terhadap jawaban AI: teks pengantar dan pembungkus ```` ```json ```` diabaikan,
`format` boleh tidak ada, `actor` boleh berisi nama pelaksana (pelaksana baru ditambahkan otomatis), id yang hilang
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
| `src/lib/fonts.js` | Font dokumen: Calibri dari perangkat (disimpan di IndexedDB) atau Carlito sebagai pengganti |
| `src/lib/aiPrompt.js` | Prompt untuk menghasilkan dokumen SOP dengan AI |
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
    "kelengkapan": "", "waktu": "", "output": "", "keterangan": "",
    "next": "auto | none | <id langkah>", "alt": "<id langkah> | null",
    "yesLabel": "Ya", "noLabel": "Tidak"
  }]
}
```

## Rencana Pengembangan (Future Works)

**Diagram alir**
- Penyesuaian manual jalur konektor (geser titik belok, pilih sisi keluar/masuk) bila jalur otomatis bersilangan.
- Latar putih di belakang label cabang agar tidak tertimpa garis tabel.
- Satu langkah dengan lebih dari satu pelaksana (aktivitas paralel / bersama).
- Simbol tambahan: dokumen, data/arsip, dan sub-proses yang merujuk ke SOP lain.
- Klik simbol di pratinjau untuk langsung membuka langkah terkait di editor.
- Peringatan validasi: langkah yang tidak terjangkau, keputusan tanpa cabang "tidak", alur tanpa titik akhir.

**Dokumen & tata letak**
- Pilihan ukuran kertas (A4/F4/Letter), margin, dan ukuran font.
- Nomor halaman dan footer (mis. "Halaman 1 dari 3", nomor SOP) di setiap halaman.
- Pemenggalan kata yang lebih baik untuk nama pelaksana yang panjang di kolom sempit.
- Format teks sederhana (tebal/miring) di Keterangan dan Dasar Hukum.
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
- Revisi dengan AI: kirim dokumen yang sedang dibuka beserta instruksi ("pecah langkah 3", "rapikan keterangan").
- Buat SOP dari dokumen yang ada (PDF/DOCX SOP lama, notulen, atau peraturan).

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
