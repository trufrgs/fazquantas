import { expect, test, type Browser } from '@playwright/test';
import { presetSettings, watchErrors } from './helpers';

/**
 * Apelido guardado com PIN (reservado e levado para outro aparelho), avatar da turma do Gaudério
 * e o admin (/admin): vê a sala aberta, o jogador e o acesso, encerra a sala e bloqueia.
 */

function freshKey(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
}

async function device(browser: Browser, settings: Record<string, unknown>) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await presetSettings(page, { profileKey: freshKey(), ...settings });
  return { ctx, page, errors };
}

test('apelido guardado com PIN, outro aparelho, apelido reservado e admin', async ({ browser }) => {
  test.setTimeout(180_000);
  // Nome único por execução: o servidor local guarda os apelidos entre execuções.
  const nome = `Tche${Math.random().toString(36).slice(2, 7)}`;

  // Aparelho 1: escolhe avatar e guarda o apelido.
  const a = await device(browser, { name: nome });
  await a.page.goto('/');
  await a.page.getByRole('button', { name: 'Ajustes' }).first().click();
  await a.page.getByRole('radio', { name: 'Capivara plena' }).click();
  await a.page.getByRole('button', { name: 'Guardar meu apelido' }).click();
  await a.page.getByLabel('PIN', { exact: true }).fill('4321');
  await a.page.getByLabel('Repete o PIN').fill('4321');
  await a.page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(a.page.getByText(`Apelido guardado: ${nome}`)).toBeVisible();
  await expect(a.page.getByRole('textbox', { name: /Como te chamam/ })).toHaveAttribute('readonly', '');

  // Aparelho 2: PIN errado não entra; certo traz o apelido e o avatar.
  const b = await device(browser, { name: '' });
  await b.page.goto('/');
  await b.page.getByRole('button', { name: 'Ajustes' }).first().click();
  await b.page.getByRole('button', { name: 'Já guardei meu apelido' }).click();
  await b.page.getByLabel('Apelido guardado').fill(nome.toLowerCase());
  await b.page.getByLabel('PIN', { exact: true }).fill('1111');
  await b.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(b.page.getByRole('alert')).toContainText('PIN errado');
  await b.page.getByLabel('PIN', { exact: true }).fill('4321');
  await b.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(b.page.getByText(`Apelido guardado: ${nome}`)).toBeVisible();
  await expect(b.page.getByRole('radio', { name: 'Capivara plena' })).toHaveAttribute('aria-checked', 'true');

  // Um terceiro com o mesmo nome senta com número na sala do aparelho 1.
  await a.page.goto('/');
  await a.page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  await a.page.getByRole('button', { name: 'Criar sala' }).click();
  const codeLabel = await a.page.locator('div[aria-label^="Código "]').getAttribute('aria-label');
  const code = codeLabel!.replace('Código ', '').replace(/ /g, '');
  const c = await device(browser, { name: nome });
  await c.page.goto(`/?sala=${code}`);
  await expect(a.page.getByText(`${nome} 2`)).toBeVisible();

  // Admin: senha errada não entra; certa mostra a sala, o jogador e o acesso.
  const adm = await device(browser, {});
  await adm.page.goto('/admin');
  await adm.page.getByLabel('Senha do admin').fill('errada');
  await adm.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(adm.page.getByRole('alert')).toContainText('Senha errada');
  await adm.page.getByLabel('Senha do admin').fill(process.env.E2E_ADMIN_SENHA ?? 'senha-do-teste-e2e');
  await adm.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(adm.page.getByText('pessoas abriram o jogo')).toBeVisible();
  await adm.page.getByRole('radio', { name: /Salas/ }).click();
  const linha = adm.page.locator('li', { hasText: code });
  await expect(linha).toContainText(nome);
  await linha.getByRole('button', { name: 'Encerrar' }).click();
  await expect(adm.page.getByText(`Sala ${code} encerrada.`)).toBeVisible();
  await expect(a.page.getByRole('alert')).toContainText(/encerrada pela administração/);

  await adm.page.getByRole('radio', { name: 'Jogadores' }).click();
  // O impostor abriu o jogo com o mesmo nome, mas sem o apelido guardado.
  await adm.page.getByLabel('Buscar jogador').fill(nome);
  const impostor = adm.page.locator('li', { hasText: nome }).filter({ hasNotText: 'apelido guardado' }).first();
  await impostor.getByRole('button', { name: 'Bloquear 7 dias' }).click();
  await expect(adm.page.getByText(`${nome} bloqueado por 7 dias.`)).toBeVisible();
  await adm.page.getByRole('radio', { name: 'Acessos' }).click();
  await expect(adm.page.getByRole('table')).toContainText(nome);

  // O bloqueado não consegue mais criar sala.
  await c.page.goto('/');
  await c.page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  await c.page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(c.page.getByRole('alert')).toContainText('bloqueado');

  for (const d of [a, b, c, adm]) {
    expect(d.errors.filter((e) => !/401|429|403|400/.test(e))).toEqual([]);
    await d.ctx.close();
  }
});
