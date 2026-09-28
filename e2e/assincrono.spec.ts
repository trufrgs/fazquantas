import { expect, test, type Browser } from '@playwright/test';
import { playUntilGameOver, presetSettings, watchErrors } from './helpers';

/**
 * Sala "cada um no seu tempo": Beto larga a mesa no meio da partida ("Voltar depois"), a vez dele
 * espera, o início mostra "Tua vez na sala" e ele volta para o mesmo lugar e termina a partida.
 */

function freshKey(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
}

async function person(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await presetSettings(page, {
    name,
    avatar: name.toLowerCase(),
    profileKey: freshKey(),
    rules: {
      hierarchy: 'gaucha',
      startingLives: 1,
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

test('assíncrona: larga a mesa, a vez espera, "Tua vez na sala" no início e volta pro mesmo lugar', async ({ browser }) => {
  test.setTimeout(300_000);
  const ana = await person(browser, 'Ana');
  const beto = await person(browser, 'Beto');

  await ana.page.goto('/');
  await ana.page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  await ana.page.getByRole('button', { name: 'Criar sala' }).click();
  // Um seletor só: a primeira linha é jogar junto (1 min é o padrão), a segunda cada um no seu tempo.
  const tempo = ana.page.getByRole('radiogroup', { name: 'Tempo por jogada' });
  await expect(tempo.getByRole('radio', { name: '1 min' })).toHaveAttribute('aria-checked', 'true');
  for (const t of ['30 s', '2 min', '3 min', '5 min', '1 h', '6 h', 'Sem limite']) await expect(tempo.getByRole('radio', { name: t })).toBeVisible();
  await tempo.getByRole('radio', { name: '12 h' }).click();
  await expect(tempo.getByRole('radio', { name: '12 h' })).toHaveAttribute('aria-checked', 'true');
  const codeLabel = await ana.page.locator('div[aria-label^="Código "]').getAttribute('aria-label');
  const code = codeLabel!.replace('Código ', '').replace(/ /g, '');

  await beto.page.goto(`/?sala=${code}`);
  await expect(beto.page.getByText(/12 h por jogada · cada um no seu tempo/)).toBeVisible();
  await ana.page.getByRole('button', { name: 'Começar partida' }).click();
  await expect(beto.page.getByText('Rodada 1')).toBeVisible();

  // Beto larga a mesa sem sair da sala.
  await beto.page.getByRole('button', { name: 'Menu' }).click();
  await beto.page.getByRole('button', { name: 'Voltar depois' }).click();
  await expect(beto.page.getByRole('button', { name: 'Jogar com a gurizada' })).toBeVisible();

  // Ana joga; quando chega a vez do Beto, a mesa espera por ele.
  const anaPlays = playUntilGameOver(ana.page, 240_000);
  const myTurn = beto.page.getByRole('button', { name: new RegExp(`Tua vez na sala ${code}`) });
  await expect(async () => {
    await beto.page.reload();
    await expect(myTurn).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60_000 });
  await expect(myTurn).toContainText(/até/);
  await expect(ana.page.getByText(/Vez de Beto · até/)).toBeVisible();

  await myTurn.click();
  await expect(beto.page.getByText(/Tua vez · até/)).toBeVisible({ timeout: 15_000 });
  await Promise.all([anaPlays, playUntilGameOver(beto.page, 240_000)]);

  for (const p of [ana, beto]) {
    expect(p.errors).toEqual([]);
    await p.ctx.close();
  }
});
