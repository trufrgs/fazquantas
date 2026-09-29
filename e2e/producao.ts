import { execFileSync } from 'node:child_process';
import { appendFileSync, createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

/**
 * Auxiliares para testar como a produção se comporta: build de produção do web (com service worker)
 * servido como o Cloudflare Pages, e o "deploy" do Worker (o wrangler dev recarrega e reinicia os
 * Durable Objects quando o código muda).
 */

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Build de produção do web em `dir`, com a identidade `id` (vira o `version.json`). */
export function buildWeb(dir: string, id: string) {
  execFileSync('pnpm', ['--filter', '@fodinha/web', 'exec', 'vite', 'build', '--outDir', dir, '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, VITE_BUILD_ID: id, VITE_SERVER_URL: 'http://localhost:8787' },
    stdio: 'ignore',
  });
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/vnd.microsoft.icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

/** Serve `dir` como o Pages: arquivos do build, index.html nas rotas do app, cache igual ao `_headers`. */
export function servePages(dir: string, port: number): Promise<http.Server> {
  const base = `http://localhost:${port}`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', base);
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dir, 'index.html');
    const name = path.basename(file);
    const cache =
      name === 'sw.js' || name === 'index.html' || name.startsWith('workbox-')
        ? 'no-cache'
        : name === 'version.json'
          ? 'no-store'
          : url.pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=0, must-revalidate';
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/** Build que a aba está rodando ('' enquanto recarrega). */
export async function buildOf(page: Page) {
  return page.evaluate(() => document.documentElement.dataset.build ?? '').catch(() => '');
}

/** A aba "volta para a frente" (é quando o app confere se tem versão nova). */
export async function comeBack(page: Page) {
  await page
    .evaluate(() => {
      for (const state of ['hidden', 'visible']) {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
        document.dispatchEvent(new Event('visibilitychange'));
      }
    })
    .catch(() => undefined);
}

/** "Deploy" do Worker: muda o código e o wrangler dev reinicia os Durable Objects (como em produção). */
export function restartWorker() {
  const file = path.join(ROOT, 'apps/worker/src/index.ts');
  const original = readFileSync(file, 'utf8');
  appendFileSync(file, `\n// reinício de teste ${Date.now()}\n`);
  return () => writeFileSync(file, original);
}
