import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };

/** Commit do build (na CI vem do GITHUB_SHA); sem git, a hora do build. */
function buildId(): string {
  if (process.env.VITE_BUILD_ID) return process.env.VITE_BUILD_ID;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return String(Date.now());
  }
}
const BUILD_ID = buildId();

/** `version.json` com o build publicado: o app compara com o dele para saber se ficou para trás. */
const versionFile = {
  name: 'fodinha-version-json',
  apply: 'build' as const,
  generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) + '\n' });
  },
};

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
    mode !== 'native' && versionFile,
    mode === 'native' && nativePwaStub,
    tailwindcss(),
    mode !== 'native' &&
      VitePWA({
        // O service worker novo assume na hora (skipWaiting/clientsClaim abaixo) e a página recarrega
        // sozinha fora da mesa (lib/atualizacao.ts). "prompt" aqui só evita o recarregar automático
        // do plugin, que cairia no meio da partida.
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['icon.svg', 'sounds/*', 'cards/*'],
        manifest: {
          // Identidade do app instalado: não muda se o endereço de início mudar.
          id: '/',
          name: 'Faz quantas?',
          short_name: 'Faz quantas?',
          categories: ['games'],
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
          // Sem .json: o version.json nunca vem do cache (é ele que diz se a aba ficou para trás).
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,mp3,wav}'],
          // Só o subconjunto latino das fontes vai para o cache offline.
          // A música de fundo (2 MB) fica fora do cache do aplicativo: vem do servidor quando toca.
          globIgnores: ['**/*-cyrillic*', '**/*-vietnamese*', '**/*-greek*', '**/*-latin-ext*', '**/music/**'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api\//, /^\/privacidade/],
          // Tocar na notificação traz o jogo para a frente; push do servidor vira notificação.
          importScripts: ['sw-avisos.js'],
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
        },
      }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
}));
