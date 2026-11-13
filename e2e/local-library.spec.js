import { unzipSync, zipSync, strToU8 } from 'fflate';
import fs from 'node:fs';
import { test, expect, resetCloud, signIn, seedLocal, resaveLocal, openLibrary, answer, download, top } from './helpers.js';

const names = (pane) =>
  pane.locator('.list li:not(.folder):not(.empty) .main strong').evaluateAll((els) => els.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
const binButton = (pane) => pane.locator('aside nav').getByRole('button', { name: /Baru dihapus/ });
const toRoot = (pane) => pane.locator('.tree .tname', { hasText: 'Utama' }).click();
const folderNames = (pane) => pane.locator('.list li.folder .main strong').allInnerTexts().then((l) => l.map((x) => x.trim()));

test.beforeEach(async ({ page }) => {
  await resetCloud();
  await signIn(page);
});

test('folder: buat, pindah lewat dialog dan seret, cari lintas folder', async ({ page }) => {
  await seedLocal(page, [
    { id: 'a1', name: 'SOP A' },
    { id: 'b1', name: 'SOP B' }
  ]);
  const pane = await openLibrary(page);

  await pane.getByRole('button', { name: 'Folder baru' }).click();
  await answer(page, 'Buat', 'Akademik');
  await expect.poll(() => folderNames(pane)).toEqual(['Akademik']);
  await expect(pane.locator('li.folder small')).toHaveText('Kosong');

  await pane.getByRole('button', { name: 'Pindahkan SOP A' }).click();
  await top(page).locator('select').selectOption({ label: '   Akademik' });
  await top(page).getByRole('button', { name: 'Pindahkan' }).click();
  await expect.poll(() => names(pane)).toEqual(['SOP B']);
  await expect(pane.locator('li.folder small')).toHaveText('1 SOP');

  await pane.locator('li.folder .main').click();
  await expect(pane.locator('.crumbs')).toContainText('Akademik');
  await pane.getByRole('button', { name: 'Folder baru' }).click();
  await answer(page, 'Buat', 'Skripsi');
  await pane.locator('.list li', { hasText: 'SOP A' }).dragTo(pane.locator('li.folder', { hasText: 'Skripsi' }));
  await expect.poll(() => names(pane)).toEqual([]);

  // Folder diseret ke jalur Utama, lalu dikembalikan lewat dialog (dirinya sendiri bukan tujuan).
  await pane.locator('li.folder', { hasText: 'Skripsi' }).dragTo(pane.locator('.crumbs button', { hasText: 'Utama' }));
  await expect.poll(() => folderNames(pane)).toEqual([]);
  await pane.locator('.crumbs button', { hasText: 'Utama' }).click();
  await expect.poll(async () => (await folderNames(pane)).sort()).toEqual(['Akademik', 'Skripsi']);
  await pane.getByRole('button', { name: 'Pindahkan folder Skripsi' }).click();
  const opts = await top(page).locator('select option').allInnerTexts();
  expect(opts.map((o) => o.trim())).not.toContain('Skripsi');
  await top(page).locator('select').selectOption({ label: '   Akademik' });
  await top(page).getByRole('button', { name: 'Pindahkan' }).click();
  await expect.poll(() => folderNames(pane)).toEqual(['Akademik']);

  await pane.locator('input.search').fill('SOP A');
  await expect(pane.locator('.list li', { hasText: 'SOP A' }).locator('small').first()).toContainText('di Akademik / Skripsi');
});

test('cadangan ZIP berjalur folder dan daftar induk berkolom Folder', async ({ page }) => {
  await seedLocal(page, [
    { id: 'a1', name: 'SOP A', folder: 'f-s' },
    { id: 'b1', name: 'SOP B' }
  ], [
    { id: 'f-a', name: 'Akademik' },
    { id: 'f-s', name: 'Skripsi', parent: 'f-a' }
  ]);
  const pane = await openLibrary(page);
  const all = await download(page, () => pane.getByRole('button', { name: 'Unduh cadangan (ZIP)' }).click());
  expect(Object.keys(unzipSync(new Uint8Array(all.buf))).sort()).toEqual(['Akademik/Skripsi/SOP A.sop', 'SOP B.sop']);
  const one = await download(page, () => pane.getByRole('button', { name: 'Unduh isi folder Akademik sebagai ZIP' }).click());
  expect(Object.keys(unzipSync(new Uint8Array(one.buf)))).toEqual(['Akademik/Skripsi/SOP A.sop']);
  const reg = await download(page, () => pane.getByRole('button', { name: 'Unduh daftar induk SOP (XLSX)' }).click());
  const sheet = new TextDecoder().decode(unzipSync(new Uint8Array(reg.buf))['xl/worksheets/sheet1.xml']);
  expect(sheet).toContain('Akademik / Skripsi');
});

test('pratinjau, Baru dihapus, hapus folder, dan pulihkan', async ({ page }) => {
  await seedLocal(page, [
    { id: 'a1', name: 'SOP A', folder: 'f-s' },
    { id: 'b1', name: 'SOP B' }
  ], [
    { id: 'f-a', name: 'Akademik' },
    { id: 'f-s', name: 'Skripsi', parent: 'f-a' }
  ]);
  const pane = await openLibrary(page);

  await pane.getByRole('button', { name: 'Pratinjau SOP B' }).click();
  await expect(top(page).locator('svg[aria-label="Halaman SOP"]').first()).toBeVisible();
  await top(page).getByRole('button', { name: 'Tutup', exact: true }).last().click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);

  await pane.locator('.list li', { hasText: 'SOP B' }).getByRole('button', { name: 'Hapus' }).click();
  await expect.poll(() => names(pane)).toEqual([]);
  await expect(binButton(pane).locator('small')).toHaveText('1');
  await binButton(pane).click();
  await expect(pane.locator('.list li small')).toContainText('terhapus permanen dalam 30 hari');
  await pane.getByRole('button', { name: 'Pulihkan' }).first().click();
  await toRoot(pane);
  await expect.poll(() => names(pane)).toEqual(['SOP B']);

  await pane.getByRole('button', { name: 'Hapus folder Akademik' }).click();
  await expect(top(page)).toContainText('1 SOP di dalamnya dipindahkan ke Baru dihapus');
  await answer(page, 'Hapus');
  await expect.poll(() => folderNames(pane)).toEqual([]);
  await expect(pane.locator('.tree')).not.toContainText('Akademik');
  await binButton(pane).click();
  await expect(pane.locator('.list li small')).toContainText('dari Akademik / Skripsi');
  await expect(pane.locator('.selbar')).toHaveCount(0);
  await pane.locator('.list li').first().locator('input.pick').click();
  await pane.locator('.selbar').getByRole('button', { name: 'Pulihkan' }).click();
  await toRoot(pane);
  await expect.poll(async () => (await names(pane)).sort()).toEqual(['SOP A', 'SOP B']);

  await pane.locator('.list li', { hasText: 'SOP A' }).getByRole('button', { name: 'Hapus' }).click();
  await binButton(pane).click();
  await pane.getByRole('button', { name: 'Kosongkan' }).click();
  await answer(page, 'Hapus permanen');
  await expect(pane.locator('.list li.empty')).toContainText('Tidak ada SOP yang baru dihapus');
});

test('tampilan seperti Pustaka Daring: pohon folder, label lewat filter, menu klik kanan, potong-tempel', async ({ page }) => {
  await seedLocal(page, [
    { id: 'a1', name: 'SOP A' },
    { id: 'b1', name: 'SOP B' }
  ], [{ id: 'f-k', name: 'Keuangan' }]);
  const pane = await openLibrary(page);
  await expect(pane.locator('aside .tree')).toContainText('Keuangan');

  // Label diatur dari tombol Label, lalu dipakai di filter.
  await pane.getByRole('button', { name: 'Label SOP A' }).click();
  await pane.getByRole('textbox', { name: 'Label baru' }).fill('Akademik');
  await pane.getByRole('button', { name: 'Tambah' }).click();
  await expect(pane.locator('.list li', { hasText: 'SOP A' }).locator('em')).toHaveText('Akademik');
  await pane.getByRole('button', { name: 'Filter' }).click();
  await pane.locator('.filters select').first().selectOption({ label: 'Akademik (1)' });
  await expect.poll(() => names(pane)).toEqual(['SOP A']);
  await pane.getByRole('button', { name: 'Hapus filter' }).click();
  await expect.poll(async () => (await names(pane)).sort()).toEqual(['SOP A', 'SOP B']);

  // Klik kanan → Potong, buka folder di pohon, Ctrl+V.
  await pane.locator('.list li', { hasText: 'SOP B' }).locator('.main').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Potong/ }).click();
  await pane.locator('.tree .tname', { hasText: 'Keuangan' }).click();
  await page.keyboard.press('Control+v');
  await expect.poll(() => names(pane)).toEqual(['SOP B']);
  await expect(pane.locator('.tree .tname', { hasText: 'Keuangan' }).locator('small')).toHaveText('1');

  // Ctrl+klik memilih tanpa membuka; bilah pilihan muncul.
  await toRoot(pane);
  await pane.locator('.list li', { hasText: 'SOP A' }).locator('.main').click({ modifiers: ['Control'] });
  await expect(pane.locator('.selbar')).toContainText('1 dipilih');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
});

test('ubah nama SOP (F2 dan tombol) lalu urungkan', async ({ page }) => {
  await seedLocal(page, [
    { id: 'a1', name: 'SOP A' },
    { id: 'b1', name: 'SOP B' }
  ]);
  const pane = await openLibrary(page);
  const undoBtn = page.locator('.toast').getByRole('button', { name: 'Urungkan' });

  // F2 pada baris yang ditandai.
  await pane.locator('.list li', { hasText: 'SOP B' }).locator('input.pick').click();
  await page.keyboard.press('F2');
  await answer(page, 'Simpan', 'SOP Beta');
  await expect.poll(async () => (await names(pane)).sort()).toEqual(['SOP A', 'SOP Beta']);
  await expect(page.locator('.toast')).toContainText('Nama SOP diubah menjadi "SOP Beta"');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await names(pane)).sort()).toEqual(['SOP A', 'SOP B']);

  // Lewat tombol baris; nama di dalam dokumen ikut berubah.
  await pane.getByRole('button', { name: 'Ubah nama SOP A' }).click();
  await answer(page, 'Simpan', 'SOP Alfa');
  await expect.poll(async () => (await names(pane)).sort()).toEqual(['SOP Alfa', 'SOP B']);
  const file = await download(page, () => pane.getByRole('button', { name: 'Unduh SOP Alfa sebagai berkas .sop' }).click());
  expect(JSON.parse(file.buf.toString()).header.namaSop).toBe('SOP Alfa');
  await pane.getByRole('button', { name: 'Ubah nama SOP Alfa' }).click();
  await answer(page, 'Simpan', 'SOP Alfa 2');
  await undoBtn.click();
  await expect.poll(async () => (await names(pane)).sort()).toEqual(['SOP Alfa', 'SOP B']);
});

test('urungkan hapus (Delete), pindah (seret ke pohon), dan hapus folder', async ({ page }) => {
  await seedLocal(page, [
    { id: 'a1', name: 'SOP A', folder: 'f-k' },
    { id: 'b1', name: 'SOP B' },
    { id: 'c1', name: 'SOP C' }
  ], [{ id: 'f-k', name: 'Keuangan' }]);
  const pane = await openLibrary(page);
  const undoBtn = page.locator('.toast').getByRole('button', { name: 'Urungkan' });

  // Delete pada baris yang ditandai → Baru dihapus → Urungkan.
  await pane.locator('.list li', { hasText: 'SOP B' }).locator('input.pick').click();
  await page.keyboard.press('Delete');
  await expect.poll(() => names(pane)).toEqual(['SOP C']);
  await expect(binButton(pane).locator('small')).toHaveText('1');
  await undoBtn.click();
  await expect.poll(async () => (await names(pane)).sort()).toEqual(['SOP B', 'SOP C']);
  await expect(binButton(pane).locator('small')).toHaveCount(0);

  // Seret ke folder di pohon → Ctrl+Z.
  await pane.locator('.list li', { hasText: 'SOP C' }).locator('.main').dragTo(pane.locator('.tree .tname', { hasText: 'Keuangan' }));
  await expect.poll(() => names(pane)).toEqual(['SOP B']);
  await expect(page.locator('.toast')).toContainText('1 item dipindahkan ke Keuangan');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await names(pane)).sort()).toEqual(['SOP B', 'SOP C']);

  // Hapus folder beserta isinya → Urungkan: folder dan SOP-nya kembali.
  await pane.getByRole('button', { name: 'Hapus folder Keuangan' }).click();
  await answer(page, 'Hapus');
  await expect.poll(() => folderNames(pane)).toEqual([]);
  await undoBtn.click();
  await expect.poll(() => folderNames(pane)).toEqual(['Keuangan']);
  await pane.locator('.tree .tname', { hasText: 'Keuangan' }).click();
  await expect.poll(() => names(pane)).toEqual(['SOP A']);
  await expect(binButton(pane).locator('small')).toHaveCount(0);
});

test('impor ZIP: folder di dalam ZIP ikut dibuat', async ({ page }, info) => {
  await seedLocal(page, [{ id: 'b1', name: 'SOP B' }]);
  const pane = await openLibrary(page);
  const one = await download(page, () => pane.getByRole('button', { name: 'Unduh SOP B sebagai berkas .sop' }).click());
  const base = JSON.parse(one.buf.toString());
  const sop = (name) => strToU8(JSON.stringify({ ...base, header: { ...base.header, namaSop: name } }));
  const file = info.outputPath('impor.zip');
  fs.writeFileSync(file, zipSync({ 'Keuangan/Kas/SOP Kas.sop': sop('SOP Kas'), 'SOP Akar.sop': sop('SOP Akar') }));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), pane.getByRole('button', { name: 'Impor berkas .sop atau .zip' }).click()]);
  await chooser.setFiles(file);
  await expect(top(page)).toContainText('Folder di dalam ZIP ikut dibuat');
  await answer(page, 'Impor');
  await expect.poll(() => folderNames(pane)).toEqual(['Keuangan']);
  expect(await names(pane)).toContain('SOP Akar');
});

test('pencarian isi menampilkan cuplikan tempat kata ditemukan', async ({ page }) => {
  await seedLocal(page, [
    { id: 'a1', name: 'SOP Yudisium', steps: ['Mahasiswa mengajukan berkas'], keterangan: 'Berkas diverifikasi oleh bagian akademik sebelum rapat yudisium' },
    { id: 'b1', name: 'SOP Cuti' }
  ]);
  const pane = await openLibrary(page);
  await pane.locator('input.search').fill('diverifikasi akademik');
  await expect.poll(() => names(pane)).toEqual(['SOP Yudisium']);
  const snip = pane.locator('.snip');
  await expect(snip).toContainText('Langkah 2 · keterangan:');
  await expect(snip.locator('mark')).toHaveText(['diverifikasi', 'akademik']);
  // Cocok di nama saja: tanpa cuplikan.
  await pane.locator('input.search').fill('cuti');
  await expect.poll(() => names(pane)).toEqual(['SOP Cuti']);
  await expect(pane.locator('.snip')).toHaveCount(0);
});

test('riwayat versi: bandingkan, kembalikan, dan muat ke tab yang terbuka', async ({ page }) => {
  await seedLocal(page, [{ id: 'a1', name: 'SOP Versi', steps: ['Isi pertama'] }]);
  await resaveLocal(page, 'a1', { kegiatan: 'Isi kedua' });
  await resaveLocal(page, 'a1', { kegiatan: 'Isi ketiga' });
  const pane = await openLibrary(page);

  await pane.getByRole('button', { name: 'Riwayat SOP Versi' }).click();
  const hist = pane.locator('.history');
  await expect(hist.locator('.hhead')).toContainText('2 versi lama');

  await hist.getByRole('button', { name: 'Bandingkan versi…' }).click();
  await expect(top(page)).toContainText('Isi kedua');
  await expect(top(page)).toContainText('Isi ketiga');
  await page.keyboard.press('Escape');

  // Versi tertua dikembalikan: isi ketiga masuk riwayat.
  await hist.getByRole('button', { name: /^Kembalikan versi/ }).last().click();
  await answer(page, 'Kembalikan');
  await expect(hist.locator('.hhead')).toContainText('3 versi lama');
  await pane.locator('input.search').fill('pertama');
  await expect.poll(() => names(pane)).toEqual(['SOP Versi']);
  await pane.locator('input.search').fill('');

  // SOP dibuka di tab: versi lama dimuat ke tab sebagai perubahan yang belum disimpan.
  await pane.locator('.list li', { hasText: 'SOP Versi' }).locator('.main').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const pane2 = await openLibrary(page);
  await pane2.getByRole('button', { name: 'Riwayat SOP Versi' }).click();
  await pane2.locator('.history').getByRole('button', { name: /^Kembalikan versi/ }).first().click();
  await answer(page, 'Muat ke tab');
  await expect(page.locator('.toast')).toContainText('Simpan ke Pustaka Lokal untuk menerapkannya');

  // Hapus satu versi.
  const pane3 = await openLibrary(page);
  await pane3.getByRole('button', { name: 'Riwayat SOP Versi' }).click();
  await pane3.locator('.history').getByRole('button', { name: /^Hapus versi/ }).first().click();
  await answer(page, 'Hapus');
  await expect(pane3.locator('.history .hhead')).toContainText('2 versi lama');
});
