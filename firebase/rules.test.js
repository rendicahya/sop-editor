// Menguji firestore.rules di emulator. Jalankan: npm test (dari folder firebase/).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, deleteField, doc, getCountFromServer, getDoc, getDocs, increment, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

const USERS = {
  ali: { email: 'ali@ub.ac.id', name: 'Ali' },
  bud: { email: 'bud@ub.ac.id', name: 'Bud' },
  adm: { email: 'adm@ub.ac.id', name: 'Adm' },
  out: { email: 'out@ub.ac.id', name: 'Bukan anggota' },
  mhs: { email: 'mhs@student.ub.ac.id', name: 'Mahasiswa' },
  gml: { email: 'gml@gmail.com', name: 'Gmail' },
  gout: { email: 'gout@gmail.com', name: 'Gmail bukan anggota' },
  yah: { email: 'yah@yahoo.com', name: 'Yahoo' }
};

let env;
const as = (u, extra = {}) => env.authenticatedContext(u, { email: USERS[u].email, email_verified: true, ...extra }).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((c) => fn(c.firestore()));
const bytes = (s) => new TextEncoder().encode(s).length;
const usage = (db) => doc(db, 'stats/usage');

function newSop(u, json, patch = {}) {
  const size = bytes(json);
  return {
    title: 'SOP A', nomor: 'N1', json, size, totalBytes: size, rev: 1, custom: false, readers: [USERS[u].email], editors: [USERS[u].email],
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

/** Daftar hak akses khusus: `view` dan `edit` berisi email, atau '*' untuk semua anggota. Pemilik selalu tercantum. */
const custom = (u, view = [], edit = []) => ({
  custom: true,
  readers: [USERS[u].email, ...view, ...edit],
  editors: [USERS[u].email, ...edit]
});
/** Menyiapkan SOP lewat jalur resmi milik `u`. 'public' berarti semua anggota punya hak edit. */
async function given(u, id, visibility = 'private') {
  await create(as(u), u, id);
  if (visibility === 'public') await updateDoc(doc(as(u), 'sops', id), custom(u, [], ['*']));
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
    await setDoc(doc(db, 'members/gml@gmail.com'), { role: 'member' });
    await setDoc(doc(db, 'members/yah@yahoo.com'), { role: 'admin' });
    await setDoc(usage(db), { bytes: 0, limit: 1000000, lastSop: '' });
    await setDoc(doc(db, 'stats/rpsUsage'), { bytes: 0, limit: 1000000, lastSop: '' });
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
    for (const u of ['mhs', 'yah']) await assertFails(getDoc(doc(as(u), 'sops/s')));
  });
  it('Gmail yang didaftarkan admin diterima seperti anggota biasa', async () => {
    await given('ali', 's', 'public');
    await assertSucceeds(getDoc(doc(as('gml'), 'sops/s')));
    await assertSucceeds(create(as('gml'), 'gml', 'x'));
  });
  it('Gmail yang tidak didaftarkan, atau belum terverifikasi, ditolak', async () => {
    await given('ali', 's', 'public');
    await assertFails(getDoc(doc(as('gout'), 'sops/s')));
    await assertFails(create(as('gout'), 'gout', 'x'));
    await assertFails(getDoc(doc(as('gml', { email_verified: false }), 'sops/s')));
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

describe('hak akses SOP', () => {
  const ALI = 'ali@ub.ac.id';
  const BUD = 'bud@ub.ac.id';
  it('SOP baru hanya bisa dilihat pemiliknya, tidak bisa langsung dibagikan', async () => {
    await assertFails(create(as('ali'), 'ali', 'x', '{}', custom('ali', [], ['*'])));
    await assertFails(create(as('ali'), 'ali', 'x', '{}', { readers: [ALI, BUD] }));
    await assertFails(create(as('ali'), 'ali', 'x', '{}', { readers: [], editors: [] }));
    await assertFails(create(as('ali'), 'ali', 'x', '{}', { visibility: 'public' }));
    await assertSucceeds(create(as('ali'), 'ali', 'x'));
  });
  it('tanpa hak: anggota lain tidak bisa membaca, pemilik dan admin bisa', async () => {
    await given('ali', 's');
    await assertFails(getDoc(doc(as('bud'), 'sops/s')));
    await assertSucceeds(getDoc(doc(as('ali'), 'sops/s')));
    await assertSucceeds(getDoc(doc(as('adm'), 'sops/s')));
  });
  it('hak view: bisa membaca dan melihat riwayat, tidak bisa menyimpan', async () => {
    const cur = await given('ali', 's');
    await save(as('ali'), 'ali', 's', cur, '{"a":2}');
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [BUD]));
    await assertSucceeds(getDoc(doc(as('bud'), 'sops/s')));
    await assertSucceeds(getDoc(doc(as('bud'), 'sops/s/versions/1')));
    await assertFails(save(as('bud'), 'bud', 's', await read('s'), '{"a":3}'));
  });
  it('hak edit: bisa menyimpan dan mengubah nama, tetapi bukan memindahkan, menghapus, atau mengubah hak akses', async () => {
    await given('ali', 's');
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [], [BUD]));
    const cur = await read('s');
    await assertSucceeds(save(as('bud'), 'bud', 's', cur, '{"a":3}'));
    await assertSucceeds(save(as('bud'), 'bud', 's', await read('s'), '{"a":4}', { title: 'Baru' }));
    await assertFails(updateDoc(doc(as('bud'), 'sops/s'), custom('ali', [], [BUD, 'x@ub.ac.id'])));
    await assertFails(updateDoc(doc(as('bud'), 'sops/s'), { folder: null }));
    await assertFails(toBin(as('bud'), 'bud', 's'));
  });
  it('hanya email yang disebut yang mendapat hak', async () => {
    await given('ali', 's');
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [], [BUD]));
    await assertFails(getDoc(doc(as('mhs'), 'sops/s')));
    await assertFails(getDoc(doc(as('out'), 'sops/s')));
  });
  it('anggota yang dicabut langsung kehilangan akses', async () => {
    const cur = await given('ali', 's');
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [], [BUD]));
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali'));
    await assertFails(getDoc(doc(as('bud'), 'sops/s')));
    await assertFails(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
  });
  it('pemilik selalu tercantum, dan editor harus juga pembaca', async () => {
    await given('ali', 's');
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { custom: true, readers: [BUD], editors: [BUD] }));
    await assertFails(updateDoc(doc(as('adm'), 'sops/s'), { custom: true, readers: [BUD], editors: [BUD] }));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { custom: true, readers: [ALI], editors: [ALI, BUD] }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'sops/s'), custom('ali', [BUD])));
  });
  it('kueri daftar: anggota mendapat yang dibagikan kepadanya, tidak bisa meminta semua', async () => {
    await given('ali', 'priv');
    await given('ali', 'pub', 'public');
    await given('ali', 'shared');
    await updateDoc(doc(as('ali'), 'sops/shared'), custom('ali', [BUD]));
    const db = as('bud');
    const live = where('deletedBy', '==', null);
    const ids = async (...w) => (await assertSucceeds(getDocs(query(collection(db, 'sops'), ...w)))).docs.map((d) => d.id);
    assert.deepEqual(await ids(live, where('readers', 'array-contains', BUD)), ['shared']);
    assert.deepEqual(await ids(live, where('readers', 'array-contains', '*')), ['pub']);
    await assertFails(getDocs(collection(db, 'sops')));
    await assertFails(getDocs(query(collection(db, 'sops'), where('readers', 'array-contains', BUD))));
    await assertFails(getDocs(query(collection(db, 'sops'), live, where('readers', 'array-contains', ALI))));
    assert.equal((await assertSucceeds(getDocs(collection(as('adm'), 'sops')))).size, 3);
  });
  it('SOP lama (visibility): hanya admin atau pemilik yang bisa mengonversinya', async () => {
    const legacy = { ...newSop('ali', '{}'), visibility: 'public' };
    delete legacy.custom; delete legacy.readers; delete legacy.editors;
    await seed((db) => setDoc(doc(db, 'sops/old'), legacy));
    const after = { ...custom('ali', [], ['*']), visibility: deleteField() };
    await assertFails(updateDoc(doc(as('bud'), 'sops/old'), after));
    await assertFails(updateDoc(doc(as('adm'), 'sops/old'), custom('ali', [], ['*'])));
    await assertSucceeds(updateDoc(doc(as('adm'), 'sops/old'), after));
    assert.equal((await read('old')).visibility, undefined);
    await assertSucceeds(getDoc(doc(as('bud'), 'sops/old')));
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
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali'));
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
  it('pembuat, admin, dan pemegang hak edit; hak lihat tidak cukup', async () => {
    const cur = await given('ali', 's');
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [USERS.bud.email]));
    await assertFails(save(as('bud'), 'bud', 's', await read('s'), '{"a":2}', { title: 'Baru' }));
    await assertSucceeds(save(as('ali'), 'ali', 's', cur, '{"a":2}', { title: 'Baru' }));
    await assertSucceeds(save(as('adm'), 'adm', 's', await read('s'), '{"a":3}', { title: 'Baru lagi' }));
  });
});

describe('kode pustaka', () => {
  it('pemegang hak edit bisa mengubahnya tanpa versi baru; hak lihat tidak cukup', async () => {
    await given('ali', 's');
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [USERS.bud.email]));
    await assertFails(updateDoc(doc(as('bud'), 'sops/s'), { code: 'A.1' }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'sops/s'), { code: 'A.1' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'sops/s'), { code: '' }));
    assert.equal((await read('s')).rev, 1);
  });
  it('panjangnya dibatasi dan tidak bisa sekalian mengubah isi', async () => {
    await given('ali', 's');
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { code: 'x'.repeat(41) }));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { code: 1 }));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { code: 'A.1', title: 'Lain' }));
  });
  it('SOP di Recycle bin tidak bisa diubah kodenya', async () => {
    await given('ali', 's');
    await toBin(as('ali'), 'ali', 's');
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { code: 'A.1' }));
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

/** Menghapus satu versi riwayat beserta ruangnya (lihat isHistoryPrune). */
function prune(db, id, cur, rev, size, patch = {}) {
  const b = writeBatch(db);
  b.delete(doc(db, 'sops', id, 'versions', String(rev)));
  b.update(doc(db, 'sops', id), { totalBytes: cur.totalBytes - size, prunedRev: String(rev), prunedAt: serverTimestamp(), ...patch });
  b.update(usage(db), { bytes: increment(-size), lastSop: id });
  return b.commit();
}

describe('membersihkan riwayat lama', () => {
  /** SOP milik ali yang bisa diedit semua anggota, dengan dua versi lama (rev 1 dan 2). */
  async function withHistory() {
    let cur = await given('ali', 's', 'public');
    await save(as('bud'), 'bud', 's', cur, '{"a":22}');
    cur = await read('s');
    await save(as('ali'), 'ali', 's', cur, '{"a":333}');
    return read('s');
  }
  const v1 = bytes('{"a":1}');

  it('pemilik dan admin bisa; ruangnya dikembalikan ke SOP dan penghitung', async () => {
    let cur = await withHistory();
    const before = await usedBytes();
    await assertSucceeds(prune(as('ali'), 's', cur, 1, v1));
    assert.equal(await usedBytes(), before - v1);
    cur = await read('s');
    assert.equal(cur.totalBytes, cur.size + bytes('{"a":22}'));
    await assertSucceeds(prune(as('adm'), 's', cur, 2, bytes('{"a":22}')));
    assert.equal((await read('s')).totalBytes, cur.size);
  });
  it('pemegang hak edit atau lihat tidak bisa', async () => {
    const cur = await withHistory();
    await assertFails(prune(as('bud'), 's', cur, 1, v1));
  });
  it('ukuran yang dikembalikan harus sama dengan ukuran versinya', async () => {
    const cur = await withHistory();
    await assertFails(prune(as('ali'), 's', cur, 1, v1 + 5));
    await assertFails(prune(as('ali'), 's', cur, 1, v1, { totalBytes: cur.totalBytes - v1 - 5 }));
  });
  it('versi tidak bisa dihapus tanpa menandai dan mengembalikan ruangnya', async () => {
    await withHistory();
    await assertFails(deleteDoc(doc(as('ali'), 'sops/s/versions/1')));
  });
  it('tidak bisa menyamar sebagai pembersihan untuk mengubah isi atau mengurangi ruang tanpa menghapus', async () => {
    const cur = await withHistory();
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { totalBytes: cur.totalBytes - v1, prunedRev: '1', prunedAt: serverTimestamp() }));
    await assertFails(prune(as('ali'), 's', cur, 1, v1, { json: '{"b":1}' }));
  });
  it('SOP di recycle bin tidak bisa dibersihkan', async () => {
    const cur = await withHistory();
    await toBin(as('ali'), 'ali', 's');
    await assertFails(prune(as('ali'), 's', cur, 1, v1));
  });
  it('menyimpan tetap berjalan setelah riwayat dibersihkan', async () => {
    let cur = await withHistory();
    await prune(as('ali'), 's', cur, 1, v1);
    cur = await read('s');
    await assertSucceeds(save(as('bud'), 'bud', 's', cur, '{"a":4444}'));
  });
});

describe('komentar', () => {
  const cdoc = (db, cid) => doc(db, 'sops', 's', 'comments', cid);
  const comment = (u, patch = {}) => ({
    parent: null, anchor: 'st:x:kegiatan', label: 'Langkah 1 · Kegiatan', quote: 'Mulai', text: 'Mohon diperjelas',
    by: u, byName: USERS[u].name, byEmail: USERS[u].email, at: serverTimestamp(), editedAt: null,
    resolved: false, resolvedBy: null, resolvedByName: null, resolvedAt: null, ...patch
  });
  const reply = (u, parent, patch = {}) => comment(u, { parent, anchor: null, label: '', quote: '', text: 'Baik', ...patch });
  const resolve = (db, u, cid) => updateDoc(cdoc(db, cid), { resolved: true, resolvedBy: u, resolvedByName: USERS[u].name, resolvedAt: serverTimestamp() });
  const reopen = (db, cid) => updateDoc(cdoc(db, cid), { resolved: false, resolvedBy: null, resolvedByName: null, resolvedAt: null });
  /** SOP milik ali yang hanya bisa dilihat bud (gml tidak punya hak). */
  async function viewable() {
    await given('ali', 's');
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [USERS.bud.email]));
  }

  it('pemegang hak lihat bisa berkomentar, membalas, dan membaca; tanpa hak tidak bisa', async () => {
    await viewable();
    await assertSucceeds(setDoc(cdoc(as('bud'), 'c1'), comment('bud')));
    await assertSucceeds(setDoc(cdoc(as('ali'), 'r1'), reply('ali', 'c1')));
    await assertSucceeds(getDocs(collection(as('bud'), 'sops', 's', 'comments')));
    await assertFails(getDocs(collection(as('gml'), 'sops', 's', 'comments')));
    await assertFails(setDoc(cdoc(as('gml'), 'c2'), comment('gml')));
    await assertFails(setDoc(cdoc(as('out'), 'c3'), comment('out')));
  });
  it('tidak bisa mengaku orang lain, langsung selesai, atau memakai isian tidak sah', async () => {
    await viewable();
    await assertFails(setDoc(cdoc(as('bud'), 'c1'), comment('ali')));
    await assertFails(setDoc(cdoc(as('bud'), 'c1'), comment('bud', { byEmail: 'ali@ub.ac.id' })));
    await assertFails(setDoc(cdoc(as('bud'), 'c1'), comment('bud', { resolved: true })));
    await assertFails(setDoc(cdoc(as('bud'), 'c1'), comment('bud', { text: '' })));
    await assertFails(setDoc(cdoc(as('bud'), 'c1'), comment('bud', { text: 'x'.repeat(4001) })));
    await assertFails(setDoc(cdoc(as('bud'), 'c1'), comment('bud', { extra: 1 })));
  });
  it('balasan hanya untuk komentar utama yang ada, tanpa bersarang', async () => {
    await viewable();
    await setDoc(cdoc(as('bud'), 'c1'), comment('bud'));
    await setDoc(cdoc(as('ali'), 'r1'), reply('ali', 'c1'));
    await assertFails(setDoc(cdoc(as('bud'), 'r2'), reply('bud', 'r1')));
    await assertFails(setDoc(cdoc(as('bud'), 'r3'), reply('bud', 'nope')));
    await assertFails(setDoc(cdoc(as('bud'), 'r4'), reply('bud', 'c1', { anchor: 'h:nomor' })));
  });
  it('siapa pun yang bisa melihat bisa menandai selesai dan membukanya lagi; balasan tidak bisa', async () => {
    await viewable();
    await setDoc(cdoc(as('ali'), 'c1'), comment('ali'));
    await setDoc(cdoc(as('ali'), 'r1'), reply('ali', 'c1'));
    await assertFails(resolve(as('bud'), 'ali', 'c1'));
    await assertSucceeds(resolve(as('bud'), 'bud', 'c1'));
    await assertFails(resolve(as('ali'), 'ali', 'c1')); // sudah selesai
    await assertFails(resolve(as('gml'), 'gml', 'c1'));
    await assertSucceeds(reopen(as('bud'), 'c1'));
    await assertFails(resolve(as('bud'), 'bud', 'r1'));
    await assertFails(updateDoc(cdoc(as('bud'), 'c1'), { resolved: true, resolvedBy: 'bud', resolvedByName: 'Bud', resolvedAt: serverTimestamp(), text: 'ubah' }));
  });
  it('teks hanya bisa diubah penulisnya', async () => {
    await viewable();
    await setDoc(cdoc(as('bud'), 'c1'), comment('bud'));
    await assertSucceeds(updateDoc(cdoc(as('bud'), 'c1'), { text: 'Diperbaiki', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(cdoc(as('ali'), 'c1'), { text: 'Bukan milikku', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(cdoc(as('bud'), 'c1'), { anchor: 'h:nomor' }));
  });
  it('dihapus oleh penulisnya, pemilik SOP, atau admin; balasan ikut terhapus', async () => {
    await viewable();
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [USERS.bud.email, USERS.gml.email]));
    await setDoc(cdoc(as('bud'), 'c1'), comment('bud'));
    await setDoc(cdoc(as('gml'), 'r1'), reply('gml', 'c1'));
    await setDoc(cdoc(as('gml'), 'c2'), comment('gml'));
    await setDoc(cdoc(as('gml'), 'c3'), comment('gml'));
    await assertFails(deleteDoc(cdoc(as('bud'), 'c2')));
    await assertFails(deleteDoc(cdoc(as('bud'), 'r1')));
    await assertSucceeds(deleteDoc(cdoc(as('ali'), 'c2')));
    await assertSucceeds(deleteDoc(cdoc(as('adm'), 'c3')));
    const db = as('bud');
    const b = writeBatch(db);
    b.delete(cdoc(db, 'c1'));
    b.delete(cdoc(db, 'r1'));
    await assertSucceeds(b.commit());
  });
  it('jumlah komentar terbuka bisa dihitung oleh yang bisa melihat SOP', async () => {
    await viewable();
    await setDoc(cdoc(as('bud'), 'c1'), comment('bud'));
    await setDoc(cdoc(as('ali'), 'r1'), reply('ali', 'c1'));
    const q = (db) => query(collection(db, 'sops', 's', 'comments'), where('parent', '==', null), where('resolved', '==', false));
    const n = await getCountFromServer(q(as('bud')));
    assert.equal(n.data().count, 1);
    await assertFails(getCountFromServer(q(as('gml'))));
  });
  it('yang disebut bisa menemukan komentarnya lintas SOP, yang lain tidak', async () => {
    await viewable();
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [USERS.bud.email, USERS.gml.email]));
    await assertSucceeds(setDoc(cdoc(as('bud'), 'c1'), comment('bud', { mentions: ['gml@gmail.com'] })));
    await assertSucceeds(setDoc(cdoc(as('bud'), 'c2'), comment('bud')));
    await assertSucceeds(setDoc(cdoc(as('ali'), 'r1'), reply('ali', 'c2', { mentions: ['gml@gmail.com', 'bud@ub.ac.id'] })));
    const mine = (u) => query(collectionGroup(as(u), 'comments'), where('mentions', 'array-contains', USERS[u].email));
    const got = await assertSucceeds(getDocs(mine('gml')));
    assert.deepEqual(got.docs.map((d) => d.id).sort(), ['c1', 'r1']);
    assert.equal((await getDocs(mine('bud'))).size, 1);
    await assertFails(getDocs(query(collectionGroup(as('gml'), 'comments'), where('mentions', 'array-contains', 'bud@ub.ac.id'))));
    await assertFails(getDocs(collectionGroup(as('gml'), 'comments')));
  });
  it('daftar sebutan dibatasi dan hanya penulis yang bisa mengubahnya', async () => {
    await viewable();
    const many = Array.from({ length: 21 }, (_, i) => `x${i}@ub.ac.id`);
    await assertFails(setDoc(cdoc(as('bud'), 'c1'), comment('bud', { mentions: many })));
    await assertFails(setDoc(cdoc(as('bud'), 'c1'), comment('bud', { mentions: 'ali@ub.ac.id' })));
    await setDoc(cdoc(as('bud'), 'c1'), comment('bud'));
    await assertSucceeds(updateDoc(cdoc(as('bud'), 'c1'), { text: '@ali@ub.ac.id cek', mentions: ['ali@ub.ac.id'], editedAt: serverTimestamp() }));
    await assertFails(updateDoc(cdoc(as('ali'), 'c1'), { mentions: ['ali@ub.ac.id', 'gml@gmail.com'], text: 'x', editedAt: serverTimestamp() }));
  });
  it('SOP di recycle bin tidak bisa dikomentari; penghapusnya bisa membersihkan komentarnya', async () => {
    await viewable();
    await setDoc(cdoc(as('bud'), 'c1'), comment('bud'));
    await toBin(as('ali'), 'ali', 's');
    await assertFails(setDoc(cdoc(as('ali'), 'c2'), comment('ali')));
    await assertFails(resolve(as('ali'), 'ali', 'c1'));
    await assertFails(deleteDoc(cdoc(as('bud'), 'c1')));
    await assertSucceeds(deleteDoc(cdoc(as('ali'), 'c1')));
  });
});

describe('kunci edit', () => {
  const ldoc = (db) => doc(db, 'locks', 's');
  const lock = (u) => setDoc(ldoc(as(u)), { uid: u, name: USERS[u].name, at: serverTimestamp() });
  const stale = () => seed((db) => setDoc(ldoc(db), { uid: 'ali', name: 'Ali', at: Timestamp.fromMillis(Date.now() - 10 * 60 * 1000) }));

  it('pemegang hak edit bisa mengunci; selama berlaku yang lain tidak bisa mengambil atau menghapusnya', async () => {
    await given('ali', 's', 'public');
    await assertSucceeds(lock('ali'));
    await assertSucceeds(lock('ali')); // diperbarui berkala
    await assertFails(lock('bud'));
    await assertFails(deleteDoc(ldoc(as('bud'))));
    await assertFails(deleteDoc(ldoc(as('adm'))));
    await assertSucceeds(getDoc(ldoc(as('bud'))));
    await assertSucceeds(deleteDoc(ldoc(as('ali'))));
    await assertSucceeds(lock('bud'));
  });
  it('hak lihat dan bukan anggota tidak bisa mengunci; tidak bisa memalsukan pemegang atau waktu', async () => {
    await given('ali', 's');
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [USERS.bud.email]));
    await assertFails(lock('bud'));
    await assertFails(lock('out'));
    await assertFails(setDoc(ldoc(as('ali')), { uid: 'bud', name: 'Bud', at: serverTimestamp() }));
    await assertFails(setDoc(ldoc(as('ali')), { uid: 'ali', name: 'Ali', at: Timestamp.fromMillis(Date.now() + 3600000) }));
  });
  it('selama dikunci, hanya pemegang kunci yang bisa menyimpan isi', async () => {
    let cur = await given('ali', 's', 'public');
    await lock('bud');
    await assertFails(save(as('ali'), 'ali', 's', cur, '{"a":2}'));
    await assertFails(save(as('adm'), 'adm', 's', cur, '{"a":2}'));
    await assertSucceeds(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
    cur = await read('s');
    await deleteDoc(ldoc(as('bud')));
    await assertSucceeds(save(as('ali'), 'ali', 's', cur, '{"a":3}'));
  });
  it('kunci kedaluwarsa (5 menit tanpa pembaruan) tidak lagi menghalangi, dan boleh diambil atau dibersihkan', async () => {
    const cur = await given('ali', 's', 'public');
    await stale();
    await assertSucceeds(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
    await assertSucceeds(lock('bud'));
    await stale();
    await assertSucceeds(deleteDoc(ldoc(as('bud'))));
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
  const ALI = 'ali@ub.ac.id';
  const BUD = 'bud@ub.ac.id';
  /** Folder baru mengikuti induknya; `lists` diisi sesuai yang harus disalin dari induk. */
  const newFolder = (db, u, id, patch = {}) =>
    setDoc(doc(db, 'folders', id), {
      name: 'Akademik', parent: null, custom: false, readers: [USERS[u].email], editors: [USERS[u].email],
      createdBy: u, createdByName: USERS[u].name, createdByEmail: USERS[u].email, createdAt: serverTimestamp(), ...patch
    });
  const shareFolder = (u, id, view = [], edit = []) => updateDoc(doc(as(u), 'folders', id), custom(u, view, edit));
  const inFolder = (lists, folder) => ({ folder, readers: lists.readers, editors: lists.editors });

  it('semua anggota bisa membuat folder di tingkat utama', async () => {
    await assertSucceeds(newFolder(as('ali'), 'ali', 'f1'));
    await assertSucceeds(newFolder(as('bud'), 'bud', 'f2'));
  });
  it('subfolder hanya bisa dibuat pemilik folder induk dan admin; hak edit tidak cukup', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    const lists = { readers: [ALI, BUD], editors: [ALI, BUD] };
    await assertFails(newFolder(as('bud'), 'bud', 'x', { parent: 'f1', ...lists }));
    await shareFolder('ali', 'f1', [], [BUD]);
    await assertFails(newFolder(as('bud'), 'bud', 'x', { parent: 'f1', ...lists }));
    await assertSucceeds(newFolder(as('ali'), 'ali', 'f2', { parent: 'f1', readers: [ALI, BUD], editors: [ALI, BUD] }));
    const adm = USERS.adm.email;
    await assertSucceeds(newFolder(as('adm'), 'adm', 'f3', { parent: 'f1', readers: [ALI, BUD, adm], editors: [ALI, BUD, adm] }));
  });
  it('bukan anggota tidak bisa membuat atau melihat folder', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await assertFails(newFolder(as('out'), 'out', 'x'));
    await assertFails(getDoc(doc(as('out'), 'folders/f1')));
    await assertFails(getDocs(collection(as('out'), 'folders')));
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'folders')));
  });
  it('folder hanya terlihat oleh yang diberi hak, pemilik, dan admin', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await newFolder(as('ali'), 'ali', 'f2');
    await assertFails(getDoc(doc(as('bud'), 'folders/f1')));
    await assertSucceeds(getDoc(doc(as('adm'), 'folders/f1')));
    await shareFolder('ali', 'f1', [BUD]);
    await assertSucceeds(getDoc(doc(as('bud'), 'folders/f1')));
    const q = query(collection(as('bud'), 'folders'), where('readers', 'array-contains', BUD));
    assert.deepEqual((await assertSucceeds(getDocs(q))).docs.map((d) => d.id), ['f1']);
    await assertFails(getDocs(collection(as('bud'), 'folders')));
    assert.equal((await assertSucceeds(getDocs(collection(as('adm'), 'folders')))).size, 2);
  });
  it('tidak bisa mengaku sebagai pembuat lain atau memakai isian tidak sah', async () => {
    await assertFails(newFolder(as('bud'), 'ali', 'x'));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { createdAt: Timestamp.fromMillis(0) }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { name: '' }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { name: '  spasi ' }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { name: 'a'.repeat(121) }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { parent: 5 }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { lain: 1 }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { createdByEmail: BUD }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { custom: true }));
    await assertFails(newFolder(as('ali'), 'ali', 'x', { readers: ['*', ALI] }));
  });
  it('hak edit cukup untuk ubah nama; pindah, hak akses, dan hapus hanya pemilik dan admin', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await newFolder(as('ali'), 'ali', 'f2');
    await newFolder(as('ali'), 'ali', 'f3');
    await shareFolder('ali', 'f3', [BUD]);
    await assertFails(updateDoc(doc(as('bud'), 'folders/f3'), { name: 'Lihat saja' }));
    await shareFolder('ali', 'f1', [], [BUD]);
    await assertSucceeds(updateDoc(doc(as('bud'), 'folders/f1'), { name: 'Oleh Bud' }));
    await assertFails(updateDoc(doc(as('bud'), 'folders/f1'), { name: 'Oleh Bud', parent: null, lain: 1 }));
    await assertFails(updateDoc(doc(as('bud'), 'folders/f1'), { parent: 'f2' }));
    await assertFails(deleteDoc(doc(as('bud'), 'folders/f1')));
    await assertFails(updateDoc(doc(as('bud'), 'folders/f1'), custom('ali')));
    await assertSucceeds(updateDoc(doc(as('ali'), 'folders/f1'), { name: 'Baru' }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'folders/f1'), { parent: 'f2' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'folders/f1'), { name: 'Baru lagi' }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'folders/f1'), { parent: null }));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'folders/f1')));
    await assertSucceeds(deleteDoc(doc(as('ali'), 'folders/f2')));
  });
  it('folder tidak bisa menjadi induk dirinya, dan pembuatnya tidak bisa diubah', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await assertFails(updateDoc(doc(as('ali'), 'folders/f1'), { parent: 'f1' }));
    await assertFails(updateDoc(doc(as('adm'), 'folders/f1'), { createdBy: 'adm' }));
  });
  it('folder hanya bisa dipindahkan ke folder milik sendiri', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await newFolder(as('bud'), 'bud', 'mine');
    await newFolder(as('bud'), 'bud', 'dest');
    const lists = { readers: [ALI, BUD], editors: [ALI, BUD] };
    await shareFolder('ali', 'f1', [], [BUD]);
    await assertFails(updateDoc(doc(as('bud'), 'folders/mine'), { parent: 'f1', ...lists }));
    await assertSucceeds(updateDoc(doc(as('bud'), 'folders/mine'), { parent: 'dest' }));
  });
  it('isi folder mewarisi hak akses: SOP baru wajib menyalin daftar folder ditambah pemiliknya', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await shareFolder('ali', 'f1', [], [BUD]);
    const adm = USERS.adm.email;
    const both = { readers: [ALI, BUD, adm], editors: [ALI, BUD, adm] };
    await assertFails(create(as('bud'), 'bud', 'x', '{"a":1}', inFolder({ readers: [ALI, BUD], editors: [ALI, BUD] }, 'f1')));
    await assertFails(create(as('adm'), 'adm', 'x', '{"a":1}', { folder: 'f1' }));
    await assertSucceeds(create(as('adm'), 'adm', 'a', '{"a":1}', inFolder(both, 'f1')));
    // Pemilik folder dan pemegang hak folder bisa membuka SOP orang lain di dalamnya.
    await assertSucceeds(getDoc(doc(as('ali'), 'sops/a')));
    await assertSucceeds(save(as('bud'), 'bud', 'a', await read('a'), '{"a":2}'));
  });
  it('tidak bisa mengunggah ke folder tanpa hak edit, folder yang tidak ada, atau rujukan tidak sah', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await shareFolder('ali', 'f1', [BUD]);
    await assertFails(create(as('bud'), 'bud', 'a', '{"a":1}', inFolder({ readers: [ALI, BUD], editors: [ALI, BUD] }, 'f1')));
    await assertFails(create(as('bud'), 'bud', 'b', '{"a":1}', { folder: 'tidak-ada' }));
    await assertFails(create(as('ali'), 'ali', 'd', '{"a":1}', { folder: 5 }));
    await assertFails(create(as('ali'), 'ali', 'e', '{"a":1}', { folder: 'x'.repeat(65) }));
    await assertFails(create(as('ali'), 'ali', 'f', '{"a":1}', { folder: 'a/b' }));
    await assertSucceeds(create(as('ali'), 'ali', 'g', '{"a":1}', { folder: null }));
    await assertSucceeds(create(as('ali'), 'ali', 'h'));
  });
  it('perubahan hak folder disalin ke isinya; penyalinan hanya bisa berisi daftar folder', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await create(as('ali'), 'ali', 's', '{"a":1}', { folder: 'f1' });
    await shareFolder('ali', 'f1', [BUD]);
    await assertFails(getDoc(doc(as('bud'), 'sops/s')));
    // Bud tidak bisa memberi dirinya hak edit, tetapi menyalin daftar yang benar diperbolehkan siapa saja.
    await assertFails(updateDoc(doc(as('bud'), 'sops/s'), { readers: [ALI, BUD], editors: [ALI, BUD] }));
    await assertSucceeds(updateDoc(doc(as('bud'), 'sops/s'), { readers: [ALI, BUD], editors: [ALI] }));
    await assertSucceeds(getDoc(doc(as('bud'), 'sops/s')));
    await assertFails(save(as('bud'), 'bud', 's', await read('s'), '{"a":2}'));
  });
  it('hak khusus file tidak ikut berubah, dan tidak bisa ditimpa penyalinan', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await create(as('ali'), 'ali', 's', '{"a":1}', { folder: 'f1' });
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali'));
    await shareFolder('ali', 'f1', [BUD]);
    await assertFails(updateDoc(doc(as('bud'), 'sops/s'), { readers: [ALI, BUD], editors: [ALI] }));
    await assertFails(getDoc(doc(as('bud'), 'sops/s')));
  });
  it('pemilik bisa kembali mengikuti folder, tetapi daftarnya harus sama', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await shareFolder('ali', 'f1', [BUD]);
    await create(as('ali'), 'ali', 's', '{"a":1}', { folder: 'f1', readers: [ALI, BUD], editors: [ALI] });
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali'));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { custom: false }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'sops/s'), { custom: false, readers: [ALI, BUD], editors: [ALI] }));
  });
  it('subfolder mewarisi hak folder induknya dalam satu batch', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await newFolder(as('ali'), 'ali', 'f2', { parent: 'f1' });
    await create(as('ali'), 'ali', 's', '{"a":1}', { folder: 'f2' });
    const db = as('ali');
    const b = writeBatch(db);
    const lists = { readers: [ALI, BUD], editors: [ALI] };
    b.update(doc(db, 'folders/f1'), { custom: true, ...lists });
    b.update(doc(db, 'folders/f2'), lists);
    b.update(doc(db, 'sops/s'), lists);
    await assertSucceeds(b.commit());
    await assertSucceeds(getDoc(doc(as('bud'), 'sops/s')));
    await assertSucceeds(getDoc(doc(as('bud'), 'folders/f2')));
  });
  it('folder yang sudah terhapus dibaca sebagai tingkat utama', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await shareFolder('ali', 'f1', [BUD]);
    await create(as('ali'), 'ali', 's', '{"a":1}', { folder: 'f1', readers: [ALI, BUD], editors: [ALI] });
    await deleteDoc(doc(as('ali'), 'folders/f1'));
    await assertFails(updateDoc(doc(as('bud'), 'sops/s'), { readers: [ALI, BUD], editors: [ALI] }));
    await assertSucceeds(updateDoc(doc(as('bud'), 'sops/s'), { readers: [ALI], editors: [ALI] }));
    await assertFails(getDoc(doc(as('bud'), 'sops/s')));
  });
  it('SOP hanya bisa dipindahkan oleh pemilik dan admin, ke folder yang boleh diedit', async () => {
    await newFolder(as('bud'), 'bud', 'closed');
    await newFolder(as('ali'), 'ali', 'open');
    await given('ali', 's', 'public');
    const self = { readers: [ALI, '*'], editors: [ALI, '*'] };
    await assertFails(updateDoc(doc(as('bud'), 'sops/s'), { folder: 'open' }));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: 'closed' }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'sops/s'), { folder: 'open' }));
    assert.deepEqual((await read('s')).readers.sort(), self.readers.sort());
    await assertSucceeds(updateDoc(doc(as('adm'), 'sops/s'), { folder: 'closed' }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'sops/s'), { folder: null }));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: 5 }));
  });
  it('SOP yang mengikuti folder memakai daftar folder tujuan saat dipindahkan', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await shareFolder('ali', 'f1', [BUD]);
    await create(as('ali'), 'ali', 's');
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: 'f1' }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'sops/s'), { folder: 'f1', readers: [ALI, BUD], editors: [ALI] }));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: null }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'sops/s'), { folder: null, readers: [ALI], editors: [ALI] }));
  });
  it('pindah folder tidak bisa sekaligus mengubah data lain, dan SOP terhapus tidak bisa dipindahkan', async () => {
    await given('ali', 's', 'public');
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: null, title: 'Lain' }));
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: null, readers: [ALI], editors: [ALI] }));
    await toBin(as('ali'), 'ali', 's');
    await assertFails(updateDoc(doc(as('ali'), 'sops/s'), { folder: null }));
  });
  it('menyimpan isi mempertahankan folder dan tidak bisa memindahkannya', async () => {
    await newFolder(as('ali'), 'ali', 'f1');
    await newFolder(as('ali'), 'ali', 'f2');
    await shareFolder('ali', 'f1', [], [BUD]);
    await create(as('ali'), 'ali', 's', '{"a":1}', { folder: 'f1', readers: [ALI, BUD], editors: [ALI, BUD] });
    const cur = await read('s');
    await assertFails(save(as('bud'), 'bud', 's', cur, '{"a":2}', { folder: 'f2' }));
    await assertSucceeds(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
    assert.equal((await read('s')).folder, 'f1');
  });
  it('folder lama tanpa email pemilik: hanya pemiliknya yang bisa melengkapinya', async () => {
    await seed((db) => setDoc(doc(db, 'folders/old'), { name: 'Lama', parent: null, createdBy: 'ali', createdByName: 'Ali', createdAt: Timestamp.now() }));
    await assertFails(getDoc(doc(as('bud'), 'folders/old')));
    await assertSucceeds(updateDoc(doc(as('adm'), 'folders/old'), custom('ali', [], ['*'])));
    await assertFails(updateDoc(doc(as('bud'), 'folders/old'), { createdByEmail: BUD }));
    await assertFails(updateDoc(doc(as('ali'), 'folders/old'), { createdByEmail: BUD }));
    await assertSucceeds(updateDoc(doc(as('ali'), 'folders/old'), { createdByEmail: ALI }));
    await assertFails(updateDoc(doc(as('ali'), 'folders/old'), { createdByEmail: 'lain@ub.ac.id' }));
  });
});
describe('sedang diedit', () => {
  const mark = (db, sopId, u, patch = {}) =>
    setDoc(doc(db, 'editing', `${sopId}_${u}`), { sopId, uid: u, name: USERS[u].name, at: serverTimestamp(), ...patch });

  it('yang punya hak edit bisa menandai SOP dan melihat tanda orang lain', async () => {
    await given('ali', 's', 'public');
    await assertSucceeds(mark(as('bud'), 's', 'bud'));
    await assertSucceeds(getDocs(collection(as('ali'), 'editing')));
  });
  it('tanpa hak edit, ditolak', async () => {
    await given('ali', 's');
    await assertFails(mark(as('bud'), 's', 'bud'));
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', ['bud@ub.ac.id']));
    await assertFails(mark(as('bud'), 's', 'bud'));
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

  it('hanya admin yang bisa mengelola; anggota hanya bisa melihat daftar', async () => {
    await assertFails(add(as('ali'), 'baru@ub.ac.id', 'ali@ub.ac.id'));
    await assertFails(add(as('out'), 'out@ub.ac.id', 'out@ub.ac.id'));
    await assertSucceeds(getDocs(collection(as('ali'), 'members')));
    await assertFails(getDocs(collection(as('out'), 'members')));
    await assertSucceeds(add(as('adm'), 'baru@ub.ac.id', 'adm@ub.ac.id'));
    await assertSucceeds(getDocs(collection(as('adm'), 'members')));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'members/baru@ub.ac.id')));
  });
  it('anggota tidak bisa menaikkan perannya sendiri', async () => {
    await assertFails(updateDoc(doc(as('ali'), 'members/ali@ub.ac.id'), { role: 'admin' }));
  });
  it('hanya email @ub.ac.id atau @gmail.com huruf kecil yang bisa didaftarkan', async () => {
    for (const e of ['x@yahoo.com', 'x@student.ub.ac.id', 'X@ub.ac.id', 'X@gmail.com', 'x@ub.ac.id.evil.com', 'x@gmail.com.evil.com']) {
      await assertFails(add(as('adm'), e, 'adm@ub.ac.id'));
    }
    await assertSucceeds(add(as('adm'), 'baru@gmail.com', 'adm@ub.ac.id'));
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

describe('grup', () => {
  const BUD = 'bud@ub.ac.id';
  const join = (db, email, groups) => updateDoc(doc(db, 'members', email), { groups });

  it('hanya admin yang bisa membuat, mengubah, menghapus grup, dan mengatur anggotanya', async () => {
    await assertFails(setDoc(doc(as('ali'), 'groups/g1'), { name: 'Prodi' }));
    await assertSucceeds(setDoc(doc(as('adm'), 'groups/g1'), { name: 'Prodi' }));
    await assertSucceeds(getDocs(collection(as('ali'), 'groups')));
    await assertFails(getDocs(collection(as('out'), 'groups')));
    await assertFails(updateDoc(doc(as('ali'), 'groups/g1'), { name: 'Lain' }));
    await assertFails(join(as('ali'), 'ali@ub.ac.id', ['g1']));
    await assertFails(join(as('ali'), BUD, ['g1']));
    await assertSucceeds(join(as('adm'), BUD, ['g1']));
    await assertSucceeds(join(as('adm'), 'adm@ub.ac.id', ['g1']));
    await assertFails(updateDoc(doc(as('adm'), 'members/adm@ub.ac.id'), { role: 'member', groups: [] }));
    await assertSucceeds(updateDoc(doc(as('adm'), 'groups/g1'), { name: 'Lain' }));
    await assertFails(deleteDoc(doc(as('ali'), 'groups/g1')));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'groups/g1')));
  });
  it('nama dan id grup harus wajar', async () => {
    await assertFails(setDoc(doc(as('adm'), 'groups/g1'), { name: '' }));
    await assertFails(setDoc(doc(as('adm'), 'groups/g1'), { name: ' Prodi' }));
    await assertFails(setDoc(doc(as('adm'), 'groups/g1'), { name: 'Prodi', extra: 1 }));
    await assertFails(setDoc(doc(as('adm'), 'groups/*'), { name: 'Prodi' }));
    await assertFails(setDoc(doc(as('adm'), 'groups/x@ub.ac.id'), { name: 'Prodi' }));
  });
  it('hak yang diberikan ke grup berlaku untuk anggotanya saja, dan hilang saat dikeluarkan', async () => {
    await setDoc(doc(as('adm'), 'groups/g1'), { name: 'Prodi' });
    await join(as('adm'), BUD, ['g1']);
    const cur = await given('ali', 's');
    await updateDoc(doc(as('ali'), 'sops/s'), custom('ali', [], ['g1']));
    await assertSucceeds(getDoc(doc(as('bud'), 'sops/s')));
    await assertSucceeds(save(as('bud'), 'bud', 's', cur, '{"a":2}'));
    await assertFails(getDoc(doc(as('gml'), 'sops/s')));
    await join(as('adm'), BUD, []);
    await assertFails(getDoc(doc(as('bud'), 'sops/s')));
  });
  it('kueri daftar per grup: hanya untuk grup tempat akun ini berada', async () => {
    await setDoc(doc(as('adm'), 'groups/g1'), { name: 'Prodi' });
    await setDoc(doc(as('adm'), 'groups/g2'), { name: 'Lab' });
    await join(as('adm'), BUD, ['g1']);
    await given('ali', 's1');
    await given('ali', 's2');
    await updateDoc(doc(as('ali'), 'sops/s1'), custom('ali', ['g1']));
    await updateDoc(doc(as('ali'), 'sops/s2'), custom('ali', ['g2']));
    const live = where('deletedBy', '==', null);
    const ids = async (...w) => (await assertSucceeds(getDocs(query(collection(as('bud'), 'sops'), ...w)))).docs.map((d) => d.id);
    assert.deepEqual(await ids(live, where('readers', 'array-contains', 'g1')), ['s1']);
    assert.deepEqual(await ids(live, where('readers', 'array-contains-any', [BUD, '*', 'g1'])), ['s1']);
    await assertFails(getDocs(query(collection(as('bud'), 'sops'), live, where('readers', 'array-contains', 'g2'))));
  });
  it('folder yang dibagikan ke grup', async () => {
    await setDoc(doc(as('adm'), 'groups/g1'), { name: 'Prodi' });
    await join(as('adm'), BUD, ['g1']);
    await seed((db) => setDoc(doc(db, 'folders/f'), { name: 'F', parent: null, custom: true, readers: ['ali@ub.ac.id', 'g1'], editors: ['ali@ub.ac.id'], createdBy: 'ali', createdByName: 'Ali', createdByEmail: 'ali@ub.ac.id', createdAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(as('bud'), 'folders/f')));
    assert.equal((await assertSucceeds(getDocs(query(collection(as('bud'), 'folders'), where('readers', 'array-contains', 'g1'))))).size, 1);
    await assertFails(getDoc(doc(as('gml'), 'folders/f')));
  });
});

// ---------------------------------------------------------------------------
// RPS Editor: koleksi rps/rpsFolders/rpsEditing dan stats/rpsUsage memakai aturan yang sama dengan SOP,
// terpisah dari koleksi SOP. curricula: katalog CPL/CPMK per prodi.
// ---------------------------------------------------------------------------

const rpsUsage = (db) => doc(db, 'stats/rpsUsage');
function createRps(db, u, id, json = '{"r":1}', patch = {}, counter = rpsUsage) {
  const b = writeBatch(db);
  b.set(doc(db, 'rps', id), newSop(u, json, { title: 'RPS A', nomor: 'COM1', ...patch }));
  b.update(counter(db), { bytes: increment(bytes(json)), lastSop: id });
  return b.commit();
}
async function readRps(id) {
  let d;
  await seed(async (db) => (d = (await getDoc(doc(db, 'rps', id))).data()));
  return d;
}
function saveRps(db, u, id, cur, json) {
  const size = bytes(json);
  const b = writeBatch(db);
  b.set(doc(db, 'rps', id, 'versions', String(cur.rev)), {
    rev: cur.rev, title: cur.title, nomor: cur.nomor, json: cur.json, size: cur.size,
    savedAt: cur.updatedAt, savedBy: cur.updatedBy, savedByName: cur.updatedByName
  });
  b.update(doc(db, 'rps', id), { json, size, totalBytes: cur.totalBytes + size, rev: cur.rev + 1, updatedAt: serverTimestamp(), updatedBy: u, updatedByName: USERS[u].name });
  b.update(rpsUsage(db), { bytes: increment(size), lastSop: id });
  return b.commit();
}
const counters = async () => {
  let r;
  await seed(async (db) => (r = [(await getDoc(usage(db))).data().bytes, (await getDoc(rpsUsage(db))).data().bytes]));
  return r;
};

describe('RPS', () => {
  const BUD = 'bud@ub.ac.id';
  it('membuat, menyimpan, dan riwayat memakai penghitung RPS, bukan penghitung SOP', async () => {
    await assertSucceeds(createRps(as('ali'), 'ali', 'r'));
    const cur = await readRps('r');
    await assertSucceeds(saveRps(as('ali'), 'ali', 'r', cur, '{"r":22}'));
    assert.deepEqual(await counters(), [0, bytes('{"r":1}') + bytes('{"r":22}')]);
    await assertSucceeds(getDoc(doc(as('ali'), 'rps/r/versions/1')));
  });
  it('penghitung SOP tidak bisa dipakai untuk menulis RPS', async () => {
    await assertFails(createRps(as('ali'), 'ali', 'r', '{"r":1}', {}, usage));
  });
  it('hak akses: pribadi secara bawaan, bisa dibagikan, admin selalu bisa membaca', async () => {
    await createRps(as('ali'), 'ali', 'r');
    await assertFails(getDoc(doc(as('bud'), 'rps/r')));
    await assertSucceeds(getDoc(doc(as('adm'), 'rps/r')));
    await assertFails(getDoc(doc(as('out'), 'rps/r')));
    await assertSucceeds(updateDoc(doc(as('ali'), 'rps/r'), custom('ali', [], [BUD])));
    await assertSucceeds(saveRps(as('bud'), 'bud', 'r', await readRps('r'), '{"r":3}'));
    await assertFails(updateDoc(doc(as('bud'), 'rps/r'), custom('ali', [], [BUD, 'x@ub.ac.id'])));
  });
  it('folder RPS terpisah dari folder SOP', async () => {
    const folder = (u) => ({ name: 'F', parent: null, custom: false, readers: [USERS[u].email], editors: [USERS[u].email], createdBy: u, createdByName: USERS[u].name, createdByEmail: USERS[u].email, createdAt: serverTimestamp() });
    await assertSucceeds(setDoc(doc(as('ali'), 'rpsFolders/f'), folder('ali')));
    await assertSucceeds(createRps(as('ali'), 'ali', 'r', '{"r":1}', { folder: 'f' }));
    // Folder SOP dengan id yang sama tidak berlaku untuk RPS.
    await seed((db) => setDoc(doc(db, 'folders/g'), folder('ali')));
    await assertFails(createRps(as('bud'), 'bud', 'r2', '{"r":1}', { folder: 'g' }));
    await assertFails(getDoc(doc(as('bud'), 'rpsFolders/f')));
  });
  it('tanda "sedang diedit" hanya untuk RPS yang boleh diedit', async () => {
    await createRps(as('ali'), 'ali', 'r');
    const mark = (u, id, coll = 'rpsEditing') => setDoc(doc(as(u), coll, `${id}_${u}`), { sopId: id, uid: u, name: USERS[u].name, at: serverTimestamp() });
    await assertSucceeds(mark('ali', 'r'));
    await assertFails(mark('bud', 'r'));
    // Koleksi editing milik SOP tidak menerima id RPS.
    await assertFails(mark('ali', 'r', 'editing'));
  });
  it('kapasitas, recycle bin, dan hapus permanen', async () => {
    await assertSucceeds(getDoc(doc(as('ali'), 'stats/rpsCapacity')));
    await assertFails(getDoc(doc(as('ali'), 'stats/rpsUsage')));
    await createRps(as('ali'), 'ali', 'r');
    const cur = await readRps('r');
    await assertSucceeds(updateDoc(doc(as('ali'), 'rps/r'), { deletedAt: serverTimestamp(), deletedBy: 'ali' }));
    const db = as('ali');
    const b = writeBatch(db);
    b.delete(doc(db, 'rps', 'r'));
    b.update(rpsUsage(db), { bytes: increment(-cur.totalBytes), lastSop: 'r' });
    await assertSucceeds(b.commit());
    assert.deepEqual(await counters(), [0, 0]);
  });
  it('komentar RPS: pemegang hak lihat bisa berkomentar dan menyelesaikan; tanpa hak tidak bisa', async () => {
    await createRps(as('ali'), 'ali', 'r');
    await updateDoc(doc(as('ali'), 'rps/r'), custom('ali', [BUD]));
    const c = (u, patch = {}) => ({
      parent: null, anchor: null, label: 'Identitas', quote: '', text: 'Mohon dicek', by: u, byName: USERS[u].name, byEmail: USERS[u].email,
      at: serverTimestamp(), editedAt: null, resolved: false, resolvedBy: null, resolvedByName: null, resolvedAt: null, ...patch
    });
    const cd = (u, cid) => doc(as(u), 'rps', 'r', 'comments', cid);
    await assertSucceeds(setDoc(cd('bud', 'c1'), c('bud')));
    await assertSucceeds(setDoc(cd('ali', 'r1'), c('ali', { parent: 'c1', label: '', text: 'Baik' })));
    await assertSucceeds(getDocs(collection(as('bud'), 'rps', 'r', 'comments')));
    await assertSucceeds(updateDoc(cd('ali', 'c1'), { resolved: true, resolvedBy: 'ali', resolvedByName: USERS.ali.name, resolvedAt: serverTimestamp() }));
    await assertFails(setDoc(cd('gml', 'c2'), c('gml')));
    await assertFails(getDocs(collection(as('gml'), 'rps', 'r', 'comments')));
    await assertSucceeds(deleteDoc(cd('ali', 'r1')));
  });
  it('kunci edit RPS: hanya pemegang hak edit; selama berlaku hanya pemegang kunci yang menyimpan', async () => {
    await createRps(as('ali'), 'ali', 'r');
    await updateDoc(doc(as('ali'), 'rps/r'), custom('ali', [], [BUD]));
    const ld = (u, coll = 'rpsLocks') => doc(as(u), coll, 'r');
    const lock = (u, coll) => setDoc(ld(u, coll), { uid: u, name: USERS[u].name, at: serverTimestamp() });
    await assertFails(lock('gml'));
    await assertFails(lock('ali', 'locks')); // koleksi kunci SOP tidak menerima id RPS
    await assertSucceeds(lock('bud'));
    await assertFails(lock('ali'));
    await assertFails(saveRps(as('ali'), 'ali', 'r', await readRps('r'), '{"r":2}'));
    await assertSucceeds(saveRps(as('bud'), 'bud', 'r', await readRps('r'), '{"r":3}'));
    await assertFails(deleteDoc(ld('ali')));
    await assertSucceeds(deleteDoc(ld('bud')));
    await assertSucceeds(saveRps(as('ali'), 'ali', 'r', await readRps('r'), '{"r":4}'));
  });
});

describe('bawaan SOP baru', () => {
  const ref = (u) => doc(as(u), 'config/sop');
  const vals = (u, patch = {}) => ({
    institution: 'KEMENTERIAN\nFAKULTAS\nUNIVERSITAS', nomor: 'ABC/01/', disahkanJabatan: 'DEKAN', disahkanNama: 'Dr. Baru', disahkanNip: 'NIP. 1',
    updatedAt: serverTimestamp(), updatedBy: u, updatedByName: USERS[u].name, ...patch
  });
  it('admin bisa mengatur; anggota hanya membaca; bukan anggota tidak bisa membaca', async () => {
    await assertSucceeds(setDoc(ref('adm'), vals('adm')));
    await assertSucceeds(getDoc(ref('ali')));
    await assertFails(getDoc(ref('out')));
    await assertFails(setDoc(ref('ali'), vals('ali')));
    await assertFails(updateDoc(ref('ali'), { disahkanNama: 'X' }));
    await assertFails(deleteDoc(ref('ali')));
    await assertSucceeds(setDoc(ref('adm'), vals('adm', { disahkanNama: 'Dr. Lain' })));
  });
  it('isian divalidasi: kunci, tipe, panjang, dan pencatat', async () => {
    await assertFails(setDoc(ref('adm'), vals('adm', { extra: 1 })));
    await assertFails(setDoc(ref('adm'), vals('adm', { disahkanNama: 5 })));
    await assertFails(setDoc(ref('adm'), vals('adm', { nomor: 'x'.repeat(61) })));
    await assertFails(setDoc(ref('adm'), vals('adm', { updatedBy: 'ali' })));
    await assertFails(setDoc(ref('adm'), vals('adm', { updatedAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(doc(as('adm'), 'config/lain'), vals('adm')));
  });
});

describe('bawaan RPS baru', () => {
  const ref = (u) => doc(as(u), 'config/rps');
  const vals = (u, patch = {}) => ({
    universitas: 'UNIVERSITAS X', fakultas: 'FAKULTAS Y',
    updatedAt: serverTimestamp(), updatedBy: u, updatedByName: USERS[u].name, ...patch
  });
  it('admin bisa mengatur; anggota hanya membaca; bukan anggota tidak bisa membaca', async () => {
    await assertSucceeds(setDoc(ref('adm'), vals('adm')));
    await assertSucceeds(getDoc(ref('ali')));
    await assertFails(getDoc(ref('out')));
    await assertFails(setDoc(ref('ali'), vals('ali')));
    await assertFails(deleteDoc(ref('ali')));
    await assertSucceeds(deleteDoc(ref('adm')));
  });
  it('isian divalidasi: kunci, tipe, panjang, dan pencatat', async () => {
    await assertFails(setDoc(ref('adm'), vals('adm', { nomor: 'x' })));
    await assertFails(setDoc(ref('adm'), vals('adm', { fakultas: 5 })));
    await assertFails(setDoc(ref('adm'), vals('adm', { universitas: 'x'.repeat(201) })));
    await assertFails(setDoc(ref('adm'), vals('adm', { updatedBy: 'ali' })));
  });
});

describe('katalog kurikulum', () => {
  const cat = (u, patch = {}) => ({
    nama: 'Teknik Informatika', departemen: 'Teknik Informatika', managers: ['bud@ub.ac.id'], cpl: [], cpmk: [],
    updatedAt: serverTimestamp(), updatedBy: u, updatedByName: USERS[u].name, ...patch
  });
  it('hanya admin yang membuat dan menghapus prodi', async () => {
    await assertFails(setDoc(doc(as('ali'), 'curricula/tif'), cat('ali')));
    await assertSucceeds(setDoc(doc(as('adm'), 'curricula/tif'), cat('adm')));
    await assertFails(deleteDoc(doc(as('bud'), 'curricula/tif')));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'curricula/tif')));
  });
  it('semua anggota membaca; bukan anggota tidak', async () => {
    await setDoc(doc(as('adm'), 'curricula/tif'), cat('adm'));
    await assertSucceeds(getDoc(doc(as('ali'), 'curricula/tif')));
    await assertFails(getDoc(doc(as('out'), 'curricula/tif')));
  });
  it('pengelola prodi mengedit isi, tetapi tidak daftar pengelola; anggota lain tidak bisa mengedit', async () => {
    await setDoc(doc(as('adm'), 'curricula/tif'), cat('adm'));
    const cpl = [{ id: 'c1', kode: 'CPL01', teks: 'Lulusan …' }];
    await assertSucceeds(setDoc(doc(as('bud'), 'curricula/tif'), cat('bud', { cpl })));
    await assertFails(setDoc(doc(as('bud'), 'curricula/tif'), cat('bud', { cpl, managers: ['bud@ub.ac.id', 'ali@ub.ac.id'] })));
    await assertFails(setDoc(doc(as('ali'), 'curricula/tif'), cat('ali', { cpl })));
    await assertSucceeds(setDoc(doc(as('adm'), 'curricula/tif'), cat('adm', { managers: ['ali@ub.ac.id'] })));
    await assertSucceeds(setDoc(doc(as('ali'), 'curricula/tif'), cat('ali', { cpl, managers: ['ali@ub.ac.id'] })));
    await assertFails(setDoc(doc(as('bud'), 'curricula/tif'), cat('bud', { managers: ['ali@ub.ac.id'] })));
  });
  it('isi katalog divalidasi', async () => {
    await assertFails(setDoc(doc(as('adm'), 'curricula/tif'), cat('adm', { nama: '' })));
    await assertFails(setDoc(doc(as('adm'), 'curricula/tif'), cat('adm', { lain: 1 })));
    await assertFails(setDoc(doc(as('adm'), 'curricula/tif'), cat('adm', { updatedBy: 'ali' })));
  });
  it('daftar mata kuliah (mk) opsional, berupa list, paling banyak 300', async () => {
    await assertSucceeds(setDoc(doc(as('adm'), 'curricula/tif'), cat('adm', { mk: [{ id: 'm1', kode: 'IF101', nama: 'Algoritma' }] })));
    await assertFails(setDoc(doc(as('adm'), 'curricula/tif'), cat('adm', { mk: 'IF101' })));
    await assertFails(setDoc(doc(as('adm'), 'curricula/tif'), cat('adm', { mk: Array.from({ length: 301 }, (_, i) => ({ id: 'm' + i })) })));
  });
});
