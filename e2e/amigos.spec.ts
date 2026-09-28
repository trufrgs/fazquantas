import { expect, test, type Browser, type Page } from '@playwright/test';
import { playUntilGameOver, presetSettings, watchErrors } from './helpers';

/**
 * Três amigos, cada um no seu navegador isolado (como abas anônimas): sala com senha, convite
 * pelo link, série "melhor de 3" valendo ranking, alguém recarrega a página no meio, e no fim o
 * ranking da turma mostra os três.
 */

/** Perfil de ranking diferente para cada navegador (chaves válidas de 22 caracteres). */
const KEYS = ['anaAnaAnaAnaAnaAnaAna0', 'betoBetoBetoBetoBeto01', 'cidaCidaCidaCidaCida01'];

async function person(browser: Browser, name: string, key: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await presetSettings(page, {
    name,
    avatar: name.toLowerCase(),
    profileKey: key,
    rules: {
      hierarchy: 'gaucha',
      startingLives: 1,
      penalty: 'difference',
      tieRule: 'cancel',
      blindRound: 'all',
      dealerRestriction: true,
      dealerRestrictionInBlind: false,
      progression: 'up',
      restartOnElimination: true,
      maxCards: 3,
    },
  });
  return { ctx, page, errors };
}

/** Joga até o fim da partida atual (o diálogo de fim aparece em todos). */
async function playAll(pages: Page[]) {
  await Promise.all(pages.map((p) => playUntilGameOver(p)));
}

test('três amigos: senha, série melhor de 3 valendo ranking, recarregar no meio, ranking', async ({ browser }) => {
  test.setTimeout(600_000);
  const ana = await person(browser, 'Ana', KEYS[0]!);
  const beto = await person(browser, 'Beto', KEYS[1]!);
  const cida = await person(browser, 'Cida', KEYS[2]!);

  // Ana cria a sala e ajusta: melhor de 3, 1 palito (já vem das regras dela), valendo ranking, senha.
  await ana.page.goto('/');
  await ana.page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  await ana.page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(ana.page.getByText(/Na mesa \(1\/8\)/)).toBeVisible();
  await ana.page.getByRole('radio', { name: 'Melhor de 3' }).click();
  await ana.page.getByRole('switch', { name: /Valendo ranking/ }).click();
  await ana.page.getByRole('switch', { name: /Sala com senha/ }).click();
  await ana.page.getByLabel('Nova senha da sala').fill('galpão');
  await ana.page.getByRole('button', { name: 'Salvar' }).click();
  await expect(ana.page.getByLabel('Senha da sala')).toBeVisible();
  const codeLabel = await ana.page.locator('div[aria-label^="Código "]').getAttribute('aria-label');
  const code = codeLabel!.replace('Código ', '').replace(/ /g, '');

  // Beto chega pelo link: pede senha; errada não entra, certa entra.
  await beto.page.goto(`/?sala=${code}`);
  await expect(beto.page.getByText('Essa sala tem senha')).toBeVisible();
  await beto.page.getByLabel('Senha da sala').fill('galpao');
  await beto.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(beto.page.getByRole('alert')).toContainText(/Senha errada/);
  await beto.page.getByLabel('Senha da sala').fill('galpão');
  await beto.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(beto.page.getByText(/Esperando Ana começar/)).toBeVisible();
  // Convidado vê como vai ser, sem ver a senha.
  await expect(beto.page.getByText(/Melhor de 3 · 1 palito/)).toBeVisible();
  await expect(beto.page.getByText('Valendo ranking', { exact: true })).toBeVisible();
  await expect(beto.page.getByText('Com senha', { exact: true })).toBeVisible();

  // Cida digita o código.
  await cida.page.goto('/');
  await cida.page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  await cida.page.getByLabel('Código da sala').fill(code);
  await cida.page.getByRole('button', { name: 'Entrar' }).click();
  await cida.page.getByLabel('Senha da sala').fill('galpão');
  await cida.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(ana.page.getByText(/Na mesa \(3\/8\)/)).toBeVisible();

  await ana.page.getByRole('button', { name: /Começar a série/ }).click();
  for (const p of [ana, beto, cida]) await expect(p.page.getByText('Rodada 1')).toBeVisible();

  // Beto recarrega a página no meio da partida: volta ao mesmo assento, com a mão.
  await beto.page.reload();
  await expect(beto.page.getByText(/Rodada \d/)).toBeVisible({ timeout: 20_000 });

  const pages = [ana.page, beto.page, cida.page];
  let games = 0;
  for (;;) {
    await playAll(pages);
    games += 1;
    const over = ana.page.getByRole('dialog', { name: 'Fim de jogo' });
    await expect(over.getByLabel('Placar da série')).toBeVisible();
    const next = over.getByRole('button', { name: /Próxima partida/ });
    if (await next.isVisible()) {
      await expect(beto.page.getByText(/Esperando Ana puxar a próxima partida/)).toBeVisible();
      await next.click();
      for (const p of pages) await expect(p.getByRole('dialog', { name: 'Fim de jogo' })).toBeHidden();
      continue;
    }
    // Série decidida.
    await expect(over.getByRole('button', { name: 'Nova série' })).toBeVisible();
    await expect(over.getByRole('heading', { name: /série/i })).toBeVisible();
    break;
  }
  expect(games).toBeGreaterThanOrEqual(2);
  expect(games).toBeLessThanOrEqual(3);

  // Ranking da turma: os três aparecem, com as partidas jogadas.
  await cida.page.getByRole('dialog', { name: 'Fim de jogo' }).getByRole('button', { name: 'Sair da sala' }).click();
  await cida.page.goto('/');
  await cida.page.getByRole('button', { name: 'Ranking' }).click();
  const table = cida.page.getByRole('table');
  await expect(table).toBeVisible({ timeout: 20_000 });
  for (const name of ['Ana', 'Beto', 'Cida (tu)']) await expect(table.getByText(name, { exact: true })).toBeVisible();
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  const played = await rows.locator('td:nth-child(5)').allInnerTexts();
  expect(played.every((j) => Number(j) === games)).toBe(true);

  for (const p of [ana, beto, cida]) {
    expect(p.errors).toEqual([]);
    await p.ctx.close();
  }
});
