import { expect, type Page } from '@playwright/test';

/** Ajustes salvos antes de abrir o app (formato do `persist` do zustand). */
export async function presetSettings(page: Page, overrides: Record<string, unknown> = {}) {
  const state = {
    name: 'Tester',
    avatar: 'tester',
    sound: false,
    haptics: false,
    speed: 'turbo',
    sortHand: 'forca',
    hints: true,
    players: 4,
    difficulty: 'facil',
    rules: {
      hierarchy: 'gaucha',
      startingLives: 2,
      penalty: 'difference',
      tieRule: 'cancel',
      blindRound: 'all',
      dealerRestriction: true,
      dealerRestrictionInBlind: false,
      progression: 'up',
      restartOnElimination: true,
      maxCards: 4,
    },
    seenTutorial: true,
    ...overrides,
  };
  await page.addInitScript((value) => {
    window.localStorage.setItem('fodinha:ajustes', JSON.stringify({ state: value, version: 1 }));
  }, state);
}

/** Coleta erros de página/console para garantir que a partida roda limpa. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * Joga pela interface até aparecer o fim de jogo: palpita o primeiro número permitido,
 * joga a carta sugerida (ou a primeira) com dois toques e fecha os resumos de rodada.
 */
export async function playUntilGameOver(page: Page, maxMs = 200_000) {
  const deadline = Date.now() + maxMs;
  const gameOver = page.getByRole('dialog', { name: 'Fim de jogo' });
  let actions = 0;
  while (Date.now() < deadline) {
    if (await gameOver.isVisible()) return actions;
    const bid = page.locator('section[aria-label="Teu palpite"] button:not([disabled])').first();
    if (await bid.isVisible().catch(() => false)) {
      await bid.click({ timeout: 2000 }).catch(() => undefined);
      actions++;
      continue;
    }
    const card = page.locator('[aria-label="Tuas cartas"] button:not([disabled])').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click({ timeout: 2000 }).catch(() => undefined);
      await card.click({ timeout: 2000 }).catch(() => undefined);
      actions++;
      continue;
    }
    const cont = page.getByRole('button', { name: 'Continuar' });
    if (await cont.isVisible().catch(() => false)) {
      await cont.click({ timeout: 2000 }).catch(() => undefined);
      continue;
    }
    await page.waitForTimeout(150);
  }
  await expect(gameOver).toBeVisible();
  return actions;
}
