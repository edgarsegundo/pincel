import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  workers: 1,
  use: { locale: 'pt-BR', baseURL: 'http://localhost:5199', viewport: { width: 1280, height: 800 }, acceptDownloads: true },
  webServer: { command: 'npx vite --port 5199 --strictPort', url: 'http://localhost:5199', reuseExistingServer: true },
});
