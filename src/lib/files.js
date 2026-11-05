// Utilitas berkas: simpan/buka dokumen SOP dan unduh blob.
// Isi berkas berupa JSON, tetapi disimpan berekstensi .sop; .json lama (dan berkas dari AI) tetap bisa dibuka.

const SAVE_TYPES = [{ description: 'Dokumen SOP', accept: { 'application/json': ['.sop'] } }];
const OPEN_TYPES = [
  { description: 'Dokumen SOP', accept: { 'application/json': ['.sop', '.json'], 'application/pdf': ['.pdf'] } }
];

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
      return { file: await handle.getFile(), handle };
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sop,.json,.pdf,application/json,application/pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { file, handle: null } : null);
    };
    input.click();
  });
}
