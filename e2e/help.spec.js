import { test, expect, resetCloud, signIn, openLibrary, seedLocal, dialogs } from './helpers.js';

const tour = (page) => page.locator('dialog.tour[open]');

/** Menjalankan tur yang sedang terbuka sampai selesai; hasilnya judul setiap langkah. */
async function runTour(page) {
  const titles = [];
  const count = await tour(page).locator('.dots span').count();
  for (let k = 0; k < count; k++) {
    titles.push(await tour(page).locator('h2').textContent());
    await tour(page).locator('.next').click();
  }
  await expect(tour(page)).toHaveCount(0);
  return titles;
}

test.beforeEach(async ({ page }) => {
  await resetCloud();
  await signIn(page);
});

test('daftar pintasan dibuka dengan Ctrl+/ dan dari menu Bantuan', async ({ page }) => {
  const sc = page.locator('dialog[open]', { hasText: 'Pintasan keyboard' });
  await page.keyboard.press('Control+/');
  await expect(sc).toBeVisible();
  await expect(sc).toContainText('Simpan ke tempat terakhir');
  await expect(sc.locator('kbd', { hasText: 'Shift' }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sc).toHaveCount(0);

  await page.getByRole('button', { name: 'Bantuan' }).click();
  await page.getByRole('menuitem', { name: /Pintasan keyboard/ }).click();
  await expect(sc).toBeVisible();
  await sc.getByRole('button', { name: 'Tutup' }).click();
  await expect(sc).toHaveCount(0);
});

test('menu Ekspor: item terakhir tampil utuh', async ({ page }) => {
  await page.locator('.no-doc').getByRole('button', { name: 'Baru' }).click();
  await page.getByRole('button', { name: 'Ekspor' }).click();
  const last = page.getByRole('menuitem', { name: /Properti dokumen/ });
  const first = page.getByRole('menuitem', { name: /^PDF/ });
  const [a, b] = [await first.boundingBox(), await last.boundingBox()];
  expect(Math.abs(a.width - b.width)).toBeLessThan(1);
  expect(b.height).toBeGreaterThan(30);
});

test('tur singkat di Pustaka Lokal, Pustaka Daring, Asisten AI, dan Admin', async ({ page }) => {
  await seedLocal(page, [{ id: 'l1', name: 'SOP Lokal Satu' }]);
  const local = await openLibrary(page, 'Lokal');
  await local.getByRole('button', { name: 'Tur singkat Pustaka Lokal' }).click();
  const lt = await runTour(page);
  expect(lt).toEqual(expect.arrayContaining(['Pustaka Lokal', 'Cari', 'Daftar SOP', 'Tindakan per SOP']));
  // Tur di atas dialog Pustaka: menutup tur tidak menutup Pustaka.
  await expect(dialogs(page)).toHaveCount(1);

  const online = await openLibrary(page, 'Daring');
  await online.getByRole('button', { name: 'Tur singkat Pustaka Daring' }).click();
  await expect(tour(page)).toContainText('Pustaka Daring');
  await page.keyboard.press('ArrowRight');
  await expect(tour(page)).toContainText('Cari');
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
  await expect(dialogs(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialogs(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Asisten AI' }).click();
  const ai = dialogs(page).first();
  await ai.getByRole('button', { name: 'Tur singkat Asisten AI' }).click();
  const at = await runTour(page);
  expect(at).toEqual(['Asisten AI', 'Pilih jenis', '1. Uraikan', '2. Salin prompt', '3. Kirim ke AI', '4. Tempel jawaban', '5. Buka hasilnya']);
  await page.keyboard.press('Escape');
  await expect(dialogs(page)).toHaveCount(0);

  // Tur Admin membuka setiap halaman bergantian.
  await page.getByRole('button', { name: 'Admin' }).click();
  const adm = dialogs(page).first();
  await adm.getByRole('button', { name: 'Tur singkat Admin' }).click();
  await expect(tour(page)).toContainText('Admin');
  for (const [title, page_] of [['Halaman'], ['Bawaan SOP baru', 'Bawaan SOP baru'], ['Anggota', 'Anggota'], ['Grup', 'Grup'], ['Penyimpanan', 'Penyimpanan']]) {
    await tour(page).locator('.next').click();
    await expect(tour(page).locator('h2')).toHaveText(title);
    if (page_) await expect(adm.locator('nav [aria-current="page"]')).toHaveText(page_);
  }
  await tour(page).locator('.next').click();
  await expect(tour(page)).toHaveCount(0);
  await expect(adm).toBeVisible();
});
