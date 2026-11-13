import { test, expect, resetCloud, signIn } from './helpers.js';

test.use({ tour: true });

const tour = (page) => page.locator('dialog.tour[open]');
const openTour = async (page) => {
  await page.getByRole('button', { name: 'Bantuan' }).click();
  await page.getByRole('menuitem', { name: /Tur pengenalan/ }).click();
};

test.beforeEach(async ({ page }) => {
  await resetCloud();
  await signIn(page);
});

test('tur muncul sekali untuk pengguna baru dan bisa dibuka lagi', async ({ page }) => {
  await expect(tour(page)).toContainText('Selamat datang di SOP Editor');
  await tour(page).getByRole('button', { name: 'Mulai' }).click();
  // Pengguna baru belum punya SOP terbuka: langkah halaman diganti ajakan memulai.
  await expect(tour(page)).toContainText('Mulai SOP pertama Anda');
  await expect(tour(page).locator('.spot')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(tour(page)).not.toContainText('Mulai SOP pertama');
  await tour(page).getByRole('button', { name: 'Kembali' }).click();
  await expect(tour(page)).toContainText('Mulai SOP pertama Anda');
  await tour(page).getByRole('button', { name: 'Lewati tur' }).click();
  await expect(tour(page)).toHaveCount(0);

  // Dilewati berarti tidak muncul lagi saat dimuat ulang.
  await page.reload();
  await page.getByRole('button', { name: 'Bantuan' }).waitFor();
  await page.waitForTimeout(1500);
  await expect(tour(page)).toHaveCount(0);

  // Dibuka lagi dari tombol dengan SOP terbuka, sampai selesai.
  await page.locator('.no-doc').getByRole('button', { name: 'Baru' }).click();
  await openTour(page);
  await expect(tour(page)).toContainText('Selamat datang');
  await tour(page).locator('.next').click();
  await expect(tour(page)).toContainText('Ketik langsung di halaman');
  await tour(page).getByRole('button', { name: 'Kembali' }).click();
  const count = await tour(page).locator('.dots span').count();
  for (let k = 1; k < count; k++) await tour(page).locator('.next').click();
  await expect(tour(page)).toContainText('Bantuan');
  await expect(tour(page).locator('.next')).toHaveText('Selesai');
  await tour(page).locator('.next').click();
  await expect(tour(page)).toHaveCount(0);

  // Esc juga menutup tur.
  await openTour(page);
  await expect(tour(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
});
