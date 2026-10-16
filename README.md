# SOP Editor

Aplikasi web (front-end saja, PWA) untuk membuat dan mengedit dokumen SOP berformat standar
(halaman identitas + diagram alir lintas pelaksana), menyimpannya sebagai JSON, dan mengekspornya ke PDF A4 lanskap.

Dibangun dengan Svelte 5 + Vite, jsPDF, dan vite-plugin-pwa.

**Demo:** https://rendicahya.github.io/sop-editor/

## Fitur

- Editor identitas SOP (logo, nomor, tanggal pembuatan/efektif dengan date picker, pengesahan + gambar tanda tangan/stempel).
- Bagian Dasar Hukum, Kualifikasi Pelaksana, Keterkaitan, Peralatan, Peringatan, Pencatatan.
- Daftar pelaksana (kolom diagram) dan langkah kegiatan dengan simbol Mulai/Selesai, Proses, Keputusan.
- Konektor otomatis termasuk cabang "tidak" pada keputusan dan konektor antarhalaman (A, B, …).
- Pratinjau langsung yang identik dengan hasil PDF (tata letak yang sama dipakai untuk keduanya).
- Teks dokumen memakai font [Carlito](https://github.com/googlefonts/carlito), pengganti Calibri dengan metrik identik
  (file Calibri asli tidak boleh didistribusikan ulang). Font disematkan ke PDF.
- Simpan/buka JSON (Ctrl+S / Ctrl+O, juga seret-lepas berkas), simpan otomatis ke browser, Undo/Redo.
- Bisa dipasang sebagai aplikasi (PWA) dan bekerja offline.

## Pengembangan

```bash
npm install
npm run dev       # http://localhost:5173/sop-editor/
npm run build     # hasil di dist/
npm run preview
npm run icons     # buat ulang ikon PWA dari public/favicon.svg
```

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

## Lisensi

Kode aplikasi: lihat [LICENSE](LICENSE). Font Carlito: SIL Open Font License 1.1 (`public/fonts/Carlito-OFL.txt`).
