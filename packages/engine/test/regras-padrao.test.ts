import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, normalizeRules, PRESETS } from '../src/rules';
import { applyAction, currentActor, maxCardsFor, nextProgression } from '../src/game';
import { bidAll, cont, newGame, playAll, setupRound } from './helpers';

/**
 * Pedidos de quem jogou (29/09/2026): partida mais curta por padrão (3 palitos, e quem erra a cantada
 * perde só 1, erre por quanto errar) e a opção de começar com o máximo de cartas e ir descendo.
 */

describe('regra padrão', () => {
  it('3 vidas, e quem erra perde 1 mesmo errando por 2', () => {
    expect(DEFAULT_RULES).toMatchObject({ startingLives: 3, penalty: 'fixed' });
    let s = setupRound(newGame(2, { hierarchy: 'gaucha' }, { firstDealer: 0 }), {
      cards: 2,
      hands: { p1: ['C4', 'C5'], p0: ['E1', 'P1'] },
    });
    s = bidAll(s, [2, 1]); // p1 canta 2 e faz 0: erra por 2
    s = cont(playAll(s, ['C4', 'E1']));
    s = cont(playAll(s, ['P1', 'C5']));
    expect(s.history.at(-1)?.livesAfter).toEqual({ p1: 2, p0: 2 });
  });

  it('os conjuntos prontos seguem o padrão novo', () => {
    const gaucha = PRESETS.find((p) => p.id === 'gaucha')!;
    const rapida = PRESETS.find((p) => p.id === 'rapida')!;
    expect(gaucha.rules).toEqual(DEFAULT_RULES);
    expect(rapida.rules).toMatchObject({ startingLives: 3, penalty: 'fixed', maxCards: 5 });
  });
});

describe('cartas por rodada descendo', () => {
  it('aceita a opção e começa a partida com o máximo de cartas', () => {
    expect(normalizeRules({ progression: 'down' }).progression).toBe('down');
    const s = newGame(4, { progression: 'down' }, { firstDealer: 0 });
    const max = maxCardsFor(4, s.rules);
    expect(s.round.cards).toBe(max);
    expect(s.direction).toBe('down');
    expect(Object.values(s.round.hands).every((h) => h.length === max)).toBe(true);
  });

  it('desce até 1 e volta ao máximo', () => {
    const seq: number[] = [];
    let at = { cards: 4, direction: 'down' as const as 'up' | 'down' };
    for (let i = 0; i < 6; i++) {
      at = nextProgression(at.cards, at.direction, 4, 'down');
      seq.push(at.cards);
    }
    expect(seq).toEqual([3, 2, 1, 4, 3, 2]);
    // As outras seguem como eram.
    expect(nextProgression(4, 'up', 4, 'up').cards).toBe(1);
    expect(nextProgression(4, 'up', 4, 'upDown')).toEqual({ cards: 3, direction: 'down' });
  });

  it('rodada às cegas "só a primeira": a primeira de 1 carta da partida, que vem no fim da descida', () => {
    let s = newGame(2, { progression: 'down', maxCards: 2, blindRound: 'first', dealerRestriction: false, startingLives: 12 }, { firstDealer: 0, seed: 3 });
    const vistas: { cards: number; blind: boolean }[] = [];
    for (let guard = 0; guard < 400 && vistas.length < 4 && s.phase !== 'gameOver'; guard++) {
      if (s.phase === 'bidding' && Object.values(s.round.bids).every((b) => b === null)) vistas.push({ cards: s.round.cards, blind: s.round.blind });
      const actor = currentActor(s);
      if (s.phase === 'bidding' && actor) {
        const r = applyAction(s, { type: 'bid', playerId: actor.playerId, value: 0 });
        if (!r.ok) throw new Error(r.error.code);
        s = r.state;
      } else if (s.phase === 'playing' && actor) {
        s = playAll(s, [s.round.hands[actor.playerId]![0]!]);
      } else s = cont(s);
    }
    expect(vistas).toEqual([
      { cards: 2, blind: false },
      { cards: 1, blind: true },
      { cards: 2, blind: false },
      { cards: 1, blind: false },
    ]);
  });

  it('alguém saiu e a regra manda recomeçar: descendo, recomeça do máximo', () => {
    let s = newGame(3, { progression: 'down', startingLives: 1, hierarchy: 'gaucha', dealerRestriction: false }, { firstDealer: 0 });
    const max3 = maxCardsFor(3, s.rules);
    s = setupRound(s, { cards: 1, hands: { p1: ['E1'], p2: ['C4'], p0: ['C5'] } });
    s = bidAll(s, [0, 0, 0]); // p1 faz 1 cantando 0: sai
    s = cont(playAll(s, ['E1', 'C4', 'C5']));
    expect(s.players.find((p) => p.id === 'p1')?.eliminatedRound).not.toBeNull();
    s = cont(s);
    expect(s.round.cards).toBe(maxCardsFor(2, s.rules));
    expect(s.round.cards).toBeGreaterThanOrEqual(max3);
    expect(s.direction).toBe('down');
  });
});
