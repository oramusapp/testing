import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Build output goes to the repository root so the static PWA is served straight from the
// repo (e.g. GitHub Pages: https://<owner>.github.io/<repo>/). scripts/clean.mjs removes the old build first. Relative base keeps it
// portable between hosting paths and the Capacitor (iOS) wrapper.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: process.env.CAP_BUILD ? 'dist' : '..', emptyOutDir: !!process.env.CAP_BUILD, chunkSizeWarningLimit: 4000 },
  worker: { format: 'es' },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Oramus',
        short_name: 'Oramus',
        description: 'SDCA · RSPS · Notatnik · Excel',
        lang: 'pl',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        globIgnores: ['oramus/**', '**/node_modules/**']
      }
    })
  ],
  test: { environment: 'node' }
} as any);
