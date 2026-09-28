import { fullDeck, type CardId } from '../cards';
import type { BotCtx } from './context';
import { trickWinner } from './sim';

const ALL_IDS: readonly CardId[] = fullDeck().map((c) => c.id);

/**
 * Rodada de 1 carta às cegas: cada um joga a única carta que tem, na ordem da rodada.
 * `cards[seat]` é a carta de cada assento; devolve se `seat` leva a vaza.
 */
function wins(b: BotCtx, cards: readonly CardId[], seat: number): boolean {
  const plays = cards.map((id, i) => ({ seat: i, s: b.s(id) }));
  return trickWinner(plays, b.view.rules.tieRule) === seat;
}

function visibleCardOf(b: BotCtx, seat: number): CardId | null {
  const id = b.order[seat];
  return b.view.players.find((p) => p.id === id)?.visibleCards?.[0] ?? null;
}

/**
 * Probabilidade de a minha carta (que não vejo) levar a vaza.
 * Com `infer`, usa as apostas de quem já apostou (eles viram a minha carta) como evidência.
 */
export function blindWinProbability(b: BotCtx, infer: boolean): number {
  const n = b.order.length;
  const others: (CardId | null)[] = b.order.map((_, seat) =>
    seat === b.meIdx ? null : visibleCardOf(b, seat),
  );
  const candidates = b.unknownIds;
  if (candidates.length === 0) return 0.5;

  const priorBidders = infer
    ? b.order
        .map((_, seat) => seat)
        .filter((seat) => seat !== b.meIdx && b.bids[seat] !== null && b.bids[seat] !== undefined)
    : [];

  let weighted = 0;
  let totalWeight = 0;
  for (const mine of candidates) {
    const table = others.map((c, seat) => (seat === b.meIdx ? mine : c!));
    let weight = 1;
    for (const j of priorBidders) {
      // O que j enxergava: todas as cartas menos a dele (inclusive a minha hipotética).
      const seenByJ = new Set<CardId>(table.filter((_, seat) => seat !== j));
      if (b.view.vira) seenByJ.add(b.view.vira);
      let jWins = 0;
      let jTotal = 0;
      for (const x of ALL_IDS) {
        if (seenByJ.has(x)) continue;
        const hypo = table.slice();
        hypo[j] = x;
        jTotal += 1;
        if (wins(b, hypo, j)) jWins += 1;
      }
      const pj = jTotal > 0 ? jWins / jTotal : 0.5;
      weight *= b.bids[j] === 1 ? 0.1 + 0.8 * pj : 0.9 - 0.8 * pj;
    }
    totalWeight += weight;
    if (wins(b, table, b.meIdx)) weighted += weight;
  }
  if (n <= 1 || totalWeight === 0) return 0.5;
  return weighted / totalWeight;
}

/** Aposta 1 quando a chance de levar é maior que a de não levar. */
export function blindBid(b: BotCtx, pWin: number): number {
  const legal = b.view.legalBids;
  const preferred = pWin >= 0.5 ? 1 : 0;
  return legal.includes(preferred) ? preferred : (legal[0] ?? 0);
}
