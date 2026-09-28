import type { CardId } from '../cards';
import type { Rng } from '../rng';
import { mcSamples, type McOptions } from './bid';
import type { BotCtx } from './context';
import { rolloutFrom, sampleHands } from './context';
import { choosePlayIndex, lossFor, simulate, type Opponent } from './sim';

/** Uma carta de cada força presente na mão (cartas de mesma força são equivalentes). */
function representatives(b: BotCtx): Map<number, CardId> {
  const out = new Map<number, CardId>();
  for (const id of b.view.legalCards) if (!out.has(b.s(id))) out.set(b.s(id), id);
  return out;
}

function opponentsAfter(b: BotCtx): Opponent[] {
  const n = b.order.length;
  const out: Opponent[] = [];
  const played = b.trickPlays.length;
  for (let k = played + 1; k < n; k++) {
    const seat = (b.trickLeader + k) % n;
    out.push({ handCount: b.handCounts[seat] ?? 0, need: (b.bids[seat] ?? 0) - (b.won[seat] ?? 0) });
  }
  return out;
}

export function policyPlay(b: BotCtx): CardId {
  const reps = representatives(b);
  const levels = [...reps.keys()].sort((x, y) => x - y);
  const handS = b.handS.filter((s) => reps.has(s));
  const idx = choosePlayIndex({
    hand: handS,
    plays: b.trickPlays,
    me: b.meIdx,
    after: opponentsAfter(b),
    need: (b.bids[b.meIdx] ?? 0) - (b.won[b.meIdx] ?? 0),
    unknown: b.unknownCounts,
    unknownTotal: b.unknownTotal,
    tieRule: b.view.rules.tieRule,
  });
  const s = handS[idx] ?? levels[0]!;
  return reps.get(s)!;
}

export function randomPlay(b: BotCtx, rng: Rng): CardId {
  const legal = b.view.legalCards;
  return legal[rng.int(legal.length)]!;
}

export function monteCarloPlay(b: BotCtx, rng: Rng, opts: McOptions): CardId {
  const reps = representatives(b);
  if (reps.size <= 1) return b.view.legalCards[0]!;
  const penalty = b.view.rules.penalty;
  const bids = b.bids.map((x) => x ?? 0);
  const scores = new Map<number, number>([...reps.keys()].map((s) => [s, 0]));
  const cardsLeft = b.view.hand?.length ?? b.view.cardsThisRound;
  const samples = mcSamples(opts.samples, reps.size, cardsLeft, b.order.length);
  for (let i = 0; i < samples; i++) {
    const hands = sampleHands(b, rng);
    for (const s of reps.keys()) {
      const r = rolloutFrom(b, hands, bids);
      simulate(r, { seat: b.meIdx, s });
      let score = 0;
      r.seats.forEach((seat, idx) => {
        const loss = lossFor(seat.bid, seat.won, b.lives[idx] ?? 1, penalty);
        score += idx === b.meIdx ? loss : -opts.spite * loss;
      });
      scores.set(s, scores.get(s)! + score);
    }
  }
  const fallback = policyPlay(b);
  let best = fallback;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [s, id] of reps) {
    // Leve preferência pela escolha da política para desempatar ruído.
    const sc = scores.get(s)! / samples - (id === fallback ? 1e-3 : 0);
    if (sc < bestScore) {
      best = id;
      bestScore = sc;
    }
  }
  return best;
}
