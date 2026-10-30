// Jembatan antara dokumen JSON biasa (yang diedit komponen) dan struktur Yjs (yang disinkronkan).
// Objek → Y.Map, array → Y.Array, teks bebas → Y.Text (digabung per karakter), sisanya nilai atomik.
import * as Y from 'yjs';

// Nilai yang harus diganti utuh, bukan digabung per karakter (id, pilihan, tanggal, data gambar).
const ATOMIC = new Set(['id', 'actor', 'step', 'from', 'to', 'shape', 'next', 'alt', 'with', 'src', 'format', 'tglPembuatan', 'tglRevisi', 'tglEfektif']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasId = (v) => isObj(v) && typeof v.id === 'string';
const yId = (v) => (v instanceof Y.Map ? v.get('id') : undefined);

function toY(v, key) {
  if (Array.isArray(v)) {
    const a = new Y.Array();
    a.insert(0, v.map((x) => toY(x, ATOMIC.has(key) ? key : null))); // daftar id (mis. `with`) tetap atomik
    return a;
  }
  if (isObj(v)) {
    const m = new Y.Map();
    for (const [k, x] of Object.entries(v)) if (x !== undefined) m.set(k, toY(x, k));
    return m;
  }
  if (typeof v === 'string' && !ATOMIC.has(key)) return new Y.Text(v);
  return v;
}

const plain = (y) => (y instanceof Y.AbstractType ? y.toJSON() : y);
const same = (y, v) => JSON.stringify(plain(y)) === JSON.stringify(v);

/** Memperbarui nilai Yjs `cur` menjadi `v` di tempat bila tipenya cocok; mengembalikan false bila harus diganti. */
function update(cur, v, key) {
  if (cur instanceof Y.Map && isObj(v)) syncMap(cur, v);
  else if (cur instanceof Y.Array && Array.isArray(v)) syncArray(cur, v, key);
  else if (cur instanceof Y.Text && typeof v === 'string' && !ATOMIC.has(key)) syncText(cur, v);
  else return cur === v;
  return true;
}

export function syncMap(ymap, obj) {
  for (const k of [...ymap.keys()]) if (obj[k] === undefined) ymap.delete(k);
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const cur = ymap.get(k);
    if (!(ymap.has(k) && update(cur, v, k))) ymap.set(k, toY(v, k));
  }
}

function syncText(ytext, s) {
  const old = ytext.toString();
  if (old === s) return;
  let p = 0;
  while (p < old.length && p < s.length && old[p] === s[p]) p++;
  let q = 0;
  while (q < old.length - p && q < s.length - p && old[old.length - 1 - q] === s[s.length - 1 - q]) q++;
  if (old.length - p - q > 0) ytext.delete(p, old.length - p - q);
  if (s.length - p - q > 0) ytext.insert(p, s.slice(p, s.length - q));
}

function syncArray(yarr, arr, key = null) {
  const ek = ATOMIC.has(key) ? key : null;
  if (arr.every(hasId) && yarr.toArray().every((x) => yId(x) !== undefined)) {
    // Daftar ber-id (langkah, pelaksana): hapus, pindahkan, dan sisipkan per id.
    const ids = new Set(arr.map((x) => x.id));
    for (let i = yarr.length - 1; i >= 0; i--) if (!ids.has(yId(yarr.get(i)))) yarr.delete(i, 1);
    for (let j = 0; j < arr.length; j++) {
      if (j < yarr.length && yId(yarr.get(j)) === arr[j].id) {
        if (!update(yarr.get(j), arr[j], null)) {
          yarr.delete(j, 1);
          yarr.insert(j, [toY(arr[j], null)]);
        }
        continue;
      }
      for (let k = j + 1; k < yarr.length; k++) {
        if (yId(yarr.get(k)) === arr[j].id) {
          yarr.delete(k, 1);
          break;
        }
      }
      yarr.insert(j, [toY(arr[j], null)]);
    }
    if (yarr.length > arr.length) yarr.delete(arr.length, yarr.length - arr.length);
    return;
  }

  // Daftar tanpa id (butir teks): bila panjang sama, edit per posisi; bila tidak, ganti bagian tengah yang berbeda.
  if (yarr.length === arr.length) {
    for (let i = 0; i < arr.length; i++) {
      if (!update(yarr.get(i), arr[i], ek)) {
        yarr.delete(i, 1);
        yarr.insert(i, [toY(arr[i], ek)]);
      }
    }
    return;
  }
  let p = 0;
  while (p < yarr.length && p < arr.length && same(yarr.get(p), arr[p])) p++;
  let q = 0;
  while (q < yarr.length - p && q < arr.length - p && same(yarr.get(yarr.length - 1 - q), arr[arr.length - 1 - q])) q++;
  if (yarr.length - p - q > 0) yarr.delete(p, yarr.length - p - q);
  if (arr.length - p - q > 0) yarr.insert(p, arr.slice(p, arr.length - q).map((x) => toY(x, ek)));
}

/**
 * Menyamakan objek `t` (state Svelte) dengan `s` dengan mengubah seminimal mungkin,
 * agar elemen form yang tidak berubah tidak dibuat ulang (fokus & kursor tetap).
 */
export function reconcile(t, s) {
  for (const k of Object.keys(t)) if (!(k in s)) delete t[k];
  for (const [k, v] of Object.entries(s)) assign(t, k, v);
}

function assign(t, k, v) {
  const cur = t[k];
  if (Array.isArray(cur) && Array.isArray(v)) reconcileArray(cur, v);
  else if (isObj(cur) && isObj(v) && !('src' in v)) reconcile(cur, v);
  else if (cur !== v && JSON.stringify(cur) !== JSON.stringify(v)) t[k] = v;
}

function reconcileArray(t, s) {
  if (s.every(hasId) && t.every(hasId)) {
    const byId = new Map(t.map((x) => [x.id, x]));
    const next = s.map((x) => {
      const o = byId.get(x.id);
      if (!o) return x;
      reconcile(o, x);
      return o;
    });
    if (next.length !== t.length || next.some((x, i) => x !== t[i])) t.splice(0, t.length, ...next);
    return;
  }
  if (t.length > s.length) t.splice(s.length);
  for (let i = 0; i < s.length; i++) assign(t, i, s[i]);
}
