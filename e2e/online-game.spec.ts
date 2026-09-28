import { expect, test } from '@playwright/test';
import { playUntilGameOver, presetSettings, watchErrors } from './helpers';

test('partida online: anfitriã + convidado pelo link + bot, até o fim e de volta à sala', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ana = await ctxA.newPage();
  const beto = await ctxB.newPage();
  const errorsA = watchErrors(ana);
  const errorsB = watchErrors(beto);
  await presetSettings(ana, { name: 'Ana', avatar: 'ana' });
  await presetSettings(beto, { name: 'Beto', avatar: 'beto' });

  // Ana cria a sala.
  await ana.goto('/');
  await ana.getByRole('button', { name: 'Jogar com amigos' }).click();
  await ana.getByRole('button', { name: 'Criar sala' }).click();
  await expect(ana.getByText(/Na mesa \(1\/8\)/)).toBeVisible();
  const codeLabel = await ana.locator('div[aria-label^="Código "]').getAttribute('aria-label');
  const code = codeLabel!.replace('Código ', '').replace(/ /g, '');
  expect(code).toMatch(/^[A-Z2-9]{4}$/);
  await ana.getByRole('button', { name: 'Adicionar bot' }).click();

  // Beto entra pelo link de convite.
  await beto.goto(`/?sala=${code}`);
  await expect(beto.getByText(/Aguardando Ana começar/)).toBeVisible();
  await expect(ana.getByText('Beto')).toBeVisible();
  await expect(ana.getByText(/Na mesa \(3\/8\)/)).toBeVisible();

  await ana.getByRole('button', { name: 'Começar partida' }).click();
  await expect(ana.getByText('Rodada 1')).toBeVisible();
  await expect(beto.getByText('Rodada 1')).toBeVisible();

  await Promise.all([playUntilGameOver(ana), playUntilGameOver(beto)]);

  const overA = ana.getByRole('dialog', { name: 'Fim de jogo' });
  const overB = beto.getByRole('dialog', { name: 'Fim de jogo' });
  await expect(overA.getByRole('listitem')).toHaveCount(3);
  await expect(overA.getByRole('button', { name: 'Revanche' })).toBeVisible();
  await expect(overB.getByText(/Aguardando Ana chamar a revanche/)).toBeVisible();

  // Ana volta todo mundo para a sala.
  await overA.getByRole('button', { name: 'Voltar para a sala' }).click();
  await expect(ana.getByRole('button', { name: 'Começar partida' })).toBeVisible();
  await expect(beto.getByText(/Aguardando Ana começar/)).toBeVisible();

  expect(errorsA).toEqual([]);
  expect(errorsB).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

test('código de sala inexistente mostra erro claro', async ({ page }) => {
  await presetSettings(page, { name: 'Cida' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Jogar com amigos' }).click();
  await page.getByLabel('Código da sala').fill('ZZZZ');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText(/Sala não encontrada/);
});
