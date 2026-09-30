import type { IceServer } from '@fodinha/engine';

/** As credenciais TURN valem 24 h; o Worker reaproveita as mesmas por 1 h antes de pedir outras. */
const VALIDADE_S = 86_400;
const REAPROVEITA_MS = 60 * 60_000;

let guardadas: { servidores: IceServer[]; ate: number } | null = null;

export interface SegredosTurn {
  TURN_KEY_ID?: string;
  TURN_KEY_TOKEN?: string;
}

/**
 * Os servidores ICE da conversa por voz: STUN e TURN do Cloudflare Realtime (1.000 GB por mês de
 * graça), com credenciais de curta duração geradas pela chave TURN (segredos `TURN_KEY_ID` e
 * `TURN_KEY_TOKEN`). O TURN só entra quando a ligação direta não fecha (NAT mais fechado, alguns 4G).
 * Sem os segredos, lista vazia: a sala usa os STUN públicos.
 */
export async function servidoresIce(env: SegredosTurn, agora = Date.now()): Promise<IceServer[]> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return [];
  if (guardadas && guardadas.ate > agora) return guardadas.servidores;
  const resposta = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TURN_KEY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: VALIDADE_S }),
  });
  if (!resposta.ok) throw new Error(`TURN respondeu ${resposta.status}`);
  const { iceServers } = (await resposta.json()) as { iceServers: IceServer[] };
  guardadas = { servidores: iceServers, ate: agora + REAPROVEITA_MS };
  return iceServers;
}
