import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  currentActor,
  legalBids,
  legalCards,
  maxCardsFor,
  nextProgression,
  resolveTrick,
} from '../src/game';
import type { CardId } from '../src/cards';
import { DEFAULT_RULES, normalizeRules } from '../src/rules';
import { bidAll, cont, newGame, ok, playAll, players, setupRound } from './helpers';

const gaucha = { mode: 'gaucha' as const, vira: null };
const plays = (...ids: CardId[]) => ids.map((cardId, i) => ({ playerId: `p${i}`, cardId }));

describe('createGame', () => {
  it('deals one card each in the first round and starts the bidding after the dealer', () => {
    const s = newGame(4, {}, { firstDealer: 2 });
    expect(s.phase).toBe('bidding');
    expect(s.round.number).toBe(1);
    expect(s.round.cards).toBe(1);
    expect(s.round.dealerId).toBe('p2');
    expect(s.round.order).toEqual(['p3', 'p0', 'p1', 'p2']);
    expect(Object.values(s.round.hands).every((h) => h.length === 1)).toBe(true);
    expect(s.players.every((p) => p.lives === DEFAULT_RULES.startingLives)).toBe(true);
    expect(s.round.blind).toBe(true);
    expect(s.round.vira).not.toBeNull();
    expect(currentActor(s)).toEqual({ playerId: 'p3', kind: 'bid' });
  });

  it('turns a vira that is not in any hand, and none with fixed manilhas', () => {
    expect(newGame(4, { hierarchy: 'gaucha' }).round.vira).toBeNull();
    expect(newGame(4, { hierarchy: 'mineira' }).round.vira).toBeNull();
    const s = newGame(8);
    expect(s.round.vira).not.toBeNull();
    const dealt = Object.values(s.round.hands).flat();
    expect(dealt).not.toContain(s.round.vira);
  });

  it('does not play blind when the rule is off', () => {
    expect(newGame(3, { blindRound: 'off' }).round.blind).toBe(false);
  });

  it('plays blind only in the first round with the "first" option', () => {
    let s = newGame(2, { blindRound: 'first', restartOnElimination: false, maxCards: 2 }, { firstDealer: 0 });
    expect(s.round.blind).toBe(true);
    const finish = (st: typeof s) => {
      let x = st;
      while (x.phase !== 'roundEnd') {
        if (x.phase === 'bidding') x = bidAll(x, [0]);
        else if (x.phase === 'trickEnd') x = cont(x);
        else x = playAll(x, [x.round.hands[currentActor(x)!.playerId]![0]!]);
      }
      return cont(x);
    };
    s = finish(s); // rodada 2: 2 cartas
    expect(s.round.cards).toBe(2);
    s = finish(s); // rodada 3: volta a 1 carta (serrote)
    expect(s.round.cards).toBe(1);
    expect(s.round.blind).toBe(false);
  });

  it('rejects invalid tables', () => {
    expect(() => createGame({ players: players(1), seed: 1 })).toThrow();
    expect(() => createGame({ players: players(9), seed: 1 })).toThrow();
    expect(() =>
      createGame({
        players: [
          { id: 'a', name: 'A' },
          { id: 'a', name: 'B' },
        ],
        seed: 1,
      }),
    ).toThrow();
  });

  it('is deterministic for a seed', () => {
    const a = createGame({ players: players(5), seed: 42 });
    const b = createGame({ players: players(5), seed: 42 });
    expect(a).toEqual(b);
  });
});

describe('apostas', () => {
  it('follows the order and rejects out-of-turn or invalid bids without changing state', () => {
    const s = newGame(3, {}, { firstDealer: 0 }); // ordem p1, p2, p0
    const before = structuredClone(s);
    const outOfTurn = applyAction(s, { type: 'bid', playerId: 'p0', value: 0 });
    expect(outOfTurn.ok).toBe(false);
    if (!outOfTurn.ok) expect(outOfTurn.error.code).toBe('NOT_YOUR_TURN');
    for (const value of [-1, 2, 0.5, Number.NaN]) {
      const r = applyAction(s, { type: 'bid', playerId: 'p1', value });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('INVALID_BID');
    }
    const unknown = applyAction(s, { type: 'bid', playerId: 'zz', value: 0 });
    expect(!unknown.ok && unknown.error.code).toBe('UNKNOWN_PLAYER');
    expect(s).toEqual(before);
  });

  it('dispenses the dealer restriction in the blind round by default', () => {
    let s = newGame(3, {}, { firstDealer: 0 });
    s = bidAll(s, [0, 0]);
    expect(s.round.blind).toBe(true);
    expect(legalBids(s, 'p0')).toEqual([0, 1]);
  });

  it('forbids the dealer from closing the sum (regra do pé)', () => {
    let s = newGame(3, { dealerRestrictionInBlind: true }, { firstDealer: 0 });
    s = bidAll(s, [0, 0]);
    expect(currentActor(s)).toEqual({ playerId: 'p0', kind: 'bid' });
    expect(legalBids(s, 'p0')).toEqual([0]);
    const r = applyAction(s, { type: 'bid', playerId: 'p0', value: 1 });
    expect(!r.ok && r.error.code).toBe('FORBIDDEN_BID');
  });

  it('allows any bid for the dealer when the rule is off', () => {
    let s = newGame(3, { dealerRestriction: false }, { firstDealer: 0 });
    s = bidAll(s, [0, 0]);
    expect(legalBids(s, 'p0')).toEqual([0, 1]);
  });

  it('computes the forbidden value in bigger rounds', () => {
    let s = setupRound(newGame(3, {}, { firstDealer: 0 }), {
      cards: 2,
      hands: { p1: ['C4', 'C5'], p2: ['O4', 'O5'], p0: ['E4', 'E5'] },
    });
    s = bidAll(s, [1, 0]);
    expect(legalBids(s, 'p0')).toEqual([0, 2]);
    expect(legalBids(s, 'p1')).toEqual([]);
  });

  it('starts the play with the player after the dealer once everyone bid', () => {
    let s = newGame(3, {}, { firstDealer: 0 });
    s = bidAll(s, [1, 1, 1]);
    expect(s.phase).toBe('playing');
    expect(currentActor(s)).toEqual({ playerId: 'p1', kind: 'play' });
    expect(legalCards(s, 'p1')).toEqual(s.round.hands.p1);
    expect(legalCards(s, 'p2')).toEqual([]);
  });
});

describe('resolveTrick', () => {
  it('gives the trick to the strongest card, regardless of suit', () => {
    expect(resolveTrick(plays('C3', 'E1', 'O12'), gaucha, 'cancel')).toEqual({
      winnerId: 'p1',
      cancelled: [],
    });
  });

  it('cancels tied top cards and gives the trick to the next one', () => {
    expect(resolveTrick(plays('C3', 'O3', 'C2'), gaucha, 'cancel')).toEqual({
      winnerId: 'p2',
      cancelled: ['p0', 'p1'],
    });
  });

  it('keeps cancelling down the ladder', () => {
    expect(resolveTrick(plays('C3', 'O3', 'C2', 'O2', 'C12'), gaucha, 'cancel')).toEqual({
      winnerId: 'p4',
      cancelled: ['p0', 'p1', 'p2', 'p3'],
    });
  });

  it('gives the trick to nobody when every card is cancelled', () => {
    expect(resolveTrick(plays('C3', 'O3'), gaucha, 'cancel')).toEqual({
      winnerId: null,
      cancelled: ['p0', 'p1'],
    });
  });

  it('does not mark lower ties that did not matter', () => {
    expect(resolveTrick(plays('C4', 'E1', 'O4'), gaucha, 'cancel')).toEqual({
      winnerId: 'p1',
      cancelled: [],
    });
  });

  it('gives the trick to nobody when the top cards tie with the "nobody" rule', () => {
    expect(resolveTrick(plays('C2', 'C3', 'O3'), gaucha, 'nobody')).toEqual({
      winnerId: null,
      cancelled: ['p1', 'p2'],
    });
    expect(resolveTrick(plays('C3', 'C2', 'O2'), gaucha, 'nobody')).toEqual({
      winnerId: 'p0',
      cancelled: [],
    });
  });

  it('breaks ties by suit with the "suit" rule (paus > copas > espadas > ouros)', () => {
    expect(resolveTrick(plays('O3', 'P3', 'C3', 'E3'), gaucha, 'suit').winnerId).toBe('p1');
    expect(resolveTrick(plays('O3', 'E3'), gaucha, 'suit').winnerId).toBe('p1');
  });
});

describe('vazas e fim de rodada', () => {
  const twoCardRound = () =>
    setupRound(newGame(3, { hierarchy: 'gaucha' }, { firstDealer: 0 }), {
      cards: 2,
      // ordem: p1, p2, p0 (pé)
      hands: { p1: ['E1', 'C4'], p2: ['C3', 'O5'], p0: ['O3', 'P6'] },
    });

  it('rejects plays out of phase, out of turn and of cards not in hand', () => {
    const s = twoCardRound();
    const early = applyAction(s, { type: 'play', playerId: 'p1', cardId: 'E1' });
    expect(!early.ok && early.error.code).toBe('WRONG_PHASE');
    const bidding = bidAll(s, [1, 0, 0]);
    const notMine = applyAction(bidding, { type: 'play', playerId: 'p1', cardId: 'C3' });
    expect(!notMine.ok && notMine.error.code).toBe('CARD_NOT_IN_HAND');
    const outOfTurn = applyAction(bidding, { type: 'play', playerId: 'p2', cardId: 'C3' });
    expect(!outOfTurn.ok && outOfTurn.error.code).toBe('NOT_YOUR_TURN');
    const earlyContinue = applyAction(bidding, { type: 'continue' });
    expect(!earlyContinue.ok && earlyContinue.error.code).toBe('WRONG_PHASE');
  });

  it('plays a whole round: winner leads, lives drop by the difference', () => {
    let s = bidAll(twoCardRound(), [2, 0, 1]); // soma 3 ≠ 2 ✔
    s = playAll(s, ['C4', 'O5', 'P6']); // p0 vence com o 6
    expect(s.phase).toBe('trickEnd');
    expect(s.round.completedTricks.at(-1)?.winnerId).toBe('p0');
    s = cont(s);
    expect(s.phase).toBe('playing');
    expect(currentActor(s)?.playerId).toBe('p0');
    s = playAll(s, ['O3', 'E1', 'C3']); // p1 vence com o espadão
    s = cont(s);
    expect(s.phase).toBe('roundEnd');
    const rec = s.history.at(-1)!;
    expect(rec.bids).toEqual({ p1: 2, p2: 0, p0: 1 });
    expect(rec.tricks).toEqual({ p1: 1, p2: 0, p0: 1 });
    expect(rec.livesAfter).toEqual({ p1: 4, p2: 5, p0: 5 });
    expect(s.players.find((p) => p.id === 'p1')?.lives).toBe(4);
  });

  it('keeps the same leader when the whole trick is cancelled', () => {
    let s = setupRound(newGame(2, {}, { firstDealer: 0 }), {
      cards: 2,
      hands: { p1: ['C3', 'C4'], p0: ['O3', 'E5'] },
    });
    s = bidAll(s, [1, 0]);
    s = playAll(s, ['C3', 'O3']);
    expect(s.round.completedTricks[0]).toMatchObject({ winnerId: null, cancelled: ['p1', 'p0'] });
    s = cont(s);
    expect(currentActor(s)?.playerId).toBe('p1');
  });

  it('loses a single life per miss with the fixed penalty', () => {
    let s = setupRound(newGame(2, { penalty: 'fixed', hierarchy: 'gaucha' }, { firstDealer: 0 }), {
      cards: 2,
      hands: { p1: ['C4', 'C5'], p0: ['E1', 'P1'] },
    });
    s = bidAll(s, [2, 1]);
    s = cont(playAll(s, ['C4', 'E1']));
    s = cont(playAll(s, ['P1', 'C5']));
    expect(s.history.at(-1)?.livesAfter).toEqual({ p1: 4, p0: 4 });
  });

  it('moves to the next round with more cards and the next dealer', () => {
    let s = newGame(3, {}, { firstDealer: 0, seed: 5 });
    s = bidAll(s, [0, 0, 0]);
    while (s.phase !== 'roundEnd') {
      s =
        s.phase === 'trickEnd'
          ? cont(s)
          : playAll(s, [s.round.hands[currentActor(s)!.playerId]![0]!]);
    }
    s = cont(s);
    expect(s.phase).toBe('bidding');
    expect(s.round.number).toBe(2);
    expect(s.round.cards).toBe(2);
    expect(s.round.dealerId).toBe('p1');
    expect(s.round.blind).toBe(false);
  });
});

describe('progressão e máximo de cartas', () => {
  it('computes the max from the deck, reserving the vira', () => {
    expect(maxCardsFor(4, normalizeRules({}))).toBe(9);
    expect(maxCardsFor(4, normalizeRules({ hierarchy: 'gaucha' }))).toBe(10);
    expect(maxCardsFor(8, normalizeRules({}))).toBe(4);
    expect(maxCardsFor(8, normalizeRules({ hierarchy: 'mineira' }))).toBe(5);
    expect(maxCardsFor(2, normalizeRules({}))).toBe(19);
    expect(maxCardsFor(2, normalizeRules({ maxCards: 7 }))).toBe(7);
  });

  it('restarts from 1 card after an elimination, unless disabled', () => {
    const playOut = (restartOnElimination: boolean) => {
      let s = newGame(3, { startingLives: 1, hierarchy: 'gaucha', restartOnElimination }, { firstDealer: 0 });
      s = setupRound(s, { cards: 2, hands: { p1: ['E1', 'P1'], p2: ['C4', 'C5'], p0: ['O4', 'O5'] } });
      s = bidAll(s, [0, 0, 0]); // p1 vai fazer 2 tendo pedido 0
      while (s.phase !== 'roundEnd') {
        s = s.phase === 'trickEnd' ? cont(s) : playAll(s, [s.round.hands[currentActor(s)!.playerId]![0]!]);
      }
      return cont(s);
    };
    expect(playOut(true).round.cards).toBe(1);
    expect(playOut(false).round.cards).toBe(3);
  });

  it('goes up and down', () => {
    expect(nextProgression(1, 'up', 3, 'upDown')).toEqual({ cards: 2, direction: 'up' });
    expect(nextProgression(3, 'up', 3, 'upDown')).toEqual({ cards: 2, direction: 'down' });
    expect(nextProgression(2, 'down', 3, 'upDown')).toEqual({ cards: 1, direction: 'down' });
    expect(nextProgression(1, 'down', 3, 'upDown')).toEqual({ cards: 2, direction: 'up' });
    expect(nextProgression(1, 'up', 1, 'upDown')).toEqual({ cards: 1, direction: 'up' });
  });

  it('restarts from 1 with the "up" progression', () => {
    expect(nextProgression(3, 'up', 3, 'up')).toEqual({ cards: 1, direction: 'up' });
    expect(nextProgression(2, 'up', 3, 'up')).toEqual({ cards: 3, direction: 'up' });
  });
});

describe('eliminação e fim de jogo', () => {
  it('ends when a single player is left', () => {
    let s = setupRound(newGame(2, { startingLives: 1, hierarchy: 'gaucha' }, { firstDealer: 0 }), {
      cards: 1,
      hands: { p1: ['E1'], p0: ['C4'] },
    });
    s = bidAll(s, [0, 0]); // pé não pode fechar em 1 → 0 é o único legal? soma 0 ≠ 1 ✔
    s = cont(playAll(s, ['E1', 'C4'])); // p1 fez 1 vaza tendo pedido 0
    expect(s.phase).toBe('roundEnd');
    expect(s.result).toEqual({ winners: ['p0'], ranking: ['p0', 'p1'] });
    s = cont(s);
    expect(s.phase).toBe('gameOver');
    const after = applyAction(s, { type: 'continue' });
    expect(!after.ok && after.error.code).toBe('GAME_OVER');
  });

  it('breaks a simultaneous elimination by remaining lives', () => {
    let s = newGame(2, { startingLives: 2 }, { firstDealer: 0 });
    s = structuredClone(s);
    s.players[0]!.lives = 1; // p0 tem 1 vida, p1 tem 2
    s = setupRound(s, { cards: 2, hands: { p1: ['C3', 'C2'], p0: ['O3', 'O2'] } });
    s = bidAll(s, [2, 2]);
    s = cont(playAll(s, ['C3', 'O3'])); // anula
    s = cont(playAll(s, ['C2', 'O2'])); // anula
    expect(s.history.at(-1)?.livesAfter).toEqual({ p1: 0, p0: -1 });
    expect(s.result).toEqual({ winners: ['p1'], ranking: ['p1', 'p0'] });
  });

  it('declares a draw when the simultaneous elimination is tied', () => {
    let s = setupRound(newGame(2, { startingLives: 1 }, { firstDealer: 0 }), {
      cards: 1,
      hands: { p1: ['C3'], p0: ['O3'] },
    });
    s = bidAll(s, [1, 1]);
    s = cont(playAll(s, ['C3', 'O3']));
    expect(s.result?.winners.slice().sort()).toEqual(['p0', 'p1']);
  });

  it('skips eliminated players when choosing the next dealer and the order', () => {
    let s = newGame(3, { startingLives: 1, hierarchy: 'gaucha' }, { firstDealer: 0 });
    s = setupRound(s, { cards: 1, hands: { p1: ['E1'], p2: ['C4'], p0: ['C5'] } });
    s = bidAll(s, [0, 0, 0]); // p1 erra (faz 1)
    s = cont(playAll(s, ['E1', 'C4', 'C5']));
    expect(s.players.find((p) => p.id === 'p1')?.eliminatedRound).toBe(1);
    s = cont(s);
    expect(s.round.dealerId).toBe('p2');
    expect(s.round.order).toEqual(['p0', 'p2']);
    expect(Object.keys(s.round.hands).sort()).toEqual(['p0', 'p2']);
  });

  it('increments seq on every applied action only', () => {
    const s = newGame(2);
    const bad = applyAction(s, { type: 'continue' });
    expect(bad.ok).toBe(false);
    const good = ok(applyAction(s, { type: 'bid', playerId: currentActor(s)!.playerId, value: 0 }));
    expect(good.seq).toBe(s.seq + 1);
  });
});
