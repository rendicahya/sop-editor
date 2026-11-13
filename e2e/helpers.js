// Alat bantu bersama untuk uji ujung-ke-ujung.
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';

export { expect };
export const PROJECT = 'demo-sop-editor';
const FIRESTORE = `http://127.0.0.1:8181`;
const AUTH = `http://127.0.0.1:9199`;
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/`;

/** `page` yang gagal bila ada galat JavaScript di halaman. */
export const test = base.extend({
  // Tur pengenalan otomatis hanya untuk uji tur (test.use({ tour: true })).
  tour: [false, { option: true }],
  page: async ({ page, tour }, use) => {
    if (!tour) await page.addInitScript(() => localStorage.setItem('sop-editor:tourDone', '1'));
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    expect(errors, 'galat di halaman').toEqual([]);
  }
});

/** Menulis dokumen Firestore dengan hak penuh (melewati aturan). `fields` memakai format REST. */
export async function seed(path, fields) {
  const r = await fetch(DOCS + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields })
  });
  if (!r.ok) throw new Error(`seed ${path}: ${await r.text()}`);
}

/** Emulator dikosongkan, lalu diisi admin adm@ub.ac.id dan penghitung penyimpanan. */
export async function resetCloud(members = { 'adm@ub.ac.id': 'admin' }) {
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  for (const [email, role] of Object.entries(members)) await seed(`members/${email}`, { role: { stringValue: role } });
  await seed('stats/usage', { bytes: { integerValue: 0 }, limit: { integerValue: 100000000 }, lastSop: { stringValue: '' } });
}

/** Membuka aplikasi lalu masuk lewat emulator Auth. */
export async function signIn(page, email = 'adm@ub.ac.id', name = 'Admin Fakultas') {
  await page.goto('');
  await page.waitForFunction(() => window.__facultyLogin);
  await page.getByRole('button', { name: 'Masuk dengan Google' }).first().waitFor();
  await page.evaluate(([e, n]) => window.__facultyLogin(e, n), [email, name]);
  await page.locator('.signin-gate').waitFor({ state: 'detached' });
}

/**
 * Mengisi Pustaka Lokal langsung lewat modul aplikasi. items: [{ id, name, folder?, steps?: [kegiatan, ...], keterangan? }],
 * folders: [{ id, name, parent? }].
 */
export async function seedLocal(page, items, folders = []) {
  await page.evaluate(
    async ([items, folders]) => {
      const L = await import('/sop-editor/src/lib/library.js');
      const M = await import('/sop-editor/src/lib/model.js');
      const t = Date.now() - 100000;
      for (const f of folders) await L.putFolder({ parent: null, created: t, ...f });
      for (const it of items) {
        const d = M.emptyDocument();
        d.header.namaSop = it.name;
        d.header.nomor = it.nomor ?? `N-${it.id}`;
        if (it.steps) for (const k of it.steps) d.steps.splice(d.steps.length - 1, 0, { ...M.newStep(d.actors[0].id), kegiatan: k });
        if (it.keterangan) d.steps[1].keterangan = it.keterangan;
        await L.putEntry({ id: it.id, title: it.name, nomor: d.header.nomor, fileName: null, created: t, updated: t, json: JSON.stringify(d), tags: [], folder: it.folder ?? null });
      }
    },
    [items, folders]
  );
}

/** Menyimpan ulang entri Lokal `id` dengan perubahan `fn(doc)`, sama seperti Ctrl+S dari tabnya. */
export async function resaveLocal(page, id, change) {
  await page.evaluate(
    async ([id, change]) => {
      const L = await import('/sop-editor/src/lib/library.js');
      const e = await L.getEntry(id);
      const d = JSON.parse(e.json);
      Object.assign(d.header, change.header ?? {});
      if (change.kegiatan) d.steps[1].kegiatan = change.kegiatan;
      await new Promise((r) => setTimeout(r, 5)); // waktu simpan berbeda dari versi sebelumnya
      await L.saveDoc(id, JSON.stringify(d), null);
    },
    [id, change]
  );
}

export const dialogs = (page) => page.locator('dialog[open]');
/** Dialog yang paling atas (mis. konfirmasi di atas dialog Pustaka). */
export const top = (page) => page.locator('dialog[open]').last();

/** Membuka dialog Pustaka pada tab 'Lokal' atau 'Daring'; hasilnya panel tab itu. */
export async function openLibrary(page, tab = 'Lokal') {
  if (!(await dialogs(page).count())) await page.getByRole('button', { name: 'Pustaka' }).first().click();
  await dialogs(page).first().locator('[role=tab]:visible', { hasText: tab }).click();
  const pane = dialogs(page).first().locator(`[data-pane="${tab === 'Lokal' ? 'local' : 'faculty'}"]`);
  await pane.waitFor();
  return pane;
}

/** Menjawab dialog ui.prompt/confirm yang sedang tampil. */
export async function answer(page, ok, value) {
  const d = page.locator('dialog.ask[open]');
  await d.waitFor();
  if (value != null) await d.locator('input').fill(value);
  await d.getByRole('button', { name: ok, exact: true }).click();
  await d.waitFor({ state: 'hidden' });
}

/** Menunggu unduhan dari `fn` lalu mengembalikan { name, buf }. */
export async function download(page, fn) {
  const [d] = await Promise.all([page.waitForEvent('download'), fn()]);
  return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) };
}
