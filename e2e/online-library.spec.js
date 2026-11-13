import { test, expect, resetCloud, signIn, seedLocal, openLibrary, top } from './helpers.js';

const rows = (pane) => pane.locator('.list > li');
const rowNames = (pane) => rows(pane).locator('.main strong').evaluateAll((els) => els.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
const copyDialog = (page) => page.getByRole('dialog', { name: 'Salin ke Pustaka Daring' });

test.beforeEach(async ({ page }) => {
  await resetCloud();
  await signIn(page);
});

test('salin folder Lokal beserta subfoldernya ke Pustaka Daring', async ({ page }) => {
  await seedLocal(page, [
    { id: 'a1', name: 'SOP Wisuda', folder: 'f-a', keterangan: 'Toga dibagikan di gedung rektorat' },
    { id: 's1', name: 'SOP Sidang', folder: 'f-s' },
    { id: 'u1', name: 'SOP Utama' }
  ], [
    { id: 'f-a', name: 'Akademik' },
    { id: 'f-s', name: 'Skripsi', parent: 'f-a' }
  ]);
  const local = await openLibrary(page);
  await local.getByRole('button', { name: 'Salin folder Akademik ke Pustaka Daring' }).click();
  const d = copyDialog(page);
  await expect(d).toContainText('2 SOP dari folder Akademik beserta subfoldernya');
  await d.getByRole('button', { name: 'Salin', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('2 SOP disalin ke Pustaka Daring (tingkat utama), 2 folder dibuat');

  const cloud = await openLibrary(page, 'Daring');
  await expect.poll(() => rowNames(cloud)).toEqual(['Akademik']);
  await rows(cloud).filter({ hasText: 'Akademik' }).locator('.main').click();
  await expect.poll(async () => (await rowNames(cloud)).sort()).toEqual(['SOP Wisuda', 'Skripsi']);
  await rows(cloud).filter({ hasText: 'Skripsi' }).locator('.main').click();
  await expect.poll(() => rowNames(cloud)).toEqual(['SOP Sidang']);

  // Salinan kedua ke tempat yang sama memakai folder yang sudah ada.
  const local2 = await openLibrary(page, 'Lokal');
  await local2.getByRole('button', { name: 'Salin folder Akademik ke Pustaka Daring' }).click();
  await copyDialog(page).getByRole('button', { name: 'Salin', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('2 SOP disalin ke Pustaka Daring (tingkat utama)');
  await expect(page.locator('.toast')).not.toContainText('folder dibuat');

  // Pencarian isi di Daring: cuplikan keterangan langkah.
  const cloud2 = await openLibrary(page, 'Daring');
  await cloud2.locator('input.search').fill('rektorat');
  await expect(cloud2.locator('.snip').first()).toContainText('Langkah 2 · keterangan:');
  await expect(cloud2.locator('.snip mark').first()).toHaveText('rektorat');

  // Pratinjau di Daring.
  const row = rows(cloud2).filter({ hasText: 'SOP Wisuda' }).first();
  await row.hover();
  await row.getByRole('button', { name: 'Pratinjau' }).click();
  await expect(top(page).locator('svg[aria-label="Halaman SOP"]').first()).toBeVisible();
  await expect(top(page)).toContainText('Folder Akademik');
  await top(page).getByRole('button', { name: 'Buka di tab' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('salin SOP terpilih ke folder Daring yang dipilih', async ({ page }) => {
  await seedLocal(page, [
    { id: 'a1', name: 'SOP Satu' },
    { id: 'b1', name: 'SOP Dua' }
  ]);
  await page.evaluate(async () => {
    const F = await import('/sop-editor/src/lib/faculty.svelte.js');
    await F.createFolder('Tujuan', null);
  });
  const local = await openLibrary(page);
  await local.locator('.selbar input.pick').click();
  await local.locator('.selbar').getByRole('button', { name: 'Salin ke Daring' }).click();
  await copyDialog(page).locator('select').selectOption({ label: 'Tujuan' });
  await copyDialog(page).getByRole('button', { name: 'Salin', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('2 SOP disalin ke Pustaka Daring (folder Tujuan)');
  const cloud = await openLibrary(page, 'Daring');
  await rows(cloud).filter({ hasText: 'Tujuan' }).locator('.main').click();
  await expect.poll(async () => (await rowNames(cloud)).sort()).toEqual(['SOP Dua', 'SOP Satu']);
});
