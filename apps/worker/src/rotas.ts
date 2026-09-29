import { NAME_MAX_LENGTH, PROFILE_KEY_PATTERN, profileIdFromKey } from '@fodinha/engine';
import { sanitizeName } from '@fodinha/sala';
import { checkPassword, issueToken, verifyToken } from './admin';
import { PIN_PATTERN, shortUserAgent, truncateIp } from './contas';
import { contasStub, type ContaResultado } from './contas-do';
import { allowedOrigin } from './origens';
import { enviarResumo, rodarAutomacao } from './automacao';
import { descreverAutomacao } from './automacao-regras';
import { AUTOMACAO_PADRAO, painelStub, type Automacao } from './painel-do';
import type { PushSubscriptionJSON } from './push';
import { rankingStub } from './ranking-do';

/**
 * Rotas do perfil (apelido guardado com PIN, avatar, visita) e do admin. Tudo por POST com JSON,
 * só das origens do jogo.
 */

const AVATAR = /^[A-Za-z0-9_-]{1,64}$/;
const PROFILE_ID = /^[A-Za-z0-9_-]{22}$/;
const CODE = /^[A-Z0-9]{4}$/;

type Json = Record<string, unknown>;

function json(body: unknown, cors: Record<string, string>, status = 200): Response {
  return Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });
}

async function body(request: Request): Promise<Json | null> {
  try {
    const b = (await request.json()) as unknown;
    return b && typeof b === 'object' ? (b as Json) : null;
  } catch {
    return null;
  }
}

function apelidoValido(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = sanitizeName(raw.slice(0, NAME_MAX_LENGTH * 4));
  const n = [...clean].length;
  return n >= 2 && n <= NAME_MAX_LENGTH ? clean : null;
}

const MENSAGENS: Record<Exclude<ContaResultado, { ok: true }>['erro'], string> = {
  ocupado: 'Esse apelido já tem dono. Escolhe outro.',
  pin: 'PIN errado.',
  espera: 'Muitos PINs errados. Espera um pouco e tenta de novo.',
  'nao-existe': 'Não achei esse apelido guardado. Confere como escreveu.',
  bloqueado: 'Esse perfil está bloqueado no jogo online.',
};

function resposta(r: ContaResultado, cors: Record<string, string>): Response {
  if (r.ok) return json(r, cors);
  return json({ ok: false, erro: r.erro, mensagem: MENSAGENS[r.erro], esperaMs: r.esperaMs ?? null }, cors, r.erro === 'espera' ? 429 : 400);
}

async function perfis(path: string, b: Json, env: Env, cors: Record<string, string>): Promise<Response> {
  const contas = contasStub(env);
  if (path === '/api/perfis/entrar') {
    const apelido = apelidoValido(b.apelido);
    if (!apelido || typeof b.pin !== 'string' || !PIN_PATTERN.test(b.pin)) return json({ ok: false, mensagem: 'Apelido ou PIN inválido.' }, cors, 400);
    return resposta(await contas.entrar(apelido, b.pin), cors);
  }
  const key = b.profileKey;
  if (typeof key !== 'string' || !PROFILE_KEY_PATTERN.test(key)) return json({ ok: false, mensagem: 'Perfil inválido.' }, cors, 400);
  const profileId = await profileIdFromKey(key);
  if (path === '/api/perfis/meu') return json({ ok: true, conta: await contas.meu(profileId) }, cors);
  if (path === '/api/perfis/avatar') {
    if (typeof b.avatar !== 'string' || !AVATAR.test(b.avatar)) return json({ ok: false }, cors, 400);
    return json({ ok: await contas.trocarAvatar(profileId, b.avatar) }, cors);
  }
  if (path === '/api/perfis/guardar') {
    const apelido = apelidoValido(b.apelido);
    if (!apelido) return json({ ok: false, mensagem: 'Apelido inválido: de 2 a 16 letras.' }, cors, 400);
    if (typeof b.pin !== 'string' || !PIN_PATTERN.test(b.pin)) return json({ ok: false, mensagem: 'O PIN tem de 4 a 8 números.' }, cors, 400);
    const novoPin = typeof b.novoPin === 'string' && b.novoPin ? b.novoPin : undefined;
    if (novoPin !== undefined && !PIN_PATTERN.test(novoPin)) return json({ ok: false, mensagem: 'O PIN novo tem de 4 a 8 números.' }, cors, 400);
    const avatar = typeof b.avatar === 'string' && AVATAR.test(b.avatar) ? b.avatar : 'g-gauderio';
    const r = await contas.guardar({ profileId, profileKey: key, apelido, avatar, pin: b.pin, novoPin });
    // O nome do ranking acompanha o apelido guardado.
    if (r.ok) await rankingStub(env).renomear(profileId, apelido);
    return resposta(r, cors);
  }
  return json({ ok: false }, cors, 404);
}

/** O jogo abriu: conta a visita do perfil no dia (IP truncado, cidade e aparelho). */
async function visita(request: Request, b: Json, env: Env, cors: Record<string, string>): Promise<Response> {
  const key = b.profileKey;
  if (typeof key !== 'string' || !PROFILE_KEY_PATTERN.test(key)) return json({ ok: false }, cors, 400);
  const cf = (request as Request & { cf?: { country?: string; city?: string } }).cf;
  await painelStub(env).visita({
    profileId: await profileIdFromKey(key),
    nome: typeof b.name === 'string' ? sanitizeName(b.name).slice(0, NAME_MAX_LENGTH) : '',
    avatar: typeof b.avatar === 'string' && AVATAR.test(b.avatar) ? b.avatar : '',
    ip: truncateIp(request.headers.get('CF-Connecting-IP')),
    pais: cf?.country ?? '',
    cidade: cf?.city ?? '',
    aparelho: shortUserAgent(request.headers.get('User-Agent')),
  });
  return json({ ok: true }, cors);
}

const MANUTENCAO_RECADO = 'salas novas voltam daqui a pouco; quem está jogando segue na mesa.';

async function admin(path: string, request: Request, b: Json, env: Env, cors: Record<string, string>): Promise<Response> {
  const secret = (env as unknown as { ADMIN_SENHA?: string }).ADMIN_SENHA;
  const contas = contasStub(env);
  if (path === '/api/admin/entrar') {
    if (!secret) return json({ ok: false, mensagem: 'O admin ainda não foi ligado (falta a senha no servidor).' }, cors, 503);
    const espera = await contas.adminEspera();
    if (espera > 0) return json({ ok: false, mensagem: 'Muitas senhas erradas. Espera um pouco.', esperaMs: espera }, cors, 429);
    const certa = typeof b.senha === 'string' && (await checkPassword(secret, b.senha));
    await contas.adminTentativa(certa);
    if (!certa) return json({ ok: false, mensagem: 'Senha errada.' }, cors, 401);
    return json({ ok: true, token: await issueToken(secret) }, cors);
  }
  const auth = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
  if (!(await verifyToken(secret, auth))) return json({ ok: false, mensagem: 'Entra de novo no admin.' }, cors, 401);

  if (path === '/api/admin/painel') {
    const [dados, contasLista, totais] = await Promise.all([painelStub(env).dados(), contas.listar(), rankingStub(env).totais()]);
    return json({ ok: true, painel: dados, contas: contasLista, ranking: totais, padrao: AUTOMACAO_PADRAO }, cors);
  }
  const painel = painelStub(env);
  const codigos = (): string[] => {
    const lista = Array.isArray(b.codes) ? b.codes : typeof b.code === 'string' ? [b.code] : [];
    return [...new Set(lista.filter((c): c is string => typeof c === 'string').map((c) => c.toUpperCase()).filter((c) => CODE.test(c)))].slice(0, 100);
  };
  const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // Encerrar uma ou várias mesas (ação em massa), com o motivo no histórico.
  if (path === '/api/admin/sala' || path === '/api/admin/salas/encerrar') {
    const codes = codigos();
    if (codes.length === 0) return json({ ok: false, mensagem: 'Nenhuma sala.' }, cors, 400);
    const motivo = texto(b.motivo, 120) || 'encerrada pelo admin';
    const resultado = await Promise.all(
      codes.map(async (code) => {
        const ok = await env.SALAS.get(env.SALAS.idFromName(code)).encerrarPeloAdmin(`admin: ${motivo}`);
        if (!ok) await painel.salaEncerrada(code, 'não existia mais');
        return { code, encerrada: ok };
      }),
    );
    await painel.registrar(codes.length > 1 ? `admin: encerrou ${codes.length} mesas` : 'admin: encerrou a mesa', codes.join(', '), motivo);
    return json({ ok: true, resultado, encerrada: resultado[0]?.encerrada ?? false }, cors);
  }

  // Recado para mesas escolhidas, ou para todas as abertas.
  if (path === '/api/admin/salas/avisar') {
    const msg = texto(b.texto, 240);
    if (!msg) return json({ ok: false, mensagem: 'Escreve o recado.' }, cors, 400);
    const codes = b.todas === true ? (await painel.abertas()).map((s) => s.code).slice(0, 100) : codigos();
    const pessoas = await Promise.all(codes.map((code) => env.SALAS.get(env.SALAS.idFromName(code)).avisoAdmin(msg).catch(() => 0)));
    const total = pessoas.reduce((n, p) => n + p, 0);
    await painel.registrar('admin: mandou recado', b.todas === true ? `todas (${codes.length})` : codes.join(', '), msg);
    return json({ ok: true, salas: codes.length, pessoas: total }, cors);
  }

  // Manutenção: salas novas ficam barradas; com `avisar`, as mesas abertas recebem o recado.
  if (path === '/api/admin/manutencao') {
    const m = await painel.salvarManutencao(b.ativa === true, texto(b.mensagem, 200));
    let pessoas = 0;
    if (m.ativa && b.avisar === true) {
      const recado = `Manutenção: ${m.mensagem || MANUTENCAO_RECADO}`;
      const codes = (await painel.abertas()).map((s) => s.code).slice(0, 100);
      const n = await Promise.all(codes.map((code) => env.SALAS.get(env.SALAS.idFromName(code)).avisoAdmin(recado).catch(() => 0)));
      pessoas = n.reduce((t, x) => t + x, 0);
    }
    await painel.registrar(m.ativa ? 'admin: ligou a manutenção' : 'admin: desligou a manutenção', '', m.mensagem);
    return json({ ok: true, manutencao: m, pessoas }, cors);
  }

  if (path === '/api/admin/automacao') {
    const patch: Partial<Automacao> = {};
    for (const k of ['lobbyParadoHoras', 'fimParadoHoras', 'limiteSalasPorHora'] as const) {
      const v = b[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000) patch[k] = Math.round(v);
    }
    if (typeof b.resumoDiario === 'boolean') patch.resumoDiario = b.resumoDiario;
    const automacao = await painel.salvarAutomacao(patch);
    await painel.registrar('admin: mudou a automação', '', descreverAutomacao(patch));
    return json({ ok: true, automacao }, cors);
  }

  if (path === '/api/admin/automacao/rodar') {
    const rodada = await rodarAutomacao(env);
    await painel.registrar('admin: rodou a automação agora', '', `${rodada.verificadas} conferidas`);
    return json({ ok: true, rodada }, cors);
  }

  if (path === '/api/admin/avisos/assinar' || path === '/api/admin/avisos/cancelar') {
    const sub = b.subscription as Partial<PushSubscriptionJSON> | undefined;
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint)) return json({ ok: false }, cors, 400);
    if (path.endsWith('cancelar')) return json({ ok: true, aparelhos: await painel.cancelarAdmin(sub.endpoint) }, cors);
    const k = sub.keys;
    if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return json({ ok: false }, cors, 400);
    const aparelhos = await painel.assinarAdmin({ endpoint: sub.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } });
    return json({ ok: true, aparelhos }, cors);
  }

  if (path === '/api/admin/avisos/testar') {
    return json({ ok: true, enviados: await enviarResumo(env, true) }, cors);
  }
  if (path === '/api/admin/perfil') {
    const profileId = typeof b.profileId === 'string' ? b.profileId : '';
    if (!PROFILE_ID.test(profileId)) return json({ ok: false }, cors, 400);
    switch (b.acao) {
      case 'liberar-apelido':
        await contas.liberar(profileId);
        await painel.registrar('admin: liberou o apelido', profileId);
        return json({ ok: true }, cors);
      case 'renomear': {
        const apelido = apelidoValido(b.apelido);
        if (!apelido) return json({ ok: false, mensagem: 'Apelido inválido.' }, cors, 400);
        const r = await contas.renomear(profileId, apelido);
        if (r === 'ocupado') return json({ ok: false, mensagem: 'Esse apelido já tem dono.' }, cors, 400);
        await rankingStub(env).renomear(profileId, apelido);
        await painel.registrar('admin: renomeou', profileId, apelido);
        return json({ ok: true }, cors);
      }
      case 'bloquear': {
        const dias = typeof b.dias === 'number' && b.dias > 0 ? b.dias : null;
        await contas.bloquear(profileId, dias === null ? null : dias * 86_400_000, typeof b.motivo === 'string' ? b.motivo : '');
        await painel.registrar(dias === null ? 'admin: bloqueou' : `admin: bloqueou por ${dias} dias`, profileId, texto(b.motivo, 200));
        return json({ ok: true }, cors);
      }
      case 'desbloquear':
        await contas.bloquear(profileId, 0, '');
        await painel.registrar('admin: desbloqueou', profileId);
        return json({ ok: true }, cors);
      case 'tirar-do-ranking': {
        const partidas = await rankingStub(env).remover(profileId);
        await painel.registrar('admin: tirou do ranking', profileId, `${partidas} resultados`);
        return json({ ok: true, partidas }, cors);
      }
      default:
        return json({ ok: false }, cors, 400);
    }
  }
  return json({ ok: false }, cors, 404);
}

/** Atende `/api/oi`, `/api/perfis/*` e `/api/admin/*`; outra rota devolve `null`. */
export async function rotasDeConta(request: Request, env: Env, path: string, cors: Record<string, string>): Promise<Response | null> {
  const eh = path === '/api/oi' || path.startsWith('/api/perfis/') || path.startsWith('/api/admin/');
  if (!eh) return null;
  if (request.method !== 'POST') return json({ ok: false }, cors, 405);
  if (!allowedOrigin(request.headers.get('Origin'), env.ORIGENS)) return new Response('Origem não permitida.', { status: 403 });
  const b = await body(request);
  if (!b) return json({ ok: false, mensagem: 'Dados inválidos.' }, cors, 400);
  if (path === '/api/oi') return visita(request, b, env, cors);
  if (path.startsWith('/api/perfis/')) return perfis(path, b, env, cors);
  return admin(path, request, b, env, cors);
}
