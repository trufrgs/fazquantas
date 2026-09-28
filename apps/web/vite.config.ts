import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

/** No build nativo não há PWA: o registro do service worker vira um no-op. */
const nativePwaStub = {
  name: 'fodinha-native-pwa-stub',
  resolveId: (id: string) => (id === 'virtual:pwa-register' ? '\0pwa-stub' : null),
  load: (id: string) => (id === '\0pwa-stub' ? 'export function registerSW() { return () => undefined; }' : null),
};

// `--mode native` gera o build do Capacitor (sem service worker: os assets já vão no app).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'native' && nativePwaStub,
    tailwindcss(),
    mode !== 'native' &&
      VitePWA({
        // Atualização silenciosa: a versão nova entra na próxima abertura (não recarrega no meio da partida).
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['icon.svg', 'sounds/*', 'cards/*'],
        manifest: {
          name: 'Faz quantas?',
          short_name: 'Faz quantas?',
          description: 'Fodinha com baralho espanhol e regra gaúcha: diz quantas faz, faz quantas disse.',
          lang: 'pt-BR',
          theme_color: '#2a1a10',
          background_color: '#2a1a10',
          display: 'standalone',
          orientation: 'any',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,mp3,wav}'],
          // Só o subconjunto latino das fontes vai para o cache offline.
          globIgnores: ['**/*-cyrillic*', '**/*-vietnamese*', '**/*-greek*', '**/*-latin-ext*'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api\//],
          // Tocar na notificação traz o jogo para a frente; push do servidor vira notificação.
          importScripts: ['sw-avisos.js'],
        },
      }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
}));
