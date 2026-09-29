import { mkdtempSync, rmSync } from 'node:fs';
import type http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { presetSettings, watchErrors } from './helpers';
import { buildOf, buildWeb, comeBack, restartWorker, servePages } from './producao';

/**
 * Deploy no meio da partida (bug de 28/09/2026: dois jogadores, cada um no seu celular, perderam
 * a partida quando o deploy saiu): o Worker reinicia duas vezes (código e segredos) e o
 * site ganha versão nova. Ninguém pode cair da mesa: reconecta, continua na partida, e a versão nova
 * só entra quando a pessoa sai da mesa.
 */

const PORT = 4181;
const BASE = `http://localhost:${PORT}`;
let dir = '';
let server: http.Server;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'fazquantas-deploy-'));
  server = await servePages(dir, PORT);
});

test.afterAll(() => {
  server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function person(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await presetSettings(page, {
    name,
    avatar: name === 'Ana' ? 'g-cuia' : 'g-capivara',
    profileKey: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
    speed: 'normal',
    rules: {
      hierarchy: 'gaucha',
      startingLives: 3,
      penalty: 'difference',
      tieRule: 'nobody',
      blindRound: 'off',
      dealerRestriction: true,
      dealerRestrictionInBlind: false,
      progression: 'up',
      restartOnElimination: true,
      maxCards: 3,
    },
  });
  return { ctx, page, errors };
}

/** Quem estiver na vez de cantar canta (o primeiro palpite permitido). */
async function singIfMyTurn(pages: Page[]) {
  for (const p of pages) {
    const bid = p.locator('section[aria-label="Teu palpite"] button:not([disabled])').first();
    if (await bid.isVisible().catch(() => false)) {
      await bid.click();
      return p;
    }
  }
  return null;
}

test('deploy no meio da partida: servidor reinicia duas vezes e o site atualiza; ninguém cai da mesa', async ({ browser }) => {
  test.setTimeout(300_000);
  buildWeb(dir, 'deploy-a');
  const ana = await person(browser, 'Ana');
  const beto = await person(browser, 'Beto');

  await ana.page.goto(BASE);
  await expect.poll(() => ana.page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 }).toBe(true);
  await ana.page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  await ana.page.getByRole('button', { name: 'Criar sala' }).click();
  const codeLabel = await ana.page.locator('div[aria-label^="Código "]').getAttribute('aria-label');
  const code = codeLabel!.replace('Código ', '').replace(/ /g, '');
  await beto.page.goto(`${BASE}/?sala=${code}`);
  await expect(ana.page.getByText(/Na mesa \(2\/8\)/)).toBeVisible();
  await expect.poll(() => beto.page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 }).toBe(true);
  await ana.page.getByRole('button', { name: 'Começar partida' }).click();
  for (const p of [ana.page, beto.page]) await expect(p.getByText('Rodada 1')).toBeVisible();

  // A primeira cantada.
  await expect.poll(async () => (await singIfMyTurn([ana.page, beto.page])) !== null, { timeout: 20_000 }).toBe(true);

  // O deploy: Worker reinicia (código), reinicia de novo (segredos), e o site ganha versão nova.
  const restore1 = restartWorker();
  await ana.page.waitForTimeout(2500);
  restore1();
  await ana.page.waitForTimeout(2500);
  buildWeb(dir, 'deploy-b');
  for (const p of [ana.page, beto.page]) await comeBack(p);

  // Durante 25 s ninguém pode ir para o início nem ver "sala não encontrada"; a mesa segue.
  const fim = Date.now() + 25_000;
  while (Date.now() < fim) {
    for (const [nome, p] of [['Ana', ana.page], ['Beto', beto.page]] as const) {
      const home = await p.getByRole('button', { name: 'Jogar com a gurizada' }).isVisible().catch(() => false);
      const perdida = await p.getByText(/Sala não encontrada|já acabou/).isVisible().catch(() => false);
      expect(home, `${nome} caiu para o início`).toBe(false);
      expect(perdida, `${nome} perdeu a sala`).toBe(false);
    }
    await singIfMyTurn([ana.page, beto.page]);
    await ana.page.waitForTimeout(500);
  }
  for (const p of [ana.page, beto.page]) {
    await expect(p.getByText(/Rodada \d/)).toBeVisible();
    await expect(p.getByText('Reconectando…')).toBeHidden({ timeout: 15_000 });
  }
  // A versão nova ainda não entrou no meio da partida.
  expect(await buildOf(ana.page)).toBe('deploy-a');

  for (const p of [ana, beto]) {
    expect(p.errors.filter((e) => !/WebSocket|ERR_CONNECTION|Failed to load resource/.test(e))).toEqual([]);
    await p.ctx.close();
  }
});
