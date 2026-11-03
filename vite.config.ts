import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { jevDevProxy } from './server/vite-plugin.ts';

// React API roda em Preact (alias feito pelo preset). Para voltar ao React,
// troque o preset por @vitejs/plugin-react e instale react/react-dom.
export default defineConfig(({ mode }) => ({
  plugins: [
    preact(),
    jevDevProxy(mode),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,svg,png}'] },
      manifest: {
        name: 'Pincel',
        short_name: 'Pincel',
        description: 'Whiteboard hands-free: desenhe, o Pincel endireita.',
        lang: 'pt-BR',
        display: 'standalone',
        background_color: '#fafaf9',
        theme_color: '#fafaf9',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
}));
