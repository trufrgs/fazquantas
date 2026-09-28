import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { presetSettings } from './helpers';

/**
 * Versão nova chegando numa aba que ficou aberta (o problema do service worker preso na versão
 * antiga): publica o build A, abre a aba, publica o B por cima e a aba passa sozinha para o B. No
 * meio de uma partida ela não recarrega; só quando a pessoa sai da mesa.
 *
 * Gera três builds de produção do web (uns 20 s cada) e serve como o Cloudflare Pages: arquivos do
 * build, index.html para as rotas do app, sw.js/index.html/version.json sem cache.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4180;
const BASE = `http://localhost:${PORT}`;
let dir = '';
let server: http.Server;

function build(id: string) {
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

/** Build que a aba está rodando ('' enquanto recarrega). */
async function buildOf(page: Page) {
  return page.evaluate(() => document.documentElement.dataset.build ?? '').catch(() => '');
}

/** A aba "volta para a frente" (é quando o app confere se tem versão nova). */
async function comeBack(page: Page) {
  await page.evaluate(() => {
    for (const state of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'fazquantas-atualizacao-'));
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', BASE);
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
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
});

test.afterAll(() => {
  server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('aba aberta passa sozinha para a versão nova; no meio da partida espera sair da mesa', async ({ page }) => {
  test.setTimeout(300_000);
  await presetSettings(page, { name: 'Ana' });
  build('versao-a');
  await page.goto(BASE);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 }).toBe(true);
  expect(await buildOf(page)).toBe('versao-a');

  // Publica a B por cima (a A some do servidor, como no Pages) e a aba volta para a frente.
  build('versao-b');
  await comeBack(page);
  await expect.poll(() => buildOf(page), { timeout: 60_000 }).toBe('versao-b');
  await expect(page.getByRole('button', { name: 'Jogar contra bots' })).toBeVisible();

  // No meio da partida, a versão C espera: a mesa não recarrega na cara de ninguém.
  await page.getByRole('button', { name: 'Jogar contra bots' }).click();
  await expect(page.getByText(/Rodada \d/)).toBeVisible();
  build('versao-c');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(8000);
  expect(await buildOf(page)).toBe('versao-b');
  await expect(page.getByText(/Rodada \d/)).toBeVisible();

  // Saiu da mesa: agora sim, versão C.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect.poll(() => buildOf(page), { timeout: 60_000 }).toBe('versao-c');
});
