import { expect, test, type Browser, type Page } from '@playwright/test';
import { presetSettings, watchErrors } from './helpers';

/**
 * O admin com várias mesas abertas: recado para as escolhidas, encerrar em massa (com motivo),
 * manutenção (barra sala nova, até para quem já estava com a tela aberta), regras da automação e o
 * histórico. Roda sozinho, depois dos outros testes (projeto `admin` do playwright.config.ts): a
 * manutenção barra sala nova para todo mundo.
 */

const SENHA = process.env.E2E_ADMIN_SENHA ?? 'senha-do-teste-e2e';

async function device(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await presetSettings(page, { name, profileKey: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') });
  return { ctx, page, errors };
}

async function abrirOnline(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
}

async function criarSala(page: Page): Promise<string> {
  await abrirOnline(page);
  await page.getByRole('button', { name: 'Criar sala' }).click();
  const label = await page.locator('div[aria-label^="Código "]').getAttribute('aria-label');
  return label!.replace('Código ', '').replace(/ /g, '');
}

test('admin: recado e encerramento em massa, manutenção, automação e histórico', async ({ browser }) => {
  test.setTimeout(180_000);
  const ana = await device(browser, 'Ana');
  const beto = await device(browser, 'Beto');
  const caio = await device(browser, 'Caio');
  const salaAna = await criarSala(ana.page);
  const salaBeto = await criarSala(beto.page);
  await caio.page.goto(`/?sala=${salaAna}`);
  await expect(ana.page.getByText(/Na mesa \(2\/8\)/)).toBeVisible();

  const adm = await device(browser, 'Admin');
  await adm.page.goto('/admin');
  await adm.page.getByLabel('Senha do admin').fill(SENHA);
  await adm.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(adm.page.getByText('Pede atenção')).toBeVisible();
  // As duas mesas aparecem em "Mesas", com quem está sentado.
  await expect(adm.page.locator('li', { hasText: salaAna })).toContainText('Caio');
  await expect(adm.page.locator('li', { hasText: salaBeto })).toContainText('Beto');

  // Recado para as duas mesas escolhidas.
  await adm.page.getByRole('button', { name: /^Salas/ }).click();
  await adm.page.getByLabel(`Selecionar a sala ${salaAna}`).check();
  await adm.page.getByLabel(`Selecionar a sala ${salaBeto}`).check();
  const barra = adm.page.getByRole('region', { name: 'Ações nas selecionadas' });
  await expect(barra).toContainText('2 selecionadas');
  await barra.getByRole('button', { name: 'Mandar recado' }).click();
  await barra.getByLabel('Recado para as mesas selecionadas').fill('Buenas! Recado de teste.');
  await barra.getByRole('button', { name: 'Mandar para 2 mesas' }).click();
  await expect(adm.page.getByText('Recado entregue a 3 pessoas em 2 mesas.')).toBeVisible();
  for (const p of [ana.page, beto.page, caio.page]) await expect(p.getByText('Buenas! Recado de teste.')).toBeVisible();

  // Encerrar as duas de uma vez, com motivo.
  await barra.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await barra.getByLabel('Motivo').fill('teste em massa');
  await barra.getByRole('button', { name: 'Encerrar 2 mesas' }).click();
  await expect(adm.page.getByText('2 mesas encerradas.')).toBeVisible();
  for (const p of [ana.page, beto.page, caio.page]) await expect(p.getByRole('alert')).toContainText(/encerrada pela administração/);
  await expect(adm.page.locator('li', { hasText: salaAna }).filter({ hasText: 'teste em massa' })).toBeVisible();

  // Manutenção: quem abre o jogo vê o aviso; quem já estava com a tela aberta é barrado com a mensagem.
  await abrirOnline(beto.page);
  await adm.page.getByRole('button', { name: 'Automação' }).click();
  await adm.page.getByLabel('Mensagem da manutenção').fill('Volto às 22h, tchê!');
  await adm.page.getByRole('button', { name: 'Ligar manutenção' }).click();
  await expect(adm.page.getByText(/^Manutenção ligada/)).toBeVisible();
  await abrirOnline(ana.page);
  await expect(ana.page.getByText('Manutenção: Volto às 22h, tchê!')).toBeVisible();
  await expect(ana.page.getByRole('button', { name: 'Em manutenção' })).toBeDisabled();
  await beto.page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(beto.page.getByRole('alert')).toContainText('Volto às 22h, tchê!');
  await adm.page.getByRole('button', { name: 'Desligar manutenção' }).click();
  await expect(adm.page.getByText(/Manutenção desligada/)).toBeVisible();
  expect(await criarSala(ana.page)).toMatch(/^[A-Z0-9]{4}$/);

  // Regras da automação: muda, salva, volta ao padrão; roda na hora.
  await adm.page.getByRole('button', { name: 'Aumentar Lobby parado' }).click();
  await adm.page.getByRole('button', { name: 'Salvar' }).click();
  await expect(adm.page.getByText('Regras salvas.')).toBeVisible();
  await adm.page.getByRole('button', { name: 'Voltar ao padrão' }).click();
  await adm.page.getByRole('button', { name: 'Salvar' }).click();
  await expect(adm.page.getByText('Regras salvas.')).toBeVisible();
  await adm.page.getByRole('button', { name: 'Rodar agora' }).click();
  await expect(adm.page.getByText(/Automação rodou: conferiu/)).toBeVisible();

  // O histórico guarda tudo, legível.
  await adm.page.getByRole('button', { name: 'Histórico' }).click();
  await expect(adm.page.getByText('teste em massa').first()).toBeVisible();
  await expect(adm.page.getByText('Buenas! Recado de teste.').first()).toBeVisible();
  await expect(adm.page.getByText('ligou a manutenção').first()).toBeVisible();
  await expect(adm.page.getByText(/lobby parado: 24 h/).first()).toBeVisible();

  for (const d of [ana, beto, caio, adm]) {
    expect(d.errors.filter((e) => !/401|WebSocket|Failed to load resource/.test(e))).toEqual([]);
    await d.ctx.close();
  }
});
