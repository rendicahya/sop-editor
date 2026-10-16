# SOP Editor

Aplikasi web (front-end saja, PWA) untuk membuat dan mengedit dokumen SOP berformat standar
(halaman identitas + diagram alir lintas pelaksana), menyimpannya sebagai JSON, dan mengekspornya ke PDF A4 lanskap.

Dibangun dengan Svelte 5 + Vite, jsPDF, dan vite-plugin-pwa.

## Fitur

- Editor identitas SOP (logo, nomor, tanggal, pengesahan + gambar tanda tangan/stempel).
- Bagian Dasar Hukum, Kualifikasi Pelaksana, Keterkaitan, Peralatan, Peringatan, Pencatatan.
- Daftar pelaksana (kolom diagram) dan langkah kegiatan dengan simbol Mulai/Selesai, Proses, Keputusan.
- Konektor otomatis termasuk cabang "tidak" pada keputusan dan konektor antarhalaman (A, B, …).
- Pratinjau langsung yang identik dengan hasil PDF (tata letak yang sama dipakai untuk keduanya).
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
  "header": { "namaSop": "...", "nomor": "...", "logo": { "src": "data:image/png;base64,...", "width": 0, "height": 0 }, ... },
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
