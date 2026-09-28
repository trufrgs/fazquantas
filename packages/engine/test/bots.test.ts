import { describe, expect, it } from 'vitest';
import { decideBot, suggest, type BotDifficulty } from '../src/bots';
import { blindWinProbability } from '../src/bots/blind';
import { buildCtx } from '../src/bots/context';
import { fullDeck, type CardId } from '../src/cards';
import { applyAction, createGame, currentActor } from '../src/game';
import { createRng, shuffle } from '../src/rng';
import type { Rules } from '../src/rules';
import type { GameState } from '../src/types';
import { getPlayerView } from '../src/view';
import { bidAll, newGame, players, setupRound } from './helpers';

/** Joga uma partida inteira só com bots, validando que toda decisão é legal. */
function botGame(
  difficulties: BotDifficulty[],
  rules: Partial<Rules>,
  seed: number,
): { state: GameState; lossByDifficulty: Record<string, number[]> } {
  const rng = createRng(seed ^ 0x9e3779b9);
  let state = createGame({ players: players(difficulties.length), rules, seed });
  const lossByDifficulty: Record<string, number[]> = {};
  let guard = 0;
  while (state.phase !== 'gameOver') {
    if (++guard > 20_000) throw new Error('partida não terminou');
    if (state.phase === 'trickEnd' || state.phase === 'roundEnd') {
      if (state.phase === 'roundEnd') {
        const rec = state.history.at(-1)!;
        for (const id of Object.keys(rec.bids)) {
          const d = difficulties[Number(id.slice(1))]!;
          (lossByDifficulty[d] ??= []).push(rec.livesBefore[id]! - rec.livesAfter[id]!);
        }
      }
      const r = applyAction(state, { type: 'continue' });
      if (!r.ok) throw new Error(r.error.code);
      state = r.state;
      continue;
    }
    const actor = currentActor(state)!;
    const difficulty = difficulties[Number(actor.playerId.slice(1))]!;
    const view = getPlayerView(state, actor.playerId);
    const action = decideBot(view, difficulty, rng) ?? {
      type: 'play' as const,
      playerId: actor.playerId,
      cardId: state.round.hands[actor.playerId]![0]!,
    };
    const r = applyAction(state, action);
    if (!r.ok) throw new Error(`${difficulty} fez jogada ilegal: ${r.error.code}`);
    state = r.state;
  }
  return { state, lossByDifficulty };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('bots', () => {
  it('only make legal moves across many games and rule sets', () => {
    const ruleSets: Partial<Rules>[] = [
      {},
      { hierarchy: 'paulista' },
      { tieRule: 'first', penalty: 'fixed' },
      { blindOneCardRound: false, dealerRestriction: false, progression: 'up' },
      { maxCards: 3, startingLives: 2 },
    ];
    let games = 0;
    for (const [i, rules] of ruleSets.entries()) {
      for (let n = 2; n <= 8; n += 3) {
        const diffs: BotDifficulty[] = Array.from({ length: n }, (_, k) =>
          (['facil', 'medio', 'dificil'] as const)[(k + i) % 3]!,
        );
        const { state } = botGame(diffs, { startingLives: 2, maxCards: 5, ...rules }, 100 + i * 10 + n);
        expect(state.result?.winners.length).toBeGreaterThan(0);
        games++;
      }
    }
    expect(games).toBe(15);
  });

  it('bets 0 in the blind round when the cards it sees are unbeatable', () => {
    const s = bidAll(
      setupRound(newGame(3, {}, { firstDealer: 2 }), {
        cards: 1,
        hands: { p0: ['C4'], p1: ['E1'], p2: ['P1'] },
      }),
      [],
    );
    const view = getPlayerView(s, 'p0');
    for (const d of ['facil', 'medio', 'dificil'] as const) {
      const action = decideBot(view, d, createRng(3));
      expect(action).toEqual({ type: 'bid', playerId: 'p0', value: 0 });
    }
  });

  it('bets 1 in the blind round when the cards it sees are the weakest', () => {
    const s = setupRound(newGame(3, {}, { firstDealer: 2 }), {
      cards: 1,
      hands: { p0: ['C5'], p1: ['O4'], p2: ['E6'] },
    });
    const view = getPlayerView(s, 'p0');
    expect(decideBot(view, 'medio', createRng(1))).toEqual({
      type: 'bid',
      playerId: 'p0',
      value: 1,
    });
  });

  it('reads the table in the blind round: a 0 from someone who saw my card means it is strong', () => {
    let s = setupRound(newGame(2, { dealerRestriction: false }, { firstDealer: 0 }), {
      cards: 1,
      hands: { p1: ['C12'], p0: ['E3'] },
    });
    s = bidAll(s, [0]);
    const b = buildCtx(getPlayerView(s, 'p0'));
    const naive = blindWinProbability(b, false);
    const informed = blindWinProbability(b, true);
    expect(naive).toBeLessThan(0.5);
    expect(informed).toBeGreaterThan(naive + 0.1);
  });

  it('suggests legal moves for humans', () => {
    let s = setupRound(newGame(3, {}, { firstDealer: 0 }), {
      cards: 3,
      hands: { p1: ['E1', 'C4', 'O5'], p2: ['C3', 'O6', 'P10'], p0: ['O3', 'P6', 'C11'] },
    });
    const bid = suggest(getPlayerView(s, 'p1'), createRng(1)).bid;
    expect(getPlayerView(s, 'p1').legalBids).toContain(bid);
    s = bidAll(s, [1, 1, 0]);
    const cardId = suggest(getPlayerView(s, 'p1'), createRng(1)).cardId as CardId;
    expect(s.round.hands.p1).toContain(cardId);
    expect(suggest(getPlayerView(s, 'p2'), createRng(1))).toEqual({});
  });

  it('keeps hard decisions fast', () => {
    const cases = [
      { n: 8, cards: 5 },
      { n: 2, cards: 20 },
      { n: 4, cards: 10 },
    ];
    for (const { n, cards } of cases) {
      const s = structuredClone(newGame(n, {}, { firstDealer: 0, seed: 11 }));
      const shuffled = shuffle(
        fullDeck().map((c) => c.id),
        createRng(5),
      );
      s.round.cards = cards;
      s.round.blind = false;
      s.round.order.forEach((id, i) => {
        s.round.hands[id] = shuffled.slice(i * cards, (i + 1) * cards);
      });
      const view = getPlayerView(s, s.round.order[0]!);
      const t0 = Date.now();
      const action = decideBot(view, 'dificil', createRng(9));
      const elapsed = Date.now() - t0;
      expect(action?.type).toBe('bid');
      expect(elapsed).toBeLessThan(400);
    }
  });

  it('hard bots lose fewer lives than easy ones', () => {
    const loss: Record<string, number[]> = { facil: [], dificil: [] };
    for (let g = 0; g < 24; g++) {
      const diffs: BotDifficulty[] =
        g % 2 === 0 ? ['facil', 'dificil', 'facil', 'dificil'] : ['dificil', 'facil', 'dificil', 'facil'];
      const { lossByDifficulty } = botGame(diffs, { startingLives: 5, maxCards: 6 }, 900 + g);
      loss.facil!.push(...(lossByDifficulty.facil ?? []));
      loss.dificil!.push(...(lossByDifficulty.dificil ?? []));
    }
    expect(mean(loss.dificil!)).toBeLessThan(mean(loss.facil!));
  }, 120_000);
});
