/**
 * Série de partidas ("melhor de X") e a pontuação por colocação, que vale tanto para o placar da
 * série quanto para o ranking. Funções puras: o servidor guarda o estado, o cliente só mostra.
 */
import type { GameState, PlayerState } from './types';

/** Partida avulsa (1) ou melhor de 3, 5 ou 7. */
export const BEST_OF_OPTIONS = [1, 3, 5, 7] as const;
export type BestOf = (typeof BEST_OF_OPTIONS)[number];

export interface SeriesGame {
  /** 1, 2, 3… */
  number: number;
  winners: string[];
  /** Grupos de colocação, do melhor para o pior (empatados no mesmo grupo). */
  standings: string[][];
  /** Pontos de cada jogador nesta partida. */
  points: Record<string, number>;
  finishedAt: number;
}

export interface SeriesState {
  bestOf: BestOf;
  /** Vitórias para levar a série. */
  target: number;
  games: SeriesGame[];
  wins: Record<string, number>;
  points: Record<string, number>;
  /** Nome de cada jogador que passou pela série (quem saiu continua no placar). */
  names: Record<string, string>;
  /** Campeões (mais de um se empatarem até o fim); `null` enquanto a série corre. */
  champion: string[] | null;
}

export function isBestOf(value: unknown): value is BestOf {
  return (BEST_OF_OPTIONS as readonly unknown[]).includes(value);
}

/** Vitórias que decidem uma série "melhor de X": a maioria de X. */
export function seriesTarget(bestOf: BestOf): number {
  return Math.floor(bestOf / 2) + 1;
}

export function newSeries(bestOf: BestOf): SeriesState {
  return { bestOf, target: seriesTarget(bestOf), games: [], wins: {}, points: {}, names: {}, champion: null };
}

/**
 * Colocação final em grupos: sobreviveu mais rodadas fica na frente; na mesma rodada, mais
 * palitos. Quem empata nas duas coisas divide a colocação.
 */
export function standingsOf(players: readonly PlayerState[]): string[][] {
  const survived = (p: PlayerState) => p.eliminatedRound ?? Number.POSITIVE_INFINITY;
  const sorted = [...players].sort((a, b) => survived(b) - survived(a) || b.lives - a.lives);
  const groups: string[][] = [];
  let last: PlayerState | null = null;
  for (const p of sorted) {
    if (last && survived(last) === survived(p) && last.lives === p.lives) groups.at(-1)!.push(p.id);
    else groups.push([p.id]);
    last = p;
  }
  return groups;
}

/**
 * Pontos por colocação: um ponto para cada adversário que terminou atrás de ti (empate não
 * conta). `among` limita quem entra na conta (no ranking, só os humanos).
 */
export function placementPoints(standings: readonly string[][], among?: ReadonlySet<string>): Record<string, number> {
  const groups = standings
    .map((g) => (among ? g.filter((id) => among.has(id)) : [...g]))
    .filter((g) => g.length > 0);
  const points: Record<string, number> = {};
  let below = groups.reduce((n, g) => n + g.length, 0);
  for (const group of groups) {
    below -= group.length;
    for (const id of group) points[id] = below;
  }
  return points;
}

/** Registra uma partida terminada na série e decide o campeão quando for a hora. */
export function recordSeriesGame(
  series: SeriesState,
  state: GameState,
  names: Record<string, string>,
  finishedAt: number,
): SeriesState {
  if (!state.result || series.champion) return series;
  const standings = standingsOf(state.players);
  const points = placementPoints(standings);
  const next: SeriesState = {
    ...series,
    games: [
      ...series.games,
      { number: series.games.length + 1, winners: [...state.result.winners], standings, points, finishedAt },
    ],
    wins: { ...series.wins },
    points: { ...series.points },
    names: { ...series.names, ...names },
  };
  for (const p of state.players) {
    next.wins[p.id] ??= 0;
    next.points[p.id] = (next.points[p.id] ?? 0) + (points[p.id] ?? 0);
  }
  for (const id of state.result.winners) next.wins[id] = (next.wins[id] ?? 0) + 1;
  next.champion = decideChampion(next);
  return next;
}

/**
 * Quem alcança a maioria das vitórias leva. Sem ninguém lá depois das X partidas, leva quem venceu
 * mais; empatado, quem somou mais pontos; empatado de novo, dividem o título.
 */
function decideChampion(s: SeriesState): string[] | null {
  const ids = Object.keys(s.wins);
  const reached = ids.filter((id) => (s.wins[id] ?? 0) >= s.target);
  if (reached.length > 0) return reached;
  if (s.games.length < s.bestOf) return null;
  const top = Math.max(...ids.map((id) => s.wins[id] ?? 0));
  const byWins = ids.filter((id) => (s.wins[id] ?? 0) === top);
  const bestPoints = Math.max(...byWins.map((id) => s.points[id] ?? 0));
  return byWins.filter((id) => (s.points[id] ?? 0) === bestPoints);
}

/** Classificação da série: vitórias, depois pontos. */
export function seriesTable(s: SeriesState): { id: string; name: string; wins: number; points: number }[] {
  return Object.keys(s.names)
    .map((id) => ({ id, name: s.names[id] ?? '?', wins: s.wins[id] ?? 0, points: s.points[id] ?? 0 }))
    .sort((a, b) => b.wins - a.wins || b.points - a.points);
}
