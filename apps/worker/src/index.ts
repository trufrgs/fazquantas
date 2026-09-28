import {
  PROFILE_KEY_PATTERN,
  RANKING_PERIODS,
  profileIdFromKey,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RankingPeriod,
  type RankingScope,
} from '@fodinha/engine';
import { allowedOrigin, corsHeaders } from './origens';
import type { PushSubscriptionJSON } from './push';

import { rotasDeConta } from './rotas';

export { AvisosDO } from './avisos-do';
export { ContasDO } from './contas-do';
export { PainelDO } from './painel-do';
import { rankingStub } from './ranking-do';

export { RankingDO } from './ranking-do';
export { SalaDO } from './sala-do';

const CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
const PROFILE_ID = /^[A-Za-z0-9_-]{22}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Código novo para "criar sala" (se o sorteio repetir uma sala viva, a sala responde ROOM_TAKEN). */
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  let code = '';
  for (const b of bytes) code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return code;
}

function json(body: unknown, headers: Record<string, string>, status = 200): Response {
  return Response.json(body, { status, headers: { ...headers, 'Cache-Control': 'no-store' } });
}

async function room(request: Request, env: Env, code: string, cors: Record<string, string>, info: boolean): Promise<Response> {
  const stub = env.SALAS.get(env.SALAS.idFromName(code));
  const headers = new Headers(request.headers);
  headers.set('x-codigo', code);
  if (info) {
    const res = await stub.fetch(new Request(`https://sala/${code}/info`, { headers }));
    return json(await res.json(), cors);
  }
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Esperava um WebSocket.', { status: 426, headers: cors });
  }
  if (!allowedOrigin(request.headers.get('Origin'), env.ORIGENS)) {
    return new Response('Origem não permitida.', { status: 403 });
  }
  return stub.fetch(new Request(request, { headers }));
}

async function ranking(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const period = url.searchParams.get('periodo') ?? 'semana';
  if (!RANKING_PERIODS.some((p) => p.id === period)) return json({ error: 'periodo' }, cors, 400);
  const scope = (url.searchParams.get('escopo') ?? 'geral') as RankingScope;
  if (scope !== 'geral' && scope !== 'turma') return json({ error: 'escopo' }, cors, 400);
  const profileId = url.searchParams.get('perfil');
  if (profileId !== null && !PROFILE_ID.test(profileId)) return json({ error: 'perfil' }, cors, 400);
  const day = url.searchParams.get('data');
  let at = Date.now();
  if (day !== null) {
    if (!DAY.test(day)) return json({ error: 'data' }, cors, 400);
    // Meio-dia de Brasília do dia pedido: longe das bordas do período.
    at = Date.parse(`${day}T15:00:00Z`);
    if (Number.isNaN(at)) return json({ error: 'data' }, cors, 400);
  }
  const stub = rankingStub(env);
  return json(await stub.consultar({ period: period as RankingPeriod, at, scope, profileId }), cors);
}

/** Guarda (ou tira) a assinatura de push de um aparelho no perfil de quem mandou a chave. */
async function avisos(request: Request, env: Env, cors: Record<string, string>, subscribe: boolean): Promise<Response> {
  if (!allowedOrigin(request.headers.get('Origin'), env.ORIGENS)) return new Response('Origem não permitida.', { status: 403 });
  let body: { profileKey?: unknown; subscription?: Partial<PushSubscriptionJSON> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'json' }, cors, 400);
  }
  const key = body.profileKey;
  const sub = body.subscription;
  if (typeof key !== 'string' || !PROFILE_KEY_PATTERN.test(key)) return json({ error: 'perfil' }, cors, 400);
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000) {
    return json({ error: 'assinatura' }, cors, 400);
  }
  const stub = env.AVISOS.get(env.AVISOS.idFromName('geral'));
  const perfil = await profileIdFromKey(key);
  if (!subscribe) {
    await stub.cancelar(perfil, sub.endpoint);
    return json({ ok: true }, cors);
  }
  const k = sub.keys;
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 200 || k.auth.length > 100) {
    return json({ error: 'assinatura' }, cors, 400);
  }
  await stub.assinar(perfil, { endpoint: sub.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } });
  return json({ ok: true }, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'), env.ORIGENS);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = url.pathname.replace(/\/+$/, '');

    if (path === '/api/saude') return json({ ok: true }, cors);
    const conta = await rotasDeConta(request, env, path, cors);
    if (conta) return conta;
    if (path === '/api/salas/nova') return room(request, env, newCode(), cors, false);
    const salas = /^\/api\/salas\/([A-Za-z0-9]{1,8})(\/info)?$/.exec(path);
    if (salas) {
      const code = salas[1]!.toUpperCase();
      if (!CODE.test(code)) return json({ error: 'codigo' }, cors, 404);
      return room(request, env, code, cors, salas[2] === '/info');
    }
    if (path === '/api/ranking' && request.method === 'GET') return ranking(url, env, cors);
    if (path === '/api/avisos/chave') return json({ publicKey: env.VAPID_PUBLICO }, cors);
    if ((path === '/api/avisos/assinar' || path === '/api/avisos/cancelar') && request.method === 'POST') {
      return avisos(request, env, cors, path.endsWith('assinar'));
    }
    return new Response('Não encontrado.', { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;
