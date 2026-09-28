/**
 * Ranking: períodos no horário de Brasília (sem horário de verão desde 2019) e o formato das
 * linhas que o servidor devolve.
 */

export type RankingPeriod = 'semana' | 'mes' | 'ano' | 'sempre';
export const RANKING_PERIODS: readonly { id: RankingPeriod; label: string }[] = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
  { id: 'ano', label: 'Ano' },
  { id: 'sempre', label: 'Sempre' },
];

/** `geral`: todo mundo; `turma`: só quem já jogou uma partida valendo contigo. */
export type RankingScope = 'geral' | 'turma';

/** Humanos mínimos numa partida para ela poder valer ranking. */
export const RANKED_MIN_HUMANS = 2;

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export interface PeriodRange {
  period: RankingPeriod;
  /** Início (inclusivo) e fim (exclusivo), em epoch ms. */
  start: number;
  end: number;
  label: string;
  /** Um instante dentro do período anterior e do seguinte, para navegar. */
  prev: number | null;
  next: number | null;
}

/** Meia-noite de Brasília do dia `y-m-d` (mês de 0 a 11; aceita estouro, como `Date.UTC`). */
function brtMidnight(y: number, m: number, d: number): number {
  return Date.UTC(y, m, d) - BRT_OFFSET_MS;
}

/** Data de calendário em Brasília de um instante. */
export function brtDate(at: number): { y: number; m: number; d: number; weekday: number } {
  const t = new Date(at + BRT_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), weekday: t.getUTCDay() };
}

/** Período que contém o instante `at`: semana de segunda a domingo, mês ou ano civil. */
export function periodRange(period: RankingPeriod, at: number, now: number = at): PeriodRange {
  const { y, m, d, weekday } = brtDate(at);
  let start: number;
  let end: number;
  let label: string;
  if (period === 'semana') {
    const mondayOffset = (weekday + 6) % 7;
    start = brtMidnight(y, m, d - mondayOffset);
    end = start + 7 * DAY_MS;
    const a = brtDate(start);
    const b = brtDate(end - 1);
    label = a.m === b.m ? `${a.d} a ${b.d} de ${MONTHS[b.m]}` : `${a.d} de ${MONTHS[a.m]} a ${b.d} de ${MONTHS[b.m]}`;
  } else if (period === 'mes') {
    start = brtMidnight(y, m, 1);
    end = brtMidnight(y, m + 1, 1);
    label = `${MONTHS[m]![0]!.toUpperCase()}${MONTHS[m]!.slice(1)} de ${y}`;
  } else if (period === 'ano') {
    start = brtMidnight(y, 0, 1);
    end = brtMidnight(y + 1, 0, 1);
    label = String(y);
  } else {
    return { period, start: 0, end: Number.MAX_SAFE_INTEGER, label: 'Desde o começo', prev: null, next: null };
  }
  return { period, start, end, label, prev: start - 1, next: end <= now ? end : null };
}

export interface RankingRow {
  position: number;
  profileId: string;
  name: string;
  avatar: string;
  points: number;
  wins: number;
  games: number;
}

export interface RankingResponse {
  range: PeriodRange;
  scope: RankingScope;
  rows: RankingRow[];
  /** A linha de quem pediu, mesmo fora do top. */
  you: RankingRow | null;
}
