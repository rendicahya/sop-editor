// Uji ujung-ke-ujung: browser sungguhan terhadap server Vite dengan emulator Auth dan Firestore.
// Jalankan lewat `npm run test:e2e` (emulator dinyalakan otomatis). Emulator berbagi data, jadi uji berjalan berurutan.
import { defineConfig } from '@playwright/test';
import path from 'node:path';

const PORT = 4191;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/sop-editor/`,
    viewport: { width: 1500, height: 1000 },
    acceptDownloads: true,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: path.resolve(import.meta.dirname, '..'),
    url: `http://localhost:${PORT}/sop-editor/`,
    env: { VITE_FIREBASE_EMULATOR: '1' },
    reuseExistingServer: false, // server lain di port ini mungkin tanpa mode emulator
    timeout: 60_000
  }
});
