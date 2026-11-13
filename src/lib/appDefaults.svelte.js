// Isian bawaan untuk SOP baru (kop, awalan nomor, pengesah). Admin mengaturnya di Pustaka Daring › Admin;
// nilainya disimpan di Firestore `config/sop`, diikuti secara langsung, dan disimpan juga di browser agar tetap
// berlaku saat luring. Sengaja tidak ada nilai yang ditulis di kode: sebelum admin mengaturnya, semuanya kosong.

const EMPTY = Object.freeze({ institution: '', nomor: '', disahkanJabatan: '', disahkanNama: '', disahkanNip: '' });

/** Kunci yang bisa diatur admin, beserta label dan batas panjangnya (sama dengan validDefaults di firestore.rules). */
export const DEFAULT_FIELDS = [
  ['institution', 'Kop instansi', 300],
  ['nomor', 'Awalan nomor SOP', 60],
  ['disahkanJabatan', 'Jabatan pengesah', 200],
  ['disahkanNama', 'Nama pengesah', 200],
  ['disahkanNip', 'NIP pengesah', 60]
];

const KEY = 'sop-defaults';

function cached() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return c && typeof c === 'object' ? c : null;
  } catch {
    return null;
  }
}

/** Hanya kunci yang dikenal dan bertipe teks; sisanya kosong. */
function clean(d) {
  const out = { ...EMPTY };
  for (const [k, , max] of DEFAULT_FIELDS) if (typeof d?.[k] === 'string') out[k] = d[k].slice(0, max);
  return out;
}

// Nilai yang berlaku sekarang (reaktif). meta: siapa dan kapan terakhir diubah admin (0 = belum pernah).
export const DEFAULTS = $state(clean(cached()));
/** Ada isian bawaan yang terisi (untuk menyembunyikan pilihan yang memakainya). */
export const hasDefaults = () => Object.values(DEFAULTS).some(Boolean);

export const defaultsMeta = $state({ custom: !!cached(), updatedAt: cached()?.updatedAt ?? 0, updatedByName: cached()?.updatedByName ?? '' });

/** Menerapkan konfigurasi dari server (null = admin belum pernah mengatur; semua kosong). */
export function applyDefaults(d) {
  Object.assign(DEFAULTS, clean(d));
  Object.assign(defaultsMeta, { custom: !!d, updatedAt: d?.updatedAt ?? 0, updatedByName: d?.updatedByName ?? '' });
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify({ ...clean(d), updatedAt: defaultsMeta.updatedAt, updatedByName: defaultsMeta.updatedByName }));
    else localStorage.removeItem(KEY);
  } catch {}
}

/** Pengesah bawaan saat ini, untuk disebar ke header dokumen. */
export const pengesahDefaults = () => ({
  disahkanJabatan: DEFAULTS.disahkanJabatan,
  disahkanNama: DEFAULTS.disahkanNama,
  disahkanNip: DEFAULTS.disahkanNip
});
