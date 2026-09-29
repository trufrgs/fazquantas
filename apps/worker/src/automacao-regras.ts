/**
 * Regras da automação do admin, sem nada do Cloudflare (os testes rodam em Node).
 * Os tipos vêm do painel só como tipo.
 */
import type { Automacao, SalaAberta } from './painel-do';

/** Sala parada há menos que isso nem é conferida (economiza chamadas no plano gratuito). */
const CONFERIR_DEPOIS_MS = 20 * 60_000;
/** Teto de salas conferidas por rodada. */
const MAX_POR_RODADA = 60;
const HORA_MS = 3_600_000;

export interface EstadoSala {
  existe: boolean;
  status?: string;
  conectados?: number;
  atividade?: number | null;
}

/** A regra que encerra esta sala agora, ou `null` (função pura: os testes cobrem cada caso). */
export function motivoParaEncerrar(estado: EstadoSala, cfg: Automacao, now: number, criada: number): string | null {
  if (!estado.existe) return null;
  const parada = now - (estado.atividade ?? criada);
  if (estado.status === 'lobby' && cfg.lobbyParadoHoras > 0 && parada > cfg.lobbyParadoHoras * HORA_MS) {
    return `mesa parada no lobby há mais de ${cfg.lobbyParadoHoras} h`;
  }
  if (estado.status === 'finished' && cfg.fimParadoHoras > 0 && parada > cfg.fimParadoHoras * HORA_MS) {
    return `partida terminada e mesa parada há mais de ${cfg.fimParadoHoras} h`;
  }
  return null;
}

/** Quais salas conferir nesta rodada: as paradas há mais tempo primeiro, até o teto. */
export function paraConferir(abertas: readonly SalaAberta[], now: number): SalaAberta[] {
  return abertas
    .filter((s) => now - s.atividade > CONFERIR_DEPOIS_MS)
    .sort((a, b) => a.atividade - b.atividade)
    .slice(0, MAX_POR_RODADA);
}
