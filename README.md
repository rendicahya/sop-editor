# SOP Editor

Aplikasi web (front-end saja, PWA) untuk membuat dan mengedit dokumen SOP berformat standar
(halaman identitas + diagram alir lintas pelaksana), menyimpannya sebagai JSON, dan mengekspornya ke PDF A4 lanskap.

Dibangun dengan Svelte 5 + Vite, jsPDF, vite-plugin-pwa, serta Yjs + Trystero untuk kolaborasi real-time.

**Demo:** https://rendicahya.github.io/sop-editor/

## Fitur

- Editor identitas SOP: logo, nama instansi, nomor, tanggal pembuatan/efektif (date picker), tanggal revisi,
  pengesahan, serta gambar tanda tangan/stempel.
- Bagian Dasar Hukum, Kualifikasi Pelaksana, Keterkaitan, Peralatan/Perlengkapan, Peringatan, serta
  Pencatatan dan Pendataan, masing-masing bisa bernomor atau tidak.
- Daftar pelaksana (kolom diagram) dan langkah kegiatan dengan simbol Mulai/Selesai, Proses, dan Keputusan,
  plus kolom Mutu Baku (Kelengkapan, Waktu, Output) dan Keterangan.
- Konektor diagram dibuat otomatis, termasuk cabang "ya"/"tidak" pada keputusan dan konektor antarhalaman (A, B, …).
- Pratinjau langsung yang identik dengan hasil PDF, karena keduanya memakai mesin tata letak yang sama.
- PDF vektor (teks bisa diseleksi). Teks dokumen memakai font [Carlito](https://github.com/googlefonts/carlito),
  pengganti Calibri dengan metrik identik (file Calibri asli tidak boleh didistribusikan ulang). Font disematkan ke PDF.
- Simpan/buka JSON, seret-lepas berkas JSON ke jendela, simpan otomatis ke browser, Undo/Redo.
- **Kolaborasi real-time** tanpa server: edit satu dokumen bersama lewat tautan undangan, lihat siapa sedang
  mengedit bagian mana, dan ketik bersamaan di kolom yang sama tanpa saling menimpa.
- Bisa dipasang sebagai aplikasi (PWA), bekerja offline, dan membuka berkas `.json` lewat "Buka dengan".
- Tampilan responsif (beralih Edit/Pratinjau di layar kecil).

## Penggunaan

| Pintasan | Aksi |
| --- | --- |
| Ctrl+S / Ctrl+Shift+S | Simpan JSON / Simpan sebagai |
| Ctrl+O | Buka JSON |
| Ctrl+Shift+P | Ekspor PDF |
| Ctrl+Z / Ctrl+Y | Urungkan / Ulangi (saat fokus di luar kolom teks) |

Di Chrome/Edge, "Simpan" berikutnya langsung menimpa berkas yang sama (File System Access API).
Di browser lain, berkas diunduh.

Tombol **Contoh** memuat contoh SOP Skripsi untuk melihat semua fitur.

### Kolaborasi

1. Klik **Kolaborasi**, isi nama, lalu **Buat ruang**. Dokumen yang sedang terbuka menjadi isi ruang.
2. Salin tautan undangan dan bagikan. Penerima mengisi nama lalu **Gabung**; dokumennya diganti dengan dokumen ruang.
3. Semua perubahan langsung tersinkron. Avatar peserta tampil di toolbar, titik berwarna di tab menunjukkan posisi
   mereka, dan kartu langkah yang sedang diedit orang lain diberi bingkai berwarna beserta namanya.
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
| `src/lib/pdf.js` | Renderer PDF (jsPDF) |
| `src/lib/fonts.js` | Pemuatan & registrasi font Carlito |
| `src/lib/collab.svelte.js` | Ruang kolaborasi: Yjs, koneksi P2P (Trystero), kehadiran, undo per pengguna |
| `src/lib/ysync.js` | Selisih dua arah antara dokumen JSON dan struktur Yjs |
| `src/lib/editors/` | Komponen form editor |

## Deploy ke GitHub Pages

Workflow `.github/workflows/deploy.yml` membangun dan men-deploy setiap push ke `main`.
Aktifkan sekali di **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Base path diambil dari nama repositori. Untuk domain kustom, build dengan `BASE_PATH=/`.

## Format JSON

```jsonc
{
  "format": "sop-editor",
  "version": 1,
  "header": {
    "namaSop": "...", "nomor": "...",
    "tglPembuatan": "2023-08-07", "tglEfektif": "2023-10-20", // ISO, dicetak "07 Agustus 2023"
    "tglRevisi": "teks bebas",
    "logo": { "src": "data:image/png;base64,...", "width": 0, "height": 0 }, ...
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
- Riwayat revisi (daftar tanggal dan ringkasan perubahan) dan date picker untuk tanggal revisi.
- QR code verifikasi atau tanda tangan digital pada bagian pengesahan.

**Pengelolaan berkas**
- Pustaka multi-dokumen di browser (IndexedDB): daftar, cari, duplikasi, dan templat SOP.
- Keterkaitan antar-SOP yang bisa ditautkan ke dokumen lain di pustaka.
- Berbagi via tautan (JSON terkompresi di URL) tanpa server.
- Ekspor tambahan: PNG/SVG per halaman dan DOCX; impor langkah dari Excel/CSV.

**Kolaborasi**
- Konfigurasi server TURN (mis. dari layanan pihak ketiga) agar tetap tersambung di jaringan yang ketat.
- Opsi sinkronisasi lewat server (Firebase/Supabase/y-websocket) untuk dokumen terpusat, login akun institusi, dan
  hak akses baca saja / edit.
- Kursor dan sorotan teks peserta lain di dalam kolom, serta komentar per langkah.
- Daftar ruang yang pernah diikuti dan riwayat versi (snapshot Yjs) yang bisa dipulihkan.

**Editor**
- Seret-lepas untuk mengurutkan langkah, butir, dan pelaksana.
- Mode gelap dan antarmuka dwibahasa (Indonesia/Inggris).

**Kualitas & infrastruktur**
- Uji otomatis untuk mesin tata letak (snapshot primitif per halaman) dan normalisasi JSON.
- `svelte-check` dan lint di CI sebelum deploy.
- Memperbarui GitHub Actions ke versi berbasis Node 24.
- Subset font Carlito untuk memperkecil ukuran cache PWA.

## Lisensi

Kode aplikasi: lihat [LICENSE](LICENSE). Font Carlito: SIL Open Font License 1.1 (`public/fonts/Carlito-OFL.txt`).
