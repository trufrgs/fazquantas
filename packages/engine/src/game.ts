import { card, fullDeck, isCardId } from './cards';
import { trickStrength, type StrengthCtx } from './hierarchy';
import { createRng, shuffle } from './rng';
import {
  DECK_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  normalizeRules,
  type Progression,
  type Rules,
  type TieRule,
} from './rules';
import type {
  Action,
  Actor,
  ApplyResult,
  GameError,
  GameErrorCode,
  GameResult,
  GameState,
  Play,
  PlayerInfo,
  PlayerState,
  TrickRecord,
} from './types';

export interface CreateGameConfig {
  players: PlayerInfo[];
  rules?: Partial<Rules>;
  seed: number;
  /** Índice do primeiro carteador; sorteado quando omitido. */
  firstDealer?: number;
}

export function createGame(cfg: CreateGameConfig): GameState {
  const n = cfg.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new Error(`A mesa precisa de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores.`);
  }
  if (new Set(cfg.players.map((p) => p.id)).size !== n) {
    throw new Error('Ids de jogador repetidos.');
  }
  const rules = normalizeRules(cfg.rules ?? {});
  const rng = createRng(cfg.seed);
  const dealerIndex = cfg.firstDealer ?? rng.int(n);
  if (!Number.isInteger(dealerIndex) || dealerIndex < 0 || dealerIndex >= n) {
    throw new Error('Carteador inválido.');
  }
  const players: PlayerState[] = cfg.players.map((p) => ({
    id: p.id,
    name: p.name,
    lives: rules.startingLives,
    eliminatedRound: null,
  }));
  const base: GameState = {
    version: 1,
    rules,
    players,
    phase: 'bidding',
    round: {
      number: 0,
      cards: 0,
      dealerId: players[dealerIndex]!.id,
      order: [],
      vira: null,
      hands: {},
      bids: {},
      bidTurn: 0,
      tricksWon: {},
      trick: null,
      completedTricks: [],
      blind: false,
    },
    direction: 'up',
    history: [],
    rngState: rng.state,
    result: null,
    seq: 0,
  };
  dealRound(base, 1, 1, players[dealerIndex]!.id);
  return base;
}

// ---------------------------------------------------------------------------
// Consultas

export function isAlive(p: PlayerState): boolean {
  return p.eliminatedRound === null;
}

export function alivePlayers(state: GameState): PlayerState[] {
  return state.players.filter(isAlive);
}

export function strengthCtx(state: GameState): StrengthCtx {
  return {
    mode: state.rules.hierarchy,
    vira: state.round.vira ? card(state.round.vira) : null,
  };
}

/** Ordem da vaza atual: começa em quem puxou e segue a ordem da rodada. */
export function trickOrder(order: readonly string[], leaderId: string): string[] {
  const start = order.indexOf(leaderId);
  return order.map((_, i) => order[(start + i) % order.length]!);
}

export function currentActor(state: GameState): Actor | null {
  const { round } = state;
  if (state.phase === 'bidding') {
    const playerId = round.order[round.bidTurn];
    return playerId ? { playerId, kind: 'bid' } : null;
  }
  if (state.phase === 'playing' && round.trick) {
    const playerId = trickOrder(round.order, round.trick.leaderId)[round.trick.plays.length];
    return playerId ? { playerId, kind: 'play' } : null;
  }
  return null;
}

/** Valor que o pé não pode apostar, ou `null` se não há restrição agora. */
export function forbiddenBid(state: GameState, playerId: string): number | null {
  const { round, rules } = state;
  if (!rules.dealerRestriction || playerId !== round.dealerId) return null;
  if (round.blind && !rules.dealerRestrictionInBlind) return null;
  const others = round.order
    .filter((id) => id !== playerId)
    .reduce((sum, id) => sum + (round.bids[id] ?? 0), 0);
  const forbidden = round.cards - others;
  return forbidden >= 0 && forbidden <= round.cards ? forbidden : null;
}

export function legalBids(state: GameState, playerId: string): number[] {
  const actor = currentActor(state);
  if (!actor || actor.kind !== 'bid' || actor.playerId !== playerId) return [];
  const forbidden = forbiddenBid(state, playerId);
  const out: number[] = [];
  for (let b = 0; b <= state.round.cards; b++) if (b !== forbidden) out.push(b);
  return out;
}

export function legalCards(state: GameState, playerId: string) {
  const actor = currentActor(state);
  if (!actor || actor.kind !== 'play' || actor.playerId !== playerId) return [];
  return state.round.hands[playerId]?.slice() ?? [];
}

export function maxCardsFor(aliveCount: number, rules: Rules): number {
  const available = DECK_SIZE - (rules.hierarchy === 'vira' ? 1 : 0);
  const byDeck = Math.max(1, Math.floor(available / Math.max(1, aliveCount)));
  return rules.maxCards === null ? byDeck : Math.min(byDeck, rules.maxCards);
}

export function nextProgression(
  current: number,
  direction: 'up' | 'down',
  max: number,
  progression: Progression,
): { cards: number; direction: 'up' | 'down' } {
  if (max <= 1) return { cards: 1, direction: 'up' };
  if (progression === 'up') {
    return { cards: current + 1 > max ? 1 : current + 1, direction: 'up' };
  }
  if (direction === 'up') {
    return current + 1 <= max
      ? { cards: current + 1, direction: 'up' }
      : { cards: Math.min(current - 1, max - 1), direction: 'down' };
  }
  return current - 1 >= 1
    ? { cards: Math.min(current - 1, max), direction: 'down' }
    : { cards: 2, direction: 'up' };
}

/**
 * Decide a vaza.
 * - `cancel` (melar): cartas de mesma força se anulam; vence a maior força que sobrou sozinha.
 *   `cancelled` lista só as anuladas que estavam acima da vencedora.
 * - `nobody`: se as maiores empatam, ninguém leva (`cancelled` = as empatadas no topo).
 * - `suit`: o naipe desempata; nunca há empate.
 */
export function resolveTrick(
  plays: readonly Play[],
  ctx: StrengthCtx,
  tieRule: TieRule,
): { winnerId: string | null; cancelled: string[] } {
  const scored = plays.map((p) => ({
    id: p.playerId,
    s: trickStrength(card(p.cardId), ctx, tieRule),
  }));
  if (scored.length === 0) return { winnerId: null, cancelled: [] };
  const top = Math.max(...scored.map((x) => x.s));
  const tops = scored.filter((x) => x.s === top);
  if (tieRule === 'suit' || tops.length === 1) {
    return { winnerId: tops[0]!.id, cancelled: [] };
  }
  if (tieRule === 'nobody') {
    return { winnerId: null, cancelled: tops.map((x) => x.id) };
  }
  const counts = new Map<number, number>();
  for (const x of scored) counts.set(x.s, (counts.get(x.s) ?? 0) + 1);
  let winner: { id: string; s: number } | undefined;
  for (const x of scored) {
    if (counts.get(x.s) === 1 && (!winner || x.s > winner.s)) winner = x;
  }
  const threshold = winner?.s ?? Number.NEGATIVE_INFINITY;
  const cancelled = scored.filter((x) => counts.get(x.s)! > 1 && x.s > threshold).map((x) => x.id);
  return { winnerId: winner?.id ?? null, cancelled };
}

// ---------------------------------------------------------------------------
// Ações

const MESSAGES: Record<GameErrorCode, string> = {
  GAME_OVER: 'A partida já terminou.',
  WRONG_PHASE: 'Agora não é hora disso.',
  NOT_YOUR_TURN: 'Não é a sua vez.',
  UNKNOWN_PLAYER: 'Jogador desconhecido.',
  INVALID_BID: 'Aposta inválida.',
  FORBIDDEN_BID: 'O pé não pode fechar a soma das apostas.',
  CARD_NOT_IN_HAND: 'Essa carta não está na sua mão.',
  INVALID_ACTION: 'Ação inválida.',
};

function fail(code: GameErrorCode, message?: string): ApplyResult {
  const error: GameError = { code, message: message ?? MESSAGES[code] };
  return { ok: false, error };
}

export function applyAction(state: GameState, action: Action): ApplyResult {
  if (state.phase === 'gameOver') return fail('GAME_OVER');
  switch (action?.type) {
    case 'bid':
      return bid(state, action.playerId, action.value);
    case 'play':
      return play(state, action.playerId, action.cardId);
    case 'continue':
      return advance(state);
    default:
      return fail('INVALID_ACTION');
  }
}

function checkTurn(state: GameState, playerId: string, kind: Actor['kind']): ApplyResult | null {
  if (state.phase !== (kind === 'bid' ? 'bidding' : 'playing')) return fail('WRONG_PHASE');
  if (!state.players.some((p) => p.id === playerId)) return fail('UNKNOWN_PLAYER');
  if (currentActor(state)?.playerId !== playerId) return fail('NOT_YOUR_TURN');
  return null;
}

function bid(state: GameState, playerId: string, value: number): ApplyResult {
  const turnError = checkTurn(state, playerId, 'bid');
  if (turnError) return turnError;
  if (!Number.isInteger(value) || value < 0 || value > state.round.cards) {
    return fail('INVALID_BID');
  }
  if (value === forbiddenBid(state, playerId)) {
    return fail('FORBIDDEN_BID', `O pé não pode pedir ${value}: a soma fecharia ${state.round.cards}.`);
  }
  const s = structuredClone(state);
  s.round.bids[playerId] = value;
  s.round.bidTurn += 1;
  if (s.round.bidTurn >= s.round.order.length) {
    s.phase = 'playing';
    s.round.trick = { leaderId: s.round.order[0]!, plays: [] };
  }
  s.seq += 1;
  return { ok: true, state: s };
}

function play(state: GameState, playerId: string, cardId: unknown): ApplyResult {
  const turnError = checkTurn(state, playerId, 'play');
  if (turnError) return turnError;
  const hand = state.round.hands[playerId] ?? [];
  if (!isCardId(cardId) || !hand.includes(cardId)) return fail('CARD_NOT_IN_HAND');

  const s = structuredClone(state);
  const round = s.round;
  const trick = round.trick!;
  round.hands[playerId] = hand.filter((id) => id !== cardId);
  trick.plays.push({ playerId, cardId });

  if (trick.plays.length === round.order.length) {
    const { winnerId, cancelled } = resolveTrick(trick.plays, strengthCtx(s), s.rules.tieRule);
    const record: TrickRecord = { leaderId: trick.leaderId, plays: trick.plays, winnerId, cancelled };
    round.completedTricks.push(record);
    if (winnerId) round.tricksWon[winnerId] = (round.tricksWon[winnerId] ?? 0) + 1;
    round.trick = null;
    s.phase = 'trickEnd';
  }
  s.seq += 1;
  return { ok: true, state: s };
}

function advance(state: GameState): ApplyResult {
  if (state.phase === 'trickEnd') {
    const s = structuredClone(state);
    const last = s.round.completedTricks.at(-1)!;
    const handsEmpty = s.round.order.every((id) => (s.round.hands[id]?.length ?? 0) === 0);
    if (handsEmpty) {
      finishRound(s);
    } else {
      s.round.trick = { leaderId: last.winnerId ?? last.leaderId, plays: [] };
      s.phase = 'playing';
    }
    s.seq += 1;
    return { ok: true, state: s };
  }
  if (state.phase === 'roundEnd') {
    const s = structuredClone(state);
    if (s.result) {
      s.phase = 'gameOver';
    } else {
      const someoneOut = (s.history.at(-1)?.eliminated.length ?? 0) > 0;
      const max = maxCardsFor(alivePlayers(s).length, s.rules);
      const next =
        someoneOut && s.rules.restartOnElimination
          ? { cards: 1, direction: 'up' as const }
          : nextProgression(s.round.cards, s.direction, max, s.rules.progression);
      s.direction = next.direction;
      dealRound(s, s.round.number + 1, next.cards, nextAliveAfter(s.players, s.round.dealerId));
    }
    s.seq += 1;
    return { ok: true, state: s };
  }
  return fail('WRONG_PHASE');
}

// ---------------------------------------------------------------------------
// Internos (mutam o estado recebido)

function nextAliveAfter(players: PlayerState[], fromId: string): string {
  const start = players.findIndex((p) => p.id === fromId);
  for (let k = 1; k <= players.length; k++) {
    const p = players[(start + k) % players.length]!;
    if (isAlive(p)) return p.id;
  }
  return fromId;
}

function dealRound(s: GameState, number: number, cards: number, dealerId: string): void {
  const n = s.players.length;
  const dealerPos = s.players.findIndex((p) => p.id === dealerId);
  const order: string[] = [];
  for (let k = 1; k <= n; k++) {
    const p = s.players[(dealerPos + k) % n]!;
    if (isAlive(p)) order.push(p.id);
  }
  const rng = createRng(s.rngState);
  const deck = shuffle(
    fullDeck().map((c) => c.id),
    rng,
  );
  const hands: GameState['round']['hands'] = {};
  const bids: GameState['round']['bids'] = {};
  const tricksWon: GameState['round']['tricksWon'] = {};
  order.forEach((id, i) => {
    hands[id] = deck.slice(i * cards, (i + 1) * cards);
    bids[id] = null;
    tricksWon[id] = 0;
  });
  const vira = s.rules.hierarchy === 'vira' ? (deck[order.length * cards] ?? null) : null;
  const blind =
    cards === 1 &&
    (s.rules.blindRound === 'all' || (s.rules.blindRound === 'first' && number === 1));
  s.round = {
    number,
    cards,
    dealerId,
    order,
    vira,
    hands,
    bids,
    bidTurn: 0,
    tricksWon,
    trick: null,
    completedTricks: [],
    blind,
  };
  s.rngState = rng.state;
  s.phase = 'bidding';
}

function finishRound(s: GameState): void {
  const { round, rules } = s;
  const livesBefore: Record<string, number> = {};
  const livesAfter: Record<string, number> = {};
  const bids: Record<string, number> = {};
  const eliminated: string[] = [];
  for (const id of round.order) {
    const p = s.players.find((x) => x.id === id)!;
    const b = round.bids[id] ?? 0;
    const took = round.tricksWon[id] ?? 0;
    const diff = Math.abs(b - took);
    const loss = rules.penalty === 'difference' ? diff : diff > 0 ? 1 : 0;
    livesBefore[id] = p.lives;
    p.lives -= loss;
    livesAfter[id] = p.lives;
    bids[id] = b;
    if (p.lives <= 0) {
      p.eliminatedRound = round.number;
      eliminated.push(id);
    }
  }
  s.history.push({
    number: round.number,
    cards: round.cards,
    dealerId: round.dealerId,
    vira: round.vira,
    bids,
    tricks: { ...round.tricksWon },
    livesBefore,
    livesAfter,
    eliminated,
  });
  if (alivePlayers(s).length <= 1) s.result = computeResult(s);
  s.phase = 'roundEnd';
}

function computeResult(s: GameState): GameResult {
  const alive = alivePlayers(s);
  let winners: string[];
  if (alive.length === 1) {
    winners = [alive[0]!.id];
  } else {
    const lastOut = s.players.filter((p) => p.eliminatedRound === s.round.number);
    const best = Math.max(...lastOut.map((p) => p.lives));
    winners = lastOut.filter((p) => p.lives === best).map((p) => p.id);
  }
  const survived = (p: PlayerState) => p.eliminatedRound ?? Number.POSITIVE_INFINITY;
  const ranking = s.players
    .map((p, index) => ({ p, index }))
    .sort((a, b) => survived(b.p) - survived(a.p) || b.p.lives - a.p.lives || a.index - b.index)
    .map(({ p }) => p.id);
  return { winners, ranking };
}
