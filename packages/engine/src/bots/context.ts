import { card, fullDeck, type CardId } from '../cards';
import { strength, type StrengthCtx } from '../hierarchy';
import { shuffle, type Rng } from '../rng';
import type { PlayerView } from '../view';
import { LEVELS, type Rollout, type SeatPlay } from './sim';

const ALL_IDS: readonly CardId[] = fullDeck().map((c) => c.id);

/** Tudo que um bot deriva da própria visão — nunca do estado completo. */
export interface BotCtx {
  view: PlayerView;
  me: string;
  /** Índice do bot em `order`. */
  meIdx: number;
  order: string[];
  ctx: StrengthCtx;
  s: (id: CardId) => number;
  hand: CardId[];
  /** Forças da mão, crescente. */
  handS: number[];
  unknownIds: CardId[];
  unknownCounts: Int16Array;
  unknownTotal: number;
  totals: Uint8Array;
  /** Públicas: jogadas nesta rodada + vira. */
  seen: Uint8Array;
  bids: (number | null)[];
  won: number[];
  handCounts: number[];
  lives: number[];
  /** Jogadas da vaza em andamento, em índices de `order`. */
  trickPlays: SeatPlay[];
  trickLeader: number;
}

export function playedIds(view: PlayerView): CardId[] {
  const out: CardId[] = [];
  for (const t of view.completedTricks) for (const p of t.plays) out.push(p.cardId);
  if (view.trick) for (const p of view.trick.plays) out.push(p.cardId);
  return out;
}

export function buildCtx(view: PlayerView): BotCtx {
  const me = view.you;
  if (!me) throw new Error('Bot sem identidade.');
  const ctx: StrengthCtx = { mode: view.rules.hierarchy, vira: view.vira ? card(view.vira) : null };
  const cache = new Map<CardId, number>();
  const s = (id: CardId) => {
    let v = cache.get(id);
    if (v === undefined) {
      v = strength(card(id), ctx);
      cache.set(id, v);
    }
    return v;
  };
  const order = view.order.slice();
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const hand = view.hand?.slice() ?? [];
  const played = playedIds(view);

  const known = new Set<CardId>([...hand, ...played]);
  if (view.vira) known.add(view.vira);
  for (const p of view.players) for (const id of p.visibleCards ?? []) known.add(id);
  const unknownIds = ALL_IDS.filter((id) => !known.has(id));

  const totals = new Uint8Array(LEVELS);
  for (const id of ALL_IDS) totals[s(id)]! += 1;
  const seen = new Uint8Array(LEVELS);
  for (const id of played) seen[s(id)]! += 1;
  if (view.vira) seen[s(view.vira)]! += 1;
  const unknownCounts = new Int16Array(LEVELS);
  for (const id of unknownIds) unknownCounts[s(id)]! += 1;

  const trickLeader = view.trick ? order.indexOf(view.trick.leaderId) : 0;
  const trickPlays = (view.trick?.plays ?? []).map((p) => ({
    seat: order.indexOf(p.playerId),
    s: s(p.cardId),
  }));

  return {
    view,
    me,
    meIdx: order.indexOf(me),
    order,
    ctx,
    s,
    hand,
    handS: hand.map(s).sort((a, b) => a - b),
    unknownIds,
    unknownCounts,
    unknownTotal: unknownIds.length,
    totals,
    seen,
    bids: order.map((id) => byId.get(id)?.bid ?? null),
    won: order.map((id) => byId.get(id)?.tricks ?? 0),
    handCounts: order.map((id) => byId.get(id)?.handCount ?? 0),
    lives: order.map((id) => byId.get(id)?.lives ?? 1),
    trickPlays,
    trickLeader,
  };
}

/**
 * Sorteia as mãos que o bot não vê, coerentes com o que ele sabe. Devolve as forças de cada
 * assento (crescente). Na rodada às cegas a carta sorteada inclui a do próprio bot.
 */
export function sampleHands(b: BotCtx, rng: Rng): number[][] {
  const pool = shuffle(b.unknownIds, rng);
  let k = 0;
  return b.order.map((id, seat) => {
    if (seat === b.meIdx && !b.view.handHidden) return b.handS.slice();
    const visible = b.view.players.find((p) => p.id === id)?.visibleCards;
    if (visible && seat !== b.meIdx) return visible.map(b.s).sort((x, y) => x - y);
    const count = b.handCounts[seat] ?? 0;
    const taken = pool.slice(k, k + count).map(b.s);
    k += count;
    return taken.sort((x, y) => x - y);
  });
}

/** Rollout a partir do estado atual da rodada, com as mãos sorteadas e as apostas dadas. */
export function rolloutFrom(b: BotCtx, hands: number[][], bids: number[]): Rollout {
  return {
    seats: hands.map((hand, seat) => ({ hand: hand.slice(), bid: bids[seat] ?? 0, won: b.won[seat] ?? 0 })),
    leader: b.view.phase === 'playing' ? b.trickLeader : 0,
    plays: b.view.phase === 'playing' ? b.trickPlays.map((p) => ({ ...p })) : [],
    tieRule: b.view.rules.tieRule,
    totals: b.totals,
    seen: b.seen.slice(),
  };
}
