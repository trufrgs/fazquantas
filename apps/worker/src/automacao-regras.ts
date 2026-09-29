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
  /** Última mensagem ou conexão de uma pessoa (bot jogando não conta). */
  atividade?: number | null;
  /** Cada um no seu tempo (1 h ou mais por jogada). */
  assincrona?: boolean;
}

/**
 * Rede de segurança: a sala ao vivo sem ninguém conectado acaba sozinha em 15 min e a de "cada um
 * no seu tempo" em 7 dias. Passou muito disso, algo falhou na sala (já aconteceu: a contagem
 * recomeçava a cada vez que o objeto acordava), e a automação encerra.
 */
const AO_VIVO_ABANDONADA_MS = HORA_MS;
const ASSINCRONA_ABANDONADA_MS = 8 * 24 * HORA_MS;

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
  if (estado.conectados === 0) {
    if (!estado.assincrona && parada > AO_VIVO_ABANDONADA_MS) return 'mesa ao vivo sem ninguém há mais de 1 h';
    if (estado.assincrona && parada > ASSINCRONA_ABANDONADA_MS) return 'mesa de cada um no seu tempo parada há mais de 8 dias';
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

/** O que mudou na automação, legível no histórico ("lobby parado: 6 h, resumo do dia: não"). */
export function descreverAutomacao(patch: Partial<Automacao>): string {
  const partes: string[] = [];
  const horas = (v: number) => (v === 0 ? 'desligado' : `${v} h`);
  if (patch.lobbyParadoHoras !== undefined) partes.push(`lobby parado: ${horas(patch.lobbyParadoHoras)}`);
  if (patch.fimParadoHoras !== undefined) partes.push(`partida terminada parada: ${horas(patch.fimParadoHoras)}`);
  if (patch.limiteSalasPorHora !== undefined)
    partes.push(`salas por hora por endereço: ${patch.limiteSalasPorHora === 0 ? 'sem limite' : patch.limiteSalasPorHora}`);
  if (patch.resumoDiario !== undefined) partes.push(`resumo do dia: ${patch.resumoDiario ? 'sim' : 'não'}`);
  return partes.join(', ') || 'nada';
}
