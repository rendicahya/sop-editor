// Utilitas berkas: simpan/buka dokumen SOP, unduh blob, dan impor gambar.
// Isi berkas berupa JSON, tetapi disimpan berekstensi .sop; .json lama (dan berkas dari AI) tetap bisa dibuka.

const SAVE_TYPES = [{ description: 'Dokumen SOP', accept: { 'application/json': ['.sop'] } }];
const OPEN_TYPES = [{ description: 'Dokumen SOP', accept: { 'application/json': ['.sop', '.json'] } }];

/** Nama berkas dengan ekstensi .sop (mengganti .json lama). */
export function sopName(name) {
  return name.replace(/\.(json|sop)$/i, '') + '.sop';
}

export function slug(name) {
  return (
    String(name || 'dokumen')
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'dokumen'
  );
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Menyimpan JSON. Memakai File System Access API bila tersedia (agar "Simpan" berikutnya
 * menulis ke berkas yang sama), selain itu mengunduh berkas.
 * @returns handle berkas (atau null) — undefined bila dibatalkan pengguna.
 */
export async function saveJson(text, suggestedName, handle, saveAs = false) {
  const blob = new Blob([text], { type: 'application/json' });
  if ('showSaveFilePicker' in window) {
    try {
      if (!handle || saveAs) handle = await window.showSaveFilePicker({ suggestedName, types: SAVE_TYPES });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return handle;
    } catch (e) {
      if (e?.name === 'AbortError') return undefined;
      throw e;
    }
  }
  downloadBlob(blob, suggestedName);
  return null;
}

export async function openJsonFile() {
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: OPEN_TYPES });
      const file = await handle.getFile();
      return { text: await file.text(), name: file.name, handle };
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sop,.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { text: await file.text(), name: file.name, handle: null } : null);
    };
    input.click();
  });
}

/** Membaca gambar, memperkecil bila perlu, dan mengembalikan {src, width, height}. */
export async function readImage(file, maxSide = 1000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
      el.src = url;
    });
    const w0 = img.naturalWidth || 300;
    const h0 = img.naturalHeight || 300;
    const s = Math.min(1, maxSide / Math.max(w0, h0));
    const width = Math.max(1, Math.round(w0 * s));
    const height = Math.max(1, Math.round(h0 * s));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const jpeg = file.type === 'image/jpeg';
    if (jpeg) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    const src = jpeg ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
    return { src, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
