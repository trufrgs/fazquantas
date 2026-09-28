import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { presetSettings } from './helpers';

/** Falhas graves de acessibilidade (axe) na tela atual. */
async function serious(page: Page) {
  const results = await new AxeBuilder({ page }).disableRules(['meta-viewport']).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`);
}

test.describe('acessibilidade', () => {
  test.beforeEach(async ({ page }) => {
    await presetSettings(page, { seenTips: ['palpite', 'jogar', 'cega', 'pe'] });
  });

  test('telas de menu sem violações graves', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Jogar contra bots' })).toBeVisible();
    expect(await serious(page)).toEqual([]);

    await page.getByRole('button', { name: 'Mudar bots e regras' }).click();
    expect(await serious(page)).toEqual([]);
    await page.getByRole('button', { name: 'Voltar' }).click();

    await page.getByRole('button', { name: 'Como jogar' }).click();
    expect(await serious(page)).toEqual([]);
  });

  test('mesa sem violações graves', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Jogar contra bots' }).click();
    await expect(page.getByText('Rodada 1')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await serious(page)).toEqual([]);
  });
});
