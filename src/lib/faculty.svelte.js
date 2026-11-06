// Pustaka Daring: SOP bersama di Firestore. Firebase baru dimuat saat fitur ini dipakai.
// Batasan akses ditegakkan oleh firebase/firestore.rules; yang di sini hanya mengikuti aturan itu.

const EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR;

const config = {
  apiKey: 'AIzaSyCuv37tY1qhzeS90hd1NeDC6i19DTZTp3w',
  authDomain: 'sop-editor-c2a61.firebaseapp.com',
  projectId: EMULATOR ? 'demo-sop-editor' : 'sop-editor-c2a61',
  storageBucket: 'sop-editor-c2a61.firebasestorage.app',
  messagingSenderId: '973015723802',
  appId: '1:973015723802:web:3d8b506ba52ec33022c6a3'
};

const DOMAIN = /@ub\.ac\.id$/;
export const MAX_SOP_BYTES = 524288; // sama dengan batas di firestore.rules
const DEFAULT_LIMIT = 500 * 1000 * 1000;
const EDITING_BEAT = 2 * 60 * 1000;
const EDITING_EXPIRY = 5 * 60 * 1000;

/**
 * status: idle | loading | out | domain (bukan akun @ub.ac.id) | notMember | in | error.
 * editing: sopId → daftar orang lain yang sedang mengedit.
 */
export const faculty = $state({ status: 'idle', user: null, role: null, error: '', editing: {} });

export const isAdmin = () => faculty.status === 'in' && faculty.role === 'admin';
export const canManage = (sop) => isAdmin() || sop.createdBy === faculty.user?.uid;
export const canEdit = (sop) => !sop.deletedBy && (sop.visibility === 'public' || canManage(sop));

/** code: conflict | gone | full | denied | too-big | blank */
export class FacultyError extends Error {
  constructor(code, message, info = {}) {
    super(message);
    this.code = code;
    Object.assign(this, info);
  }
}

let svc;
function load() {
  svc ??= (async () => {
    const [{ initializeApp }, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const fb = initializeApp(config);
    const auth = A.getAuth(fb);
    const db = F.getFirestore(fb);
    if (EMULATOR) {
      A.connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
      F.connectFirestoreEmulator(db, '127.0.0.1', 8181);
    }
    return { A, F, auth, db };
  })();
  svc.catch(() => (svc = null)); // gagal memuat (mis. luring): boleh dicoba lagi
  return svc;
}

// Hanya ada saat pengujian dengan emulator; hilang dari hasil build.
if (EMULATOR) {
  window.__facultyLogin = async (email, name) => {
    const { A, auth } = await load();
    await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })));
  };
}

const offlineMessage = 'Pustaka Daring tidak bisa dihubungi. Periksa koneksi internet, lalu coba lagi.';

function readable(e) {
  if (e?.code === 'permission-denied') return 'Akses ditolak server. Bila ini baru disiapkan, pastikan aturan keamanan sudah dipasang.';
  if (e?.code === 'unavailable' || e?.code === 'auth/network-request-failed') return offlineMessage;
  return e?.message ?? String(e);
}

async function applyUser(u) {
  if (!u) return Object.assign(faculty, { status: 'out', user: null, role: null, error: '' });
  const user = { uid: u.uid, email: u.email.toLowerCase(), name: (u.displayName || u.email).slice(0, 120) };
  if (!u.emailVerified || !DOMAIN.test(user.email)) return Object.assign(faculty, { status: 'domain', user, role: null, error: '' });
  faculty.status = 'loading';
  try {
    const { F, db } = await load();
    const m = await F.getDocFromServer(F.doc(db, 'members', user.email));
    if (!m.exists()) return Object.assign(faculty, { status: 'notMember', user, role: null, error: '' });
    const role = m.data().role;
    if (role === 'admin') await ensureUsage();
    Object.assign(faculty, { status: 'in', user, role, error: '' });
  } catch (e) {
    Object.assign(faculty, { status: 'error', user, role: null, error: readable(e) });
  }
}

let ready;
/** Memuat Firebase dan memulihkan login; aman dipanggil berulang. */
export function start() {
  ready ??= (async () => {
    faculty.status = 'loading';
    const { A, auth } = await load();
    await new Promise((resolve) => A.onAuthStateChanged(auth, (u) => applyUser(u).finally(resolve)));
  })().catch((e) => {
    ready = null;
    Object.assign(faculty, { status: 'error', error: readable(e) });
  });
  return ready;
}

export async function signIn() {
  const { A, auth } = await load();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ hd: 'ub.ac.id', prompt: 'select_account' });
  try {
    await A.signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    throw new Error(e.code === 'auth/popup-blocked' ? 'Jendela login diblokir browser. Izinkan pop-up untuk situs ini, lalu coba lagi.' : readable(e));
  }
}

export async function signOut() {
  releaseEditing();
  const { A, auth } = await load();
  await A.signOut(auth);
}

/** Mencoba lagi setelah gangguan, atau setelah admin mendaftarkan akun ini. */
export async function recheck() {
  const { auth } = await load();
  await applyUser(auth.currentUser);
}

const ms = (t) => t?.toMillis?.() ?? 0;

function row(d) {
  const s = d.data({ serverTimestamps: 'estimate' });
  return { ...s, id: d.id, createdAt: ms(s.createdAt), updatedAt: ms(s.updatedAt), deletedAt: ms(s.deletedAt) };
}

const utf8Size = (s) => new TextEncoder().encode(s).length;

/** Bentuk dokumen untuk Pustaka Daring. `title` menimpa Nama SOP bila diberikan. */
function cloudJson(doc, title) {
  const copy = JSON.parse(JSON.stringify(doc));
  delete copy.header.signature; // masih ada pada SOP yang diunggah sebelum fitur tanda tangan dihapus
  if (title !== undefined) copy.header.namaSop = title;
  const json = JSON.stringify(copy);
  const size = utf8Size(json);
  if (size > MAX_SOP_BYTES) throw new FacultyError('too-big', `SOP ini terlalu besar untuk Pustaka Daring (${Math.ceil(size / 1024)} KB, maksimal ${MAX_SOP_BYTES / 1024} KB).`);
  return { json, size, title: copy.header.namaSop.trim().slice(0, 300), nomor: String(copy.header.nomor ?? '').slice(0, 120) };
}

async function isFull() {
  const { F, db } = await load();
  try {
    await F.getDocFromServer(F.doc(db, 'stats/capacity'));
    return false;
  } catch (e) {
    return e.code === 'permission-denied';
  }
}

/** Menerjemahkan penolakan server menjadi pesan yang bisa ditindaklanjuti. */
async function failed(e) {
  if (e instanceof FacultyError) throw e;
  if (e?.code === 'permission-denied') {
    if (await isFull()) throw new FacultyError('full', 'Penyimpanan Pustaka Daring penuh. Hubungi admin.');
    throw new FacultyError('denied', 'Server menolak penyimpanan ini. Mungkin hak akses berubah atau ruang pustaka tidak cukup; hubungi admin bila berulang.');
  }
  throw new Error(readable(e));
}

async function ensureUsage() {
  const { F, db } = await load();
  const ref = F.doc(db, 'stats/usage');
  if (!(await F.getDocFromServer(ref)).exists()) await F.setDoc(ref, { bytes: 0, limit: DEFAULT_LIMIT, lastSop: '' });
}

// ---- Daftar ----

/** SOP yang boleh dilihat akun ini: { live, bin }. Admin melihat semua, termasuk seluruh recycle bin. */
export async function listSops() {
  const { F, db } = await load();
  const col = F.collection(db, 'sops');
  const uid = faculty.user.uid;
  const q = (...w) => F.getDocsFromServer(F.query(col, ...w));
  const snaps = isAdmin()
    ? [await F.getDocsFromServer(col)]
    : await Promise.all([
        q(F.where('deletedBy', '==', null), F.where('visibility', '==', 'public')),
        q(F.where('deletedBy', '==', null), F.where('createdBy', '==', uid)),
        q(F.where('deletedBy', '==', uid))
      ]);
  const all = new Map();
  for (const s of snaps) for (const d of s.docs) all.set(d.id, row(d));
  const sorted = [...all.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  return { live: sorted.filter((s) => !s.deletedBy), bin: sorted.filter((s) => s.deletedBy) };
}

export async function listVersions(id) {
  const { F, db } = await load();
  const snap = await F.getDocsFromServer(F.collection(db, 'sops', id, 'versions'));
  return snap.docs.map((d) => ({ ...d.data(), savedAt: ms(d.data().savedAt) })).sort((a, b) => b.rev - a.rev);
}

// ---- Folder ----

export async function listFolders() {
  const { F, db } = await load();
  const snap = await F.getDocsFromServer(F.collection(db, 'folders'));
  return snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id, parent: d.data().parent ?? null }));
}

const folderWrite = (p) => p.catch((e) => { throw new Error(readable(e)); });

export async function createFolder(name, parent) {
  const { F, db } = await load();
  const { uid, name: createdByName } = faculty.user;
  await folderWrite(F.addDoc(F.collection(db, 'folders'), { name, parent, createdBy: uid, createdByName, createdAt: F.serverTimestamp() }));
}

/** data: { name } dan/atau { parent }. */
export async function updateFolder(id, data) {
  const { F, db } = await load();
  await folderWrite(F.updateDoc(F.doc(db, 'folders', id), data));
}

export async function deleteFolder(id) {
  const { F, db } = await load();
  await folderWrite(F.deleteDoc(F.doc(db, 'folders', id)));
}

// ---- Menulis ----

/** Mengunggah sebagai SOP baru: selalu private, dan akun ini tercatat sebagai pembuatnya. */
export async function uploadSop(doc, title, folder = null) {
  const { F, db } = await load();
  const { uid, email, name } = faculty.user;
  const c = cloudJson(doc, title);
  const ref = F.doc(F.collection(db, 'sops'));
  const b = F.writeBatch(db);
  const now = F.serverTimestamp();
  b.set(ref, {
    ...c, totalBytes: c.size, rev: 1, visibility: 'private', folder,
    createdBy: uid, createdByName: name, createdByEmail: email, createdAt: now,
    updatedAt: now, updatedBy: uid, updatedByName: name, deletedAt: null, deletedBy: null
  });
  b.update(F.doc(db, 'stats/usage'), { bytes: F.increment(c.size), lastSop: ref.id });
  await b.commit().catch(failed);
  return { id: ref.id, rev: 1, title: c.title, visibility: 'private', canRename: true, folder };
}

/** Isi lama pindah ke riwayat dan isi baru ditulis dalam satu transaksi (lihat isContentSave di aturan). */
function writeContent(F, db, tx, ref, cur, c) {
  const { uid, name } = faculty.user;
  tx.set(F.doc(ref, 'versions', String(cur.rev)), {
    rev: cur.rev, title: cur.title, nomor: cur.nomor, json: cur.json, size: cur.size,
    savedAt: cur.updatedAt, savedBy: cur.updatedBy, savedByName: cur.updatedByName
  });
  tx.update(ref, {
    json: c.json, size: c.size, title: c.title, nomor: c.nomor, totalBytes: cur.totalBytes + c.size, rev: cur.rev + 1,
    updatedAt: F.serverTimestamp(), updatedBy: uid, updatedByName: name
  });
  tx.update(F.doc(db, 'stats/usage'), { bytes: F.increment(c.size), lastSop: ref.id });
}

async function readForWrite(tx, ref) {
  let snap;
  try {
    snap = await tx.get(ref);
  } catch (e) {
    if (e.code === 'permission-denied') throw goneError();
    throw e;
  }
  if (!snap.exists() || snap.data().deletedBy) throw goneError();
  return snap.data();
}
const goneError = () => new FacultyError('gone', 'SOP ini sudah dihapus atau dijadikan private oleh pembuatnya.');

/**
 * Menyimpan perubahan dari salinan `baseRev`. Bila SOP sudah diubah orang lain, melempar `conflict`
 * kecuali `overwrite`. Selain pembuat dan admin, Nama SOP selalu mengikuti nama di pustaka.
 */
export async function saveSop(id, doc, baseRev, { overwrite = false } = {}) {
  const { F, db } = await load();
  const ref = F.doc(db, 'sops', id);
  return F.runTransaction(db, async (tx) => {
    const cur = await readForWrite(tx, ref);
    if (cur.rev !== baseRev && !overwrite) {
      throw new FacultyError('conflict', 'SOP ini sudah diubah orang lain.', { by: cur.updatedByName, at: ms(cur.updatedAt) });
    }
    const c = cloudJson(doc, canManage(cur) ? undefined : cur.title);
    if (c.json === cur.json && c.title === cur.title) return { rev: cur.rev, title: cur.title, unchanged: true };
    writeContent(F, db, tx, ref, cur, c);
    return { rev: cur.rev + 1, title: c.title };
  }).catch(failed);
}

/**
 * Mengubah nama: nama di pustaka dan Nama SOP di dalam dokumen ikut sama, tercatat sebagai versi baru.
 * Hasil: { from, rev, title }, `from` adalah revisi tepat sebelum penggantian nama.
 */
export async function renameSop(id, title) {
  const { F, db } = await load();
  const ref = F.doc(db, 'sops', id);
  return F.runTransaction(db, async (tx) => {
    const cur = await readForWrite(tx, ref);
    const c = cloudJson(JSON.parse(cur.json), title);
    writeContent(F, db, tx, ref, cur, c);
    return { from: cur.rev, rev: cur.rev + 1, title: c.title };
  }).catch(failed);
}

/** Isi versi lama menjadi isi terkini (isi saat ini tetap tersimpan di riwayat); namanya tidak ikut mundur. */
export async function restoreVersion(id, version) {
  const { F, db } = await load();
  const ref = F.doc(db, 'sops', id);
  await F.runTransaction(db, async (tx) => {
    const cur = await readForWrite(tx, ref);
    writeContent(F, db, tx, ref, cur, cloudJson(JSON.parse(version.json), cur.title));
  }).catch(failed);
}

/** Hasil duplikat berdiri sendiri: private, dan pembuatnya adalah akun ini. */
export const duplicateSop = (sop) => uploadSop(JSON.parse(sop.json), `Salinan dari ${sop.title || 'SOP tanpa judul'}`.slice(0, 300), sop.folder);

async function patch(id, data) {
  const { F, db } = await load();
  await F.updateDoc(F.doc(db, 'sops', id), data).catch(failed);
}
export const setVisibility = (id, visibility) => patch(id, { visibility });
export const moveSop = (id, folder) => patch(id, { folder });
export async function moveToBin(id) {
  const { F } = await load();
  await patch(id, { deletedAt: F.serverTimestamp(), deletedBy: faculty.user.uid });
}
export const restoreFromBin = (id) => patch(id, { deletedAt: null, deletedBy: null });

/** Hapus permanen, riwayatnya ikut. Tidak bisa dibatalkan. */
export async function purgeSop(sop) {
  const { F, db } = await load();
  const ref = F.doc(db, 'sops', sop.id);
  const versions = await F.getDocsFromServer(F.collection(ref, 'versions'));
  const b = F.writeBatch(db);
  versions.forEach((v) => b.delete(v.ref));
  b.delete(ref);
  b.update(F.doc(db, 'stats/usage'), { bytes: F.increment(-sop.totalBytes), lastSop: sop.id });
  await b.commit().catch(failed);
}

// ---- "Sedang diedit": hanya pemberitahuan, tidak pernah menghalangi orang lain menyimpan ----

const marks = new Set();
let beat = null;

async function sendMark(sopId) {
  const { F, db } = await load();
  const { uid, name } = faculty.user;
  await F.setDoc(F.doc(db, 'editing', `${sopId}_${uid}`), { sopId, uid, name, at: F.serverTimestamp() });
}

async function clearMark(sopId, uid) {
  const { F, db } = await load();
  await F.deleteDoc(F.doc(db, 'editing', `${sopId}_${uid}`));
}

/** Tandai (atau lepaskan tanda) bahwa akun ini sedang mengedit SOP public `sopId`. */
export function setEditing(sopId, on) {
  if (faculty.status !== 'in' || on === marks.has(sopId)) return;
  if (on) {
    marks.add(sopId);
    sendMark(sopId).catch(() => {});
    beat ??= setInterval(() => marks.forEach((id) => sendMark(id).catch(() => {})), EDITING_BEAT);
  } else {
    marks.delete(sopId);
    clearMark(sopId, faculty.user.uid).catch(() => {});
    if (!marks.size) {
      clearInterval(beat);
      beat = null;
    }
  }
}

export function releaseEditing() {
  for (const id of [...marks]) setEditing(id, false);
}

let watchers = 0;
let stopWatch = null;
let lastMarks = [];
let sweep = null;

function publishEditing() {
  const now = Date.now();
  const next = {};
  for (const m of lastMarks) {
    if (now - m.at > EDITING_EXPIRY) {
      if (now - m.at > EDITING_EXPIRY + 60000) clearMark(m.sopId, m.uid).catch(() => {}); // sisa browser yang tertutup
      continue;
    }
    if (m.uid !== faculty.user?.uid) (next[m.sopId] ??= []).push(m);
  }
  faculty.editing = next;
}

/** Mengikuti siapa yang sedang mengedit selama dibutuhkan; panggil fungsi hasilnya untuk berhenti. */
export function watchEditing() {
  watchers++;
  if (watchers === 1) {
    load().then(({ F, db }) => {
      if (!watchers) return;
      stopWatch = F.onSnapshot(
        F.collection(db, 'editing'),
        (snap) => {
          lastMarks = snap.docs.map((d) => {
            const m = d.data({ serverTimestamps: 'estimate' });
            return { ...m, at: ms(m.at) };
          });
          publishEditing();
        },
        () => {} // akses dicabut atau luring: keterangan ini tidak penting untuk diberitahukan
      );
    });
    sweep = setInterval(publishEditing, 60000);
  }
  return () => {
    if (--watchers) return;
    stopWatch?.();
    stopWatch = null;
    clearInterval(sweep);
    faculty.editing = {};
  };
}

// ---- Khusus admin ----

export async function getUsage() {
  const { F, db } = await load();
  return (await F.getDocFromServer(F.doc(db, 'stats/usage'))).data();
}

export async function setLimit(limit) {
  const { F, db } = await load();
  await F.updateDoc(F.doc(db, 'stats/usage'), { limit });
}

/** Menyamakan penghitung dengan jumlah ukuran semua SOP (termasuk recycle bin dan riwayatnya). */
export async function recountUsage() {
  const { F, db } = await load();
  const all = await F.getDocsFromServer(F.collection(db, 'sops'));
  let bytes = 0;
  all.forEach((d) => (bytes += d.data().totalBytes ?? 0));
  await F.updateDoc(F.doc(db, 'stats/usage'), { bytes, lastSop: '' });
  return bytes;
}

export async function listMembers() {
  const { F, db } = await load();
  const snap = await F.getDocsFromServer(F.collection(db, 'members'));
  return snap.docs.map((d) => ({ email: d.id, role: d.data().role })).sort((a, b) => a.email.localeCompare(b.email));
}

export async function setMember(email, role) {
  const { F, db } = await load();
  await F.setDoc(F.doc(db, 'members', email), { role, addedBy: faculty.user.email, addedAt: F.serverTimestamp() });
}

export async function removeMember(email) {
  const { F, db } = await load();
  await F.deleteDoc(F.doc(db, 'members', email));
}
