import { createHash } from 'node:crypto';
import { expect, test, type Browser } from '@playwright/test';
import { presetSettings, watchErrors } from './helpers';

/**
 * Apelido guardado com PIN (reservado e levado para outro aparelho), avatar da turma do Gaudério
 * e o admin (/admin): vê a sala aberta, o jogador e o acesso, encerra a sala e bloqueia.
 */

function freshKey(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
}

/** O id público do perfil (o mesmo cálculo do jogo): o admin mostra os 8 primeiros caracteres. */
function idDe(key: string): string {
  return createHash('sha256').update(`fazquantas:perfil:${key}`).digest('base64url').slice(0, 22);
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

  // Aparelho 1 cria a sala.
  await a.page.goto('/');
  await a.page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  await a.page.getByRole('button', { name: 'Criar sala' }).click();
  const codeLabel = await a.page.locator('div[aria-label^="Código "]').getAttribute('aria-label');
  const code = codeLabel!.replace('Código ', '').replace(/ /g, '');

  // Um terceiro com o mesmo nome (sem o PIN) não senta: a sala pede o PIN ou outro apelido.
  const chaveC = freshKey();
  const c = await device(browser, { name: nome, profileKey: chaveC });
  await c.page.goto(`/?sala=${code}`);
  await expect(c.page.getByRole('alert')).toContainText('já tem dono');
  await expect(c.page.getByLabel('PIN do apelido')).toBeVisible();
  await expect(c.page.getByRole('button', { name: 'Criar sala' })).toBeDisabled();
  await expect(a.page.getByText(`${nome} 2`)).toHaveCount(0);

  // O dono num aparelho novo, que já jogava com o mesmo nome: o PIN ali mesmo traz o perfil (e junta o de antes).
  const d = await device(browser, { name: nome });
  await d.page.goto('/');
  await d.page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  await d.page.getByLabel('PIN do apelido').fill('4321');
  await d.page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(d.page.getByRole('textbox', { name: /Como te chamam/ })).toHaveAttribute('readonly', '');
  await expect(d.page.getByRole('radio', { name: 'Capivara plena' })).toHaveAttribute('aria-checked', 'true');

  // Outro navegador do dono, com o mesmo nome: o admin junta ao apelido guardado.
  const chaveE = freshKey();
  const e = await device(browser, { name: nome, profileKey: chaveE });
  await e.page.goto('/');
  await expect(e.page.getByRole('button', { name: 'Jogar com a gurizada' })).toBeVisible();

  // Admin: senha errada não entra; certa mostra a sala, o jogador e o acesso.
  const adm = await device(browser, {});
  await adm.page.goto('/admin');
  await adm.page.getByLabel('Senha do admin').fill('errada');
  await adm.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(adm.page.getByRole('alert')).toContainText('Senha errada');
  await adm.page.getByLabel('Senha do admin').fill(process.env.E2E_ADMIN_SENHA ?? 'senha-do-teste-e2e');
  await adm.page.getByRole('button', { name: 'Entrar' }).click();
  await expect(adm.page.getByText('Pede atenção')).toBeVisible();
  await adm.page.getByRole('button', { name: /^Salas/ }).click();
  const linha = adm.page.locator('li', { hasText: code });
  await expect(linha).toContainText(nome);
  // Encerrar pede confirmação (o primeiro toque só arma).
  await linha.getByRole('button', { name: 'Encerrar' }).click();
  await linha.getByRole('button', { name: `Encerrar ${code}` }).click();
  await expect(adm.page.getByText('1 mesa encerrada.')).toBeVisible();
  await expect(a.page.getByRole('alert')).toContainText(/encerrada pela administração/);

  await adm.page.getByRole('button', { name: 'Jogadores' }).click();
  await adm.page.getByLabel('Buscar jogador').fill(nome);
  // O dono (os aparelhos 1, 2 e o novo, juntos), o impostor e o outro navegador do dono.
  const linhas = adm.page.locator('li', { hasText: nome });
  await expect(linhas).toHaveCount(3);
  const doE = linhas.filter({ hasText: idDe(chaveE).slice(0, 8) });
  await doE.getByRole('button', { name: 'Juntar a um apelido' }).click();
  await doE.getByRole('button', { name: 'Juntar', exact: true }).click();
  await expect(adm.page.getByText(`${nome} agora joga como ${nome}.`)).toBeVisible();
  // Ao abrir de novo, o outro navegador já é o dono (sem PIN).
  await e.page.reload();
  await e.page.getByRole('button', { name: 'Ajustes' }).first().click();
  await expect(e.page.getByText(`Apelido guardado: ${nome}`)).toBeVisible();

  // O impostor é bloqueado.
  const impostor = adm.page.locator('li', { hasText: idDe(chaveC).slice(0, 8) });
  await impostor.getByRole('button', { name: 'Bloquear 7 dias' }).click();
  await impostor.getByRole('button', { name: 'Bloquear 7 dias' }).click();
  await expect(adm.page.getByText(`${nome} bloqueado por 7 dias.`)).toBeVisible();
  await adm.page.getByRole('button', { name: 'Números' }).click();
  await expect(adm.page.getByRole('table')).toContainText(nome);

  // O bloqueado não consegue mais criar sala, nem com outro apelido.
  await c.page.goto('/');
  await c.page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  await c.page.getByRole('textbox', { name: /Como te chamam/ }).fill(`Outro${nome.slice(4)}`);
  await c.page.getByRole('button', { name: 'Pronto' }).click();
  await c.page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(c.page.getByRole('alert')).toContainText('bloqueado');

  for (const x of [a, b, c, d, e, adm]) {
    expect(x.errors.filter((erro) => !/401|429|403|400|409/.test(erro))).toEqual([]);
    await x.ctx.close();
  }
});
