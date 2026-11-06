// Menguji firestore.rules di emulator. Jalankan: npm test (dari folder firebase/).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

const USERS = {
  ali: { email: 'ali@ub.ac.id', name: 'Ali' },
  bud: { email: 'bud@ub.ac.id', name: 'Bud' },
  adm: { email: 'adm@ub.ac.id', name: 'Adm' },
  out: { email: 'out@ub.ac.id', name: 'Bukan anggota' },
  mhs: { email: 'mhs@student.ub.ac.id', name: 'Mahasiswa' },
  gml: { email: 'gml@gmail.com', name: 'Gmail' }
};

let env;
const as = (u, extra = {}) => env.authenticatedContext(u, { email: USERS[u].email, email_verified: true, ...extra }).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((c) => fn(c.firestore()));
const bytes = (s) => new TextEncoder().encode(s).length;
const usage = (db) => doc(db, 'stats/usage');

function newSop(u, json, patch = {}) {
  const size = bytes(json);
  return {
    title: 'SOP A', nomor: 'N1', json, size, totalBytes: size, rev: 1, visibility: 'private',
    createdBy: u, createdByName: USERS[u].name, createdByEmail: USERS[u].email, createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(), updatedBy: u, updatedByName: USERS[u].name, deletedAt: null, deletedBy: null, ...patch
  };
}

function create(db, u, id, json = '{"a":1}', patch = {}) {
  const b = writeBatch(db);
  b.set(doc(db, 'sops', id), newSop(u, json, patch));
  b.update(usage(db), { bytes: increment(bytes(json)), lastSop: id });
  return b.commit();
}

/** Penyimpanan isi: `cur` adalah isi SOP saat ini menurut penyimpan. */
function save(db, u, id, cur, json, patch = {}) {
  const size = bytes(json);
  const b = writeBatch(db);
  b.set(doc(db, 'sops', id, 'versions', String(cur.rev)), {
    rev: cur.rev, title: cur.title, nomor: cur.nomor, json: cur.json, size: cur.size,
    savedAt: cur.updatedAt, savedBy: cur.updatedBy, savedByName: cur.updatedByName
  });
  b.update(doc(db, 'sops', id), {
    json, size, totalBytes: cur.totalBytes + size, rev: cur.rev + 1,
    updatedAt: serverTimestamp(), updatedBy: u, updatedByName: USERS[u].name, ...patch
  });
  b.update(usage(db), { bytes: increment(size), lastSop: id });
  return b.commit();
}

const read = async (id) => {
  let d;
  await seed(async (db) => (d = (await getDoc(doc(db, 'sops', id))).data()));
  return d;
};
const usedBytes = async () => {
  let n;
  await seed(async (db) => (n = (await getDoc(usage(db))).data().bytes));
  return n;
};

/** Menyiapkan SOP lewat jalur resmi milik `u`, opsional public. */
async function given(u, id, visibility = 'private') {
  await create(as(u), u, id);
  if (visibility === 'public') await updateDoc(doc(as(u), 'sops', id), { visibility });
  return read(id);
}
const toBin = (db, u, id) => updateDoc(doc(db, 'sops', id), { deletedAt: serverTimestamp(), deletedBy: u });
const restore = (db, id) => updateDoc(doc(db, 'sops', id), { deletedAt: null, deletedBy: null });
function purge(db, id, totalBytes, revs = []) {
  const b = writeBatch(db);
  for (const r of revs) b.delete(doc(db, 'sops', id, 'versions', String(r)));
  b.delete(doc(db, 'sops', id));
  b.update(usage(db), { bytes: increment(-totalBytes), lastSop: id });
  return b.commit();
}

before(async () => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-sop-editor',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') }
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'members/ali@ub.ac.id'), { role: 'member' });
    await setDoc(doc(db, 'members/bud@ub.ac.id'), { role: 'member' });
    await setDoc(doc(db, 'members/adm@ub.ac.id'), { role: 'admin' });
    await setDoc(doc(db, 'members/mhs@student.ub.ac.id'), { role: 'member' });
    await setDoc(doc(db, 'members/gml@gmail.com'), { role: 'admin' });
    await setDoc(usage(db), { bytes: 0, limit: 1000000, lastSop: '' });
  });
});

describe('siapa yang boleh masuk', () => {
  it('tanpa login, ditolak', async () => {
    await given('ali', 's', 'public');
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'sops/s')));
  });
  it('@ub.ac.id tapi bukan anggota, ditolak', async () => {
    await given('ali', 's', 'public');
    await assertFails(getDoc(doc(as('out'), 'sops/s')));
    await assertFails(create(as('out'), 'out', 'x'));
  });
  it('terdaftar tetapi di luar domain, ditolak walau datanya berperan admin', async () => {
    await given('ali', 's', 'public');
    for (const u of ['mhs', 'gml']) await assertFails(getDoc(doc(as(u), 'sops/s')));
  });
  it('email belum terverifikasi, ditolak', async () => {
    await given('ali', 's', 'public');
    await assertFails(getDoc(doc(as('ali', { email_verified: false }), 'sops/s')));
  });
  it('bukan anggota bisa memeriksa status dirinya saja', async () => {
    await assertSucceeds(getDoc(doc(as('out'), 'members/out@ub.ac.id')));
    await assertFails(getDoc(doc(as('out'), 'members/ali@ub.ac.id')));
  });
});

describe('private dan public', () => {
  it('SOP baru harus private', async () => {
    await assertFails(create(as('ali'), 'ali', 'x', '{}', { visibility: 'public' }));
    await assertSucceeds(create(as('ali'), 'ali', 'x'));
  });
  it('private: anggota lain tidak bisa membaca, pembuat dan admin bisa', async () => {
    await given('ali', 's');
    await assertFails(getDoc(doc(as('bud'), 'sops/s')));
    await assertSucceeds(getDoc(doc(as('ali'), 'sops/s')));
    await assertSucceeds(getDoc(doc(as('adm'), 'sops/s')));
  });
  it('public: semua anggota bisa membaca', async () => {
    await given('ali', 's', 'public');
    await assertSucceeds(getDoc(doc(as('bud'), 'sops/s')));
  });
  it('hanya pembuat dan admin yang bisa mengubah status', async () => {
    await given('ali', 's');
    await assertFails(updateDoc(doc(as('bud'), 'sops/s'), { visibility: 'public' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'sops/s'), { visibility: 'public' }));
    await assertFails(updateDoc(doc(as('bud'), 'sops/s'), { visibility: 'private' }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'sops/s'), { visibility: 'private' }));
  });
  it('kueri daftar: anggota mendapat public dan miliknya, tidak bisa meminta semua', async () => {
    await given('ali', 'priv');
    await given('ali', 'pub', 'public');
    const db = as('bud');
    const live = where('deletedBy', '==', null);
    const pub = await assertSucceeds(getDocs(query(collection(db, 'sops'), live, where('visibility', '==', 'public'))));
    assert.deepEqual(pub.docs.map((d) => d.id), ['pub']);
    await assertSucceeds(getDocs(query(collection(db, 'sops'), live, where('createdBy', '==', 'bud'))));
    await assertFails(getDocs(collection(db, 'sops')));
    await assertFails(getDocs(query(collection(db, 'sops'), live, where('createdBy', '==', 'ali'))));
    assert.equal((await assertSucceeds(getDocs(collection(as('adm'), 'sops')))).size, 2);
  });
});

describe('pembuat tercatat', () => {
  it('tidak bisa mengaku sebagai orang lain', async () => {
    await assertFails(create(as('bud'), 'ali', 'x'));
    await assertFails(create(as('bud'), 'bud', 'x', '{}', { createdByEmail: 'ali@ub.ac.id' }));
  });
  it('tidak bisa diubah, termasuk oleh admin', async () => {
    await given('ali', 's', 'public');
    for (const u of ['ali', 'bud', 'adm']) await assertFails(updateDoc(doc(as(u), 'sops/s'), { createdBy: 'bud' }));
  });
});

describe('mengedit isi', () => {
  it('public: anggota lain bisa, dan penyunting terakhir tercatat', async () => {
    const cur = await given('ali', 's', 'public');
    await assertSucceeds(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
    const now = await read('s');
    assert.equal(now.rev, 2);
    assert.equal(now.updatedBy, 'bud');
    assert.equal(now.createdBy, 'ali');
  });
  it('private: anggota lain ditolak, pembuat dan admin bisa', async () => {
    const cur = await given('ali', 's');
    await assertFails(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
    await assertSucceeds(save(as('adm'), 'adm', 's', cur, '{"a":2}'));
    await assertSucceeds(save(as('ali'), 'ali', 's', await read('s'), '{"a":3}'));
  });
  it('salinan usang ditolak server (peringatan timpa)', async () => {
    const cur = await given('ali', 's', 'public');
    await assertSucceeds(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
    await assertFails(save(as('ali'), 'ali', 's', cur, '{"a":3}'));
  });
  it('SOP public dijadikan private: penyunting lain tidak bisa menyimpan lagi', async () => {
    const cur = await given('ali', 's', 'public');
    await updateDoc(doc(as('ali'), 'sops/s'), { visibility: 'private' });
    await assertFails(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
  });
  it('tidak bisa melewati riwayat', async () => {
    const cur = await given('ali', 's', 'public');
    const db = as('bud');
    const b = writeBatch(db);
    b.update(doc(db, 'sops/s'), { json: '{"a":2}', size: 7, totalBytes: cur.totalBytes + 7, rev: 2, updatedAt: serverTimestamp(), updatedBy: 'bud', updatedByName: 'Bud' });
    b.update(usage(db), { bytes: increment(7), lastSop: 's' });
    await assertFails(b.commit());
  });
  it('riwayat harus salinan persis isi yang ditimpa', async () => {
    const cur = await given('ali', 's', 'public');
    await assertFails(save(as('bud'), 'bud', 's', { ...cur, json: '{"palsu":1}' }, '{"a":2}'));
  });
  it('riwayat mengikuti hak baca dan tidak bisa diubah', async () => {
    const cur = await given('ali', 's');
    await save(as('ali'), 'ali', 's', cur, '{"a":2}');
    await assertSucceeds(getDoc(doc(as('ali'), 'sops/s/versions/1')));
    await assertFails(getDoc(doc(as('bud'), 'sops/s/versions/1')));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s/versions/1'), { json: 'x' }));
    await assertFails(deleteDoc(doc(as('ali'), 'sops/s/versions/1')));
  });
  it('isi terlalu besar ditolak', async () => {
    await assertFails(create(as('ali'), 'ali', 'x', '"' + 'a'.repeat(524288) + '"'));
    await assertSucceeds(create(as('ali'), 'ali', 'y', '"' + 'a'.repeat(524286) + '"'));
  });
  it('isi yang memuat gambar ditolak, walau sengaja dikirim tanpa lewat aplikasi', async () => {
    const withImage = '{"header":{"signature":{"src":"data:image/png;base64,AAAA"}}}';
    await assertFails(create(as('ali'), 'ali', 'x', withImage));
    const cur = await given('ali', 's', 'public');
    await assertFails(save(as('bud'), 'bud', 's', cur, withImage));
    await assertSucceeds(save(as('bud'), 'bud', 's', cur, '{"teks":"data gambar\\nbaris kedua"}'));
  });
  it('ukuran dihitung per byte UTF-8, bukan per karakter', async () => {
    await assertSucceeds(create(as('ali'), 'ali', 'x', '{"s":"Ñ 🪄 ✓ 日本"}'));
    assert.equal(await usedBytes(), bytes('{"s":"Ñ 🪄 ✓ 日本"}'));
  });
});

describe('rename', () => {
  it('hanya pembuat dan admin', async () => {
    const cur = await given('ali', 's', 'public');
    await assertFails(save(as('bud'), 'bud', 's', cur, '{"a":2}', { title: 'Baru' }));
    await assertSucceeds(save(as('ali'), 'ali', 's', cur, '{"a":2}', { title: 'Baru' }));
    await assertSucceeds(save(as('adm'), 'adm', 's', await read('s'), '{"a":3}', { title: 'Baru lagi' }));
  });
});

describe('recycle bin', () => {
  it('hanya pembuat dan admin yang bisa menghapus', async () => {
    await given('ali', 's', 'public');
    await assertFails(toBin(as('bud'), 'bud', 's'));
    await assertSucceeds(toBin(as('ali'), 'ali', 's'));
  });
  it('tidak bisa menghapus atas nama orang lain', async () => {
    await given('ali', 's');
    await assertFails(toBin(as('ali'), 'adm', 's'));
  });
  it('item terhapus hanya terlihat oleh penghapusnya dan admin', async () => {
    await given('ali', 's', 'public');
    await toBin(as('ali'), 'ali', 's');
    await assertSucceeds(getDoc(doc(as('ali'), 'sops/s')));
    await assertFails(getDoc(doc(as('bud'), 'sops/s')));
    await assertSucceeds(getDoc(doc(as('adm'), 'sops/s')));
    const mine = await assertSucceeds(getDocs(query(collection(as('ali'), 'sops'), where('deletedBy', '==', 'ali'))));
    assert.equal(mine.size, 1);
    await assertFails(getDocs(query(collection(as('bud'), 'sops'), where('deletedBy', '==', 'ali'))));
  });
  it('dihapus admin: pembuat tidak melihat dan tidak bisa memulihkan', async () => {
    await given('ali', 's');
    await toBin(as('adm'), 'adm', 's');
    await assertFails(getDoc(doc(as('ali'), 'sops/s')));
    await assertFails(restore(as('ali'), 's'));
    await assertFails(purge(as('ali'), 's', 7));
    await assertSucceeds(restore(as('adm'), 's'));
  });
  it('penghapus bisa memulihkan; anggota lain tidak', async () => {
    await given('ali', 's', 'public');
    await toBin(as('ali'), 'ali', 's');
    await assertFails(restore(as('bud'), 's'));
    await assertSucceeds(restore(as('ali'), 's'));
    await assertSucceeds(getDoc(doc(as('bud'), 'sops/s')));
  });
  it('item terhapus tidak bisa diedit', async () => {
    const cur = await given('ali', 's', 'public');
    await toBin(as('ali'), 'ali', 's');
    await assertFails(save(as('ali'), 'ali', 's', cur, '{"a":2}'));
  });
  it('hapus permanen harus lewat recycle bin, oleh penghapusnya atau admin', async () => {
    const cur = await given('ali', 's', 'public');
    await assertFails(purge(as('ali'), 's', cur.totalBytes));
    await toBin(as('ali'), 'ali', 's');
    await assertFails(purge(as('bud'), 's', cur.totalBytes));
    await assertSucceeds(purge(as('ali'), 's', cur.totalBytes));
  });
  it('hapus permanen membawa riwayat dan mengurangi penghitung', async () => {
    const cur = await given('ali', 's', 'public');
    await save(as('bud'), 'bud', 's', cur, '{"a":2}');
    const now = await read('s');
    await toBin(as('ali'), 'ali', 's');
    await assertSucceeds(purge(as('ali'), 's', now.totalBytes, [1]));
    assert.equal(await usedBytes(), 0);
    let v;
    await seed(async (db) => (v = await getDoc(doc(db, 'sops/s/versions/1'))));
    assert.equal(v.exists(), false);
  });
});

describe('ruang penyimpanan', () => {
  it('anggota tidak bisa membaca penghitung, admin bisa', async () => {
    await assertFails(getDoc(usage(as('ali'))));
    await assertSucceeds(getDoc(usage(as('adm'))));
  });
  it('penghitung mengikuti ukuran isi dan riwayat', async () => {
    const cur = await given('ali', 's', 'public');
    assert.equal(await usedBytes(), 7);
    await save(as('bud'), 'bud', 's', cur, '{"a":22}');
    assert.equal(await usedBytes(), 7 + 8);
    assert.equal((await read('s')).totalBytes, 7 + 8);
  });
  it('anggota tidak bisa mengubah penghitung tanpa menulis SOP', async () => {
    await given('ali', 's');
    await assertFails(updateDoc(usage(as('ali')), { bytes: 0, lastSop: 's' }));
    await assertFails(updateDoc(usage(as('ali')), { limit: 999999999 }));
  });
  it('selisih penghitung harus sesuai ukuran', async () => {
    const db = as('ali');
    const b = writeBatch(db);
    b.set(doc(db, 'sops/x'), newSop('ali', '{"a":1}'));
    b.update(usage(db), { bytes: increment(1), lastSop: 'x' });
    await assertFails(b.commit());
  });
  it('tanpa memperbarui penghitung, ditolak', async () => {
    await assertFails(setDoc(doc(as('ali'), 'sops/x'), newSop('ali', '{"a":1}')));
  });
  it('penuh: unggah dan simpan ditolak, hapus permanen tetap bisa', async () => {
    const cur = await given('ali', 's', 'public');
    await seed((db) => updateDoc(usage(db), { limit: 7 }));
    await assertFails(create(as('ali'), 'ali', 'x'));
    await assertFails(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
    await toBin(as('ali'), 'ali', 's');
    await assertSucceeds(purge(as('ali'), 's', cur.totalBytes));
  });
  it('stats/capacity hanya mengungkap penuh atau belum', async () => {
    await assertSucceeds(getDoc(doc(as('ali'), 'stats/capacity')));
    await seed((db) => updateDoc(usage(db), { bytes: 1000000 }));
    await assertFails(getDoc(doc(as('ali'), 'stats/capacity')));
    await assertFails(getDoc(doc(as('out'), 'stats/capacity')));
  });
  it('admin bisa mengatur batas dan menghitung ulang', async () => {
    await assertSucceeds(updateDoc(usage(as('adm')), { limit: 2000, bytes: 5 }));
  });
});

describe('folder', () => {
  const newFolder = (db, u, id, patch = {}) =>
    setDoc(doc(db, 'folders', id), { name: 'Akademik', parent: null, createdBy: u, createdByName: USERS[u].name, createdAt: serverTimestamp(), ...patch });

  it('semua anggota bisa membuat folder dan subfolder, termasuk di folder orang lain', async () => {
    await assertSucceeds(newFolder(as('ali'), 'ali', 'f1'));
    await assertSucceeds(newFolder(as('bud'), 'bud', 'f2', { parent: 'f1' }));
    await assertSucceeds(newFolder(as('adm'), 'adm', 'f3', { parent: 'f2' }));
  });
  it('bukan anggota tidak bisa membuat atau melihat folder', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await assertFails(newFolder(as('out'), 'out', 'x'));
    await assertFails(getDoc(doc(as('out'), 'folders/f1')));
    await assertFails(getDocs(collection(as('out'), 'folders')));
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'folders')));
  });
  it('semua anggota bisa melihat daftar folder', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    assert.equal((await assertSucceeds(getDocs(collection(as('bud'), 'folders')))).size, 1);
  });
  it('tidak bisa mengaku sebagai pembuat lain atau memakai isian tidak sah', async () => {
    await assertFails(newFolder(as('bud'), 'ali', 'x'));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { createdAt: Timestamp.fromMillis(0) }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { name: '' }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { name: '  spasi ' }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { name: 'a'.repeat(121) }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { parent: 5 }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { lain: 1 }));
  });
  it('ubah nama, pindah, dan hapus hanya pembuat dan admin', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await newFolder(as('ali'), 'ali', 'f2');
    await assertFails(updateDoc(doc(as('bud'), 'folders/f1'), { name: 'Baru' }));
    await assertFails(updateDoc(doc(as('bud'), 'folders/f1'), { parent: 'f2' }));
    await assertFails(deleteDoc(doc(as('bud'), 'folders/f1')));
    await assertSucceeds(updateDoc(doc(as('ali'), 'folders/f1'), { name: 'Baru', parent: 'f2' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'folders/f1'), { name: 'Baru lagi', parent: null }));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'folders/f1')));
    await assertSucceeds(deleteDoc(doc(as('ali'), 'folders/f2')));
  });
  it('folder tidak bisa menjadi induk dirinya, dan pembuatnya tidak bisa diubah', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await assertFails(updateDoc(doc(as('ali'), 'folders/f1'), { parent: 'f1' }));
    await assertFails(updateDoc(doc(as('adm'), 'folders/f1'), { createdBy: 'adm' }));
  });
  it('SOP bisa diunggah langsung ke folder, dengan atau tanpa field folder', async () => {
    await assertSucceeds(create(as('ali'), 'ali', 'a', '{"a":1}', { folder: 'f1' }));
    await assertSucceeds(create(as('ali'), 'ali', 'b', '{"a":1}', { folder: null }));
    await assertSucceeds(create(as('ali'), 'ali', 'c'));
    await assertFails(create(as('ali'), 'ali', 'd', '{"a":1}', { folder: 5 }));
    await assertFails(create(as('ali'), 'ali', 'e', '{"a":1}', { folder: 'x'.repeat(65) }));
  });
  it('SOP hanya bisa dipindahkan oleh pembuat dan admin, termasuk SOP lama tanpa field folder', async () => {
    await given('ali', 's', 'public');
    await assertFails(updateDoc(doc(as('bud'), 'sops/s'), { folder: 'f1' }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'sops/s'), { folder: 'f1' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'sops/s'), { folder: 'f2' }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'sops/s'), { folder: null }));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: 5 }));
  });
  it('pindah folder tidak bisa sekaligus mengubah data lain, dan SOP terhapus tidak bisa dipindahkan', async () => {
    await given('ali', 's', 'public');
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: 'f1', title: 'Lain' }));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: 'f1', visibility: 'private' }));
    await toBin(as('ali'), 'ali', 's');
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: 'f1' }));
  });
  it('menyimpan isi mempertahankan folder dan tidak bisa memindahkannya', async () => {
    await create(as('ali'), 'ali', 's', '{"a":1}', { folder: 'f1' });
    await updateDoc(doc(as('ali'), 'sops/s'), { visibility: 'public' });
    const cur = await read('s');
    await assertFails(save(as('bud'), 'bud', 's', cur, '{"a":2}', { folder: 'f2' }));
    await assertSucceeds(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
    assert.equal((await read('s')).folder, 'f1');
  });
  it('folder tidak membuka akses: SOP private di folder orang lain tetap tertutup', async () => {
    await newFolder(as('bud'), 'bud', 'f1');
    await create(as('ali'), 'ali', 's', '{"a":1}', { folder: 'f1' });
    await assertFails(getDoc(doc(as('bud'), 'sops/s')));
  });
});

describe('sedang diedit', () => {
  const mark = (db, sopId, u, patch = {}) =>
    setDoc(doc(db, 'editing', `${sopId}_${u}`), { sopId, uid: u, name: USERS[u].name, at: serverTimestamp(), ...patch });

  it('anggota bisa menandai SOP public dan melihat tanda orang lain', async () => {
    await given('ali', 's', 'public');
    await assertSucceeds(mark(as('bud'), 's', 'bud'));
    await assertSucceeds(getDocs(collection(as('ali'), 'editing')));
  });
  it('tidak berlaku untuk SOP private', async () => {
    await given('ali', 's');
    await assertFails(mark(as('ali'), 's', 'ali'));
  });
  it('tidak bisa menandai atas nama orang lain atau waktu palsu', async () => {
    await given('ali', 's', 'public');
    await assertFails(mark(as('bud'), 's', 'ali'));
    await assertFails(setDoc(doc(as('bud'), 'editing/s_bud'), { sopId: 's', uid: 'bud', name: 'Bud', at: Timestamp.fromMillis(0) }));
  });
  it('bukan penghalang: yang lain tetap bisa menyimpan', async () => {
    const cur = await given('ali', 's', 'public');
    await mark(as('bud'), 's', 'bud');
    await assertSucceeds(save(as('ali'), 'ali', 's', cur, '{"a":2}'));
  });
  it('tanda orang lain hanya bisa dihapus bila kedaluwarsa', async () => {
    await given('ali', 's', 'public');
    await mark(as('bud'), 's', 'bud');
    await assertFails(deleteDoc(doc(as('ali'), 'editing/s_bud')));
    await assertSucceeds(deleteDoc(doc(as('bud'), 'editing/s_bud')));
    await seed((db) => setDoc(doc(db, 'editing/s_bud'), { sopId: 's', uid: 'bud', name: 'Bud', at: Timestamp.fromMillis(0) }));
    await assertSucceeds(deleteDoc(doc(as('ali'), 'editing/s_bud')));
  });
});

describe('anggota', () => {
  const add = (db, email, by, role = 'member') => setDoc(doc(db, 'members', email), { role, addedBy: by, addedAt: serverTimestamp() });

  it('hanya admin yang bisa mengelola dan melihat daftar', async () => {
    await assertFails(add(as('ali'), 'baru@ub.ac.id', 'ali@ub.ac.id'));
    await assertFails(add(as('out'), 'out@ub.ac.id', 'out@ub.ac.id'));
    await assertFails(getDocs(collection(as('ali'), 'members')));
    await assertSucceeds(add(as('adm'), 'baru@ub.ac.id', 'adm@ub.ac.id'));
    await assertSucceeds(getDocs(collection(as('adm'), 'members')));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'members/baru@ub.ac.id')));
  });
  it('anggota tidak bisa menaikkan perannya sendiri', async () => {
    await assertFails(updateDoc(doc(as('ali'), 'members/ali@ub.ac.id'), { role: 'admin' }));
  });
  it('hanya email @ub.ac.id huruf kecil yang bisa didaftarkan', async () => {
    for (const e of ['x@gmail.com', 'x@student.ub.ac.id', 'X@ub.ac.id', 'x@ub.ac.id.evil.com']) {
      await assertFails(add(as('adm'), e, 'adm@ub.ac.id'));
    }
  });
  it('admin tidak bisa mencabut aksesnya sendiri', async () => {
    await assertFails(deleteDoc(doc(as('adm'), 'members/adm@ub.ac.id')));
    await assertFails(updateDoc(doc(as('adm'), 'members/adm@ub.ac.id'), { role: 'member', addedBy: 'adm@ub.ac.id', addedAt: serverTimestamp() }));
  });
  it('anggota yang dicabut langsung kehilangan akses', async () => {
    await given('ali', 's', 'public');
    await assertSucceeds(getDoc(doc(as('bud'), 'sops/s')));
    await deleteDoc(doc(as('adm'), 'members/bud@ub.ac.id'));
    await assertFails(getDoc(doc(as('bud'), 'sops/s')));
  });
});
