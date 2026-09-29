import type { CardId } from '../src/cards';
import { applyAction, createGame, currentActor } from '../src/game';
import type { Rules } from '../src/rules';
import type { ApplyResult, GameState } from '../src/types';

export const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Jogador ${i}` }));

export function ok(res: ApplyResult): GameState {
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.state;
}

export function newGame(
  n: number,
  rules: Partial<Rules> = {},
  opts: { seed?: number; firstDealer?: number } = {},
): GameState {
  return createGame({
    players: players(n),
    rules,
    seed: opts.seed ?? 1,
    firstDealer: opts.firstDealer ?? 0,
  });
}

/** Troca as mãos/vira da rodada atual (ainda na fase de apostas) por valores conhecidos. */
export function setupRound(
  state: GameState,
  deal: { cards: number; hands: Record<string, CardId[]>; vira?: CardId | null },
): GameState {
  const s = structuredClone(state);
  s.round.cards = deal.cards;
  s.round.hands = structuredClone(deal.hands);
  s.round.vira = deal.vira ?? null;
  // Como no jogo: "só a primeira" é a primeira rodada de 1 carta da partida.
  s.round.blind =
    deal.cards === 1 &&
    (s.rules.blindRound === 'all' || (s.rules.blindRound === 'first' && !s.history.some((r) => r.cards === 1)));
  return s;
}

/** Aplica as apostas na ordem de quem tem a vez. */
export function bidAll(state: GameState, values: number[]): GameState {
  let s = state;
  for (const value of values) {
    const actor = currentActor(s);
    if (!actor || actor.kind !== 'bid') throw new Error('não é hora de apostar');
    s = ok(applyAction(s, { type: 'bid', playerId: actor.playerId, value }));
  }
  return s;
}

/** Joga as cartas na ordem de quem tem a vez. */
export function playAll(state: GameState, cardIds: CardId[]): GameState {
  let s = state;
  for (const cardId of cardIds) {
    const actor = currentActor(s);
    if (!actor || actor.kind !== 'play') throw new Error('não é hora de jogar');
    s = ok(applyAction(s, { type: 'play', playerId: actor.playerId, cardId }));
  }
  return s;
}

export const cont = (s: GameState) => ok(applyAction(s, { type: 'continue' }));
