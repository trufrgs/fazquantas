import { expect, test } from '@playwright/test';
import { playUntilGameOver, presetSettings, watchErrors } from './helpers';

test('partida local contra bots do início ao fim', async ({ page }) => {
  const errors = watchErrors(page);
  await presetSettings(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Jogar agora' }).click();
  await expect(page.getByText('Rodada 1')).toBeVisible();

  const actions = await playUntilGameOver(page);
  expect(actions).toBeGreaterThan(0);

  const dialog = page.getByRole('dialog', { name: 'Fim de jogo' });
  await expect(dialog.getByRole('listitem')).toHaveCount(4);
  await expect(dialog.getByRole('button', { name: 'Mais uma?' })).toBeVisible();

  // Jogar de novo começa outra partida do zero.
  await dialog.getByRole('button', { name: 'Mais uma?' }).click();
  await expect(page.getByText('Rodada 1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('continuar a partida depois de recarregar a página', async ({ page }) => {
  const errors = watchErrors(page);
  await presetSettings(page, { speed: 'normal', rules: { startingLives: 5 } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Jogar agora' }).click();
  await page.locator('section[aria-label="Teu palpite"] button:not([disabled])').first().click();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByRole('button', { name: /Continuar partida/ })).toBeVisible();
  await page.getByRole('button', { name: /Continuar partida/ }).click();
  await expect(page.getByText(/Rodada \d/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('palpite proibido do pé fica desabilitado e explicado', async ({ page }) => {
  await presetSettings(page, { speed: 'turbo', players: 2, rules: { dealerRestriction: true, blindRound: 'off', startingLives: 5 } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Jogar agora' }).click();
  // Joga até ser o pé numa rodada (com 2 jogadores, alterna a cada rodada).
  for (let i = 0; i < 40; i++) {
    const panel = page.locator('section[aria-label="Teu palpite"]');
    if (await panel.isVisible().catch(() => false)) {
      if (await panel.getByText('Tu é o', { exact: false }).isVisible().catch(() => false)) {
        const forbidden = panel.getByRole('button', { name: /proibido para o pé/ });
        if ((await forbidden.count()) > 0) {
          await expect(forbidden).toBeDisabled();
          return;
        }
      }
      await panel.locator('button:not([disabled])').first().click({ timeout: 2000 }).catch(() => undefined);
    }
    const card = page.locator('[aria-label="Tuas cartas"] button:not([disabled])').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click({ timeout: 2000 }).catch(() => undefined);
      await card.click({ timeout: 2000 }).catch(() => undefined);
    }
    const cont = page.getByRole('button', { name: 'Continuar' });
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(300);
  }
  throw new Error('não chegou a ser o pé com restrição');
});

test('montar partida pergunta antes de apagar a partida salva', async ({ page }) => {
  const errors = watchErrors(page);
  await presetSettings(page, { speed: 'normal', rules: { startingLives: 5 } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Jogar agora' }).click();
  await page.locator('section[aria-label="Teu palpite"] button:not([disabled])').first().click();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByRole('button', { name: /Continuar partida/ })).toBeVisible();

  await page.getByRole('button', { name: 'Montar partida contra bots' }).click();
  await page.getByRole('button', { name: 'Começar partida' }).click();
  const confirm = page.getByRole('dialog', { name: 'Começar outra partida' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Deixa quieto' }).click();
  await expect(confirm).toBeHidden();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByRole('button', { name: /Continuar partida/ })).toBeVisible();

  await page.getByRole('button', { name: 'Montar partida contra bots' }).click();
  await page.getByRole('button', { name: 'Começar partida' }).click();
  await page.getByRole('dialog', { name: 'Começar outra partida' }).getByRole('button', { name: 'Começar outra' }).click();
  await expect(page.getByText('Rodada 1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('o menu da partida reabre no começo, sem a confirmação da vez anterior', async ({ page }) => {
  await presetSettings(page, { speed: 'normal' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Jogar agora' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu da partida' });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await menu.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(menu.getByText('Sair pro início?', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'Continuar' })).toBeVisible();
  await expect(menu.getByText('Sair pro início?', { exact: false })).toBeHidden();
});
