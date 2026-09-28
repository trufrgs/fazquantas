import { NAME_MAX_LENGTH, PROFILE_KEY_PATTERN, profileIdFromKey } from '@fodinha/engine';
import { sanitizeName } from '@fodinha/sala';
import { checkPassword, issueToken, verifyToken } from './admin';
import { PIN_PATTERN, shortUserAgent, truncateIp } from './contas';
import { contasStub, type ContaResultado } from './contas-do';
import { allowedOrigin } from './origens';
import { painelStub } from './painel-do';
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
    const [painel, contasLista, totais] = await Promise.all([painelStub(env).dados(), contas.listar(), rankingStub(env).totais()]);
    return json({ ok: true, painel, contas: contasLista, ranking: totais }, cors);
  }
  if (path === '/api/admin/sala') {
    const code = typeof b.code === 'string' ? b.code.toUpperCase() : '';
    if (!CODE.test(code)) return json({ ok: false }, cors, 400);
    const ok = await env.SALAS.get(env.SALAS.idFromName(code)).encerrarPeloAdmin();
    if (!ok) await painelStub(env).salaEncerrada(code, 'não existia mais');
    return json({ ok: true, encerrada: ok }, cors);
  }
  if (path === '/api/admin/perfil') {
    const profileId = typeof b.profileId === 'string' ? b.profileId : '';
    if (!PROFILE_ID.test(profileId)) return json({ ok: false }, cors, 400);
    switch (b.acao) {
      case 'liberar-apelido':
        await contas.liberar(profileId);
        return json({ ok: true }, cors);
      case 'renomear': {
        const apelido = apelidoValido(b.apelido);
        if (!apelido) return json({ ok: false, mensagem: 'Apelido inválido.' }, cors, 400);
        const r = await contas.renomear(profileId, apelido);
        if (r === 'ocupado') return json({ ok: false, mensagem: 'Esse apelido já tem dono.' }, cors, 400);
        await rankingStub(env).renomear(profileId, apelido);
        return json({ ok: true }, cors);
      }
      case 'bloquear': {
        const dias = typeof b.dias === 'number' && b.dias > 0 ? b.dias : null;
        await contas.bloquear(profileId, dias === null ? null : dias * 86_400_000, typeof b.motivo === 'string' ? b.motivo : '');
        return json({ ok: true }, cors);
      }
      case 'desbloquear':
        await contas.bloquear(profileId, 0, '');
        return json({ ok: true }, cors);
      case 'tirar-do-ranking':
        return json({ ok: true, partidas: await rankingStub(env).remover(profileId) }, cors);
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
