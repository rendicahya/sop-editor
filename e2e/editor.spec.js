import { test, expect, resetCloud, signIn, seedLocal, openLibrary, top } from './helpers.js';

test('belum masuk: aplikasi menampilkan gerbang masuk', async ({ page }) => {
  await resetCloud();
  await page.goto('');
  await expect(page.getByRole('button', { name: 'Masuk dengan Google' }).first()).toBeVisible();
});

test('pemeriksaan kelengkapan sebelum ekspor PDF', async ({ page }) => {
  await resetCloud();
  await signIn(page);
  await seedLocal(page, [{ id: 'a1', name: 'SOP Ekspor' }]);
  const pane = await openLibrary(page);
  await pane.locator('.list li', { hasText: 'SOP Ekspor' }).locator('.main').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  await page.keyboard.press('Control+Shift+P');
  await expect(top(page)).toContainText('Dokumen belum lengkap');
  await top(page).getByRole('button', { name: 'Perbaiki dulu' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Periksa/ }).first()).toHaveClass(/\bon\b/);

  await page.keyboard.press('Control+Shift+P');
  await top(page).getByRole('button', { name: 'Tetap ekspor' }).click();
  await expect(page.locator('dialog[open]', { hasText: 'Pratinjau PDF' })).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  // Temuan yang sama tidak ditanyakan lagi.
  await page.keyboard.press('Control+Shift+P');
  await expect(page.locator('dialog[open]', { hasText: 'Pratinjau PDF' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('dialog[open]', { hasText: 'Dokumen belum lengkap' })).toHaveCount(0);
});
