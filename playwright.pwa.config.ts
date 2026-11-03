import { defineConfig } from '@playwright/test';

// Verifica o PWA no build de produção (o service worker não existe no modo dev).
export default defineConfig({
  testDir: 'e2e-pwa',
  timeout: 30_000,
  use: { locale: 'pt-BR', baseURL: 'http://localhost:4199', serviceWorkers: 'allow' },
  webServer: { command: 'npx vite preview --port 4199 --strictPort', url: 'http://localhost:4199', reuseExistingServer: true },
});
