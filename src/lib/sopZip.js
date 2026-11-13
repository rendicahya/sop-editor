// Cadangan Pustaka Daring: SOP dikemas sebagai berkas .sop di dalam ZIP, dengan susunan folder yang sama.
// ZIP ini bisa diunggah kembali lewat "Unggah berkas .sop atau .zip" (lihat sopFiles.js).
import { zipSync, strToU8 } from 'fflate';

/** Teks berkas .sop, sama dengan hasil "Simpan" di editor. */
export const sopText = (json) => JSON.stringify(JSON.parse(json), null, 2);

/** Nama yang aman untuk berkas/folder di Windows, macOS, dan Linux. */
export function safeName(name) {
  const s = String(name ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120)
    .trim();
  if (!s) return 'Tanpa nama';
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s) ? `_${s}` : s;
}

/**
 * files: [{ dirs: [nama folder], name, json, mtime }] → Blob ZIP.
 * Nama yang bentrok (tanpa membedakan huruf besar) diberi akhiran " (2)", " (3)", dst.
 */
export function sopZip(files) {
  const out = {};
  const taken = new Set();
  for (const f of files) {
    const dir = f.dirs.map(safeName).join('/');
    const base = (dir ? dir + '/' : '') + safeName(f.name);
    let path = `${base}.sop`;
    for (let n = 2; taken.has(path.toLowerCase()); n++) path = `${base} (${n}).sop`;
    taken.add(path.toLowerCase());
    out[path] = [strToU8(sopText(f.json)), { mtime: f.mtime ? new Date(f.mtime) : new Date() }];
  }
  return new Blob([zipSync(out, { level: 6 })], { type: 'application/zip' });
}
