import type { Rng } from '../rng';
import type { BotCtx } from './context';
import { rolloutFrom, sampleHands } from './context';
import { LEVELS, lossFor, simulate } from './sim';

/** Soma, carta a carta, da chance aproximada de ela ganhar uma vaza contra os oponentes. */
export function expectedTricks(
  handS: readonly number[],
  unknown: ArrayLike<number>,
  unknownTotal: number,
  opponents: number,
  tiesLose: boolean,
): number {
  let e = 0;
  for (const s of handS) {
    let beat = 0;
    for (let x = s + 1; x < LEVELS; x++) beat += unknown[x] ?? 0;
    if (tiesLose) beat += unknown[s] ?? 0;
    const q = unknownTotal > 0 ? Math.min(1, beat / unknownTotal) : 0;
    e += (1 - q) ** opponents;
  }
  return e;
}

/** Aproxima `target` dentro das apostas legais (desempata para o lado de `expected`). */
export function nearestLegal(target: number, legal: readonly number[], expected: number): number {
  let best = legal[0] ?? 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const b of legal) {
    const d = Math.abs(b - target) + Math.abs(b - expected) * 0.01;
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

export function heuristicExpected(b: BotCtx): number {
  const opponents = Math.max(1, b.order.length - 1);
  return expectedTricks(
    b.handS,
    b.unknownCounts,
    b.unknownTotal,
    opponents,
    b.view.rules.tieRule !== 'suit',
  );
}

export function heuristicBid(b: BotCtx, noise = 0, rng?: Rng): number {
  const e = heuristicExpected(b);
  const jitter = noise > 0 && rng ? (rng.next() * 2 - 1) * noise : 0;
  const target = Math.max(0, Math.min(b.view.cardsThisRound, Math.round(e + jitter)));
  return nearestLegal(target, b.view.legalBids, e);
}

/** Estima as apostas de quem ainda não apostou, a partir das mãos sorteadas. */
function estimateBids(b: BotCtx, hands: number[][], myBid: number): number[] {
  const cards = b.view.cardsThisRound;
  const deckUnknown = new Int16Array(LEVELS);
  const bids: number[] = [];
  let sum = 0;
  for (let seat = 0; seat < b.order.length; seat++) {
    let bid: number;
    if (seat === b.meIdx) bid = myBid;
    else if (b.bids[seat] !== null && b.bids[seat] !== undefined) bid = b.bids[seat]!;
    else {
      for (let x = 0; x < LEVELS; x++) deckUnknown[x] = (b.totals[x] ?? 0) - (b.seen[x] ?? 0);
      const hand = hands[seat] ?? [];
      for (const s of hand) deckUnknown[s]! -= 1;
      let total = 0;
      for (let x = 0; x < LEVELS; x++) total += deckUnknown[x]!;
      const e = expectedTricks(
        hand,
        deckUnknown,
        total,
        b.order.length - 1,
        b.view.rules.tieRule !== 'suit',
      );
      bid = Math.round(e);
      const isDealer = seat === b.order.length - 1;
      const restricted =
        b.view.rules.dealerRestriction && (!b.view.blind || b.view.rules.dealerRestrictionInBlind);
      if (isDealer && restricted && sum + bid === cards) {
        bid = e >= bid ? bid + 1 : Math.max(0, bid - 1);
        if (bid > cards) bid = cards - 1;
      }
    }
    bids.push(bid);
    sum += bid;
  }
  return bids;
}

export interface McOptions {
  samples: number;
  /** Peso de atrapalhar os outros (0 = só se importa consigo). */
  spite: number;
}

/** Aposta por Monte Carlo: para cada aposta legal, simula a rodada e mede as vidas perdidas. */
export function monteCarloBid(b: BotCtx, rng: Rng, opts: McOptions): number {
  const legal = b.view.legalBids;
  if (legal.length <= 1) return legal[0] ?? 0;
  const penalty = b.view.rules.penalty;
  const scores = new Map<number, number>(legal.map((x) => [x, 0]));
  for (let i = 0; i < opts.samples; i++) {
    const hands = sampleHands(b, rng);
    for (const candidate of legal) {
      const bids = estimateBids(b, hands, candidate);
      const r = rolloutFrom(b, hands, bids);
      simulate(r);
      let score = 0;
      r.seats.forEach((seat, idx) => {
        const lives = b.lives[idx] ?? 1;
        const loss = lossFor(seat.bid, seat.won, lives, penalty);
        score += idx === b.meIdx ? loss : -opts.spite * loss;
      });
      scores.set(candidate, scores.get(candidate)! + score);
    }
  }
  const e = heuristicExpected(b);
  let best = legal[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of legal) {
    const sc = scores.get(candidate)! / opts.samples + Math.abs(candidate - e) * 1e-3;
    if (sc < bestScore) {
      best = candidate;
      bestScore = sc;
    }
  }
  return best;
}
