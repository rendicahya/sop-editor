// Font dokumen: Carlito (OFL), metrik identik dengan Calibri. File TTF ada di public/fonts
// dan harus dimuat (loadFonts) sebelum tata letak/ekspor PDF dipakai.

export const FONT = 'Carlito';
const FILES = { normal: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf' };

let data = null;

/** Set data font langsung (base64 per gaya) — dipakai saat tidak ada fetch, mis. di Node. */
export function setFontData(d) {
  data = d;
}

export async function loadFonts(baseUrl) {
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([style, file]) => {
      const res = await fetch(`${baseUrl}fonts/${file}`);
      if (!res.ok) throw new Error(`Font ${file} gagal dimuat (${res.status}).`);
      return [style, toBase64(await res.arrayBuffer())];
    })
  );
  data = Object.fromEntries(entries);
}

export function registerFonts(pdf) {
  if (!data) throw new Error('Font dokumen belum dimuat.');
  for (const [style, file] of Object.entries(FILES)) {
    pdf.addFileToVFS(file, data[style]);
    pdf.addFont(file, FONT, style);
  }
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
