import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// `--mode native` gera o build do Capacitor (sem service worker: os assets já vão no app).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    mode !== 'native' &&
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        includeAssets: ['icon.svg', 'sounds/*'],
        manifest: {
          name: 'Fodinha',
          short_name: 'Fodinha',
          description: 'Fodinha com baralho espanhol: diga quantas faz e faça quantas disse.',
          lang: 'pt-BR',
          theme_color: '#2a1a10',
          background_color: '#2a1a10',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3,wav}'],
          navigateFallbackDenylist: [/^\/socket\.io/, /^\/health/],
        },
      }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
}));
