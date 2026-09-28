import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../src/view';
import { bidAll, newGame, setupRound } from './helpers';

const threeCards = () =>
  setupRound(newGame(3, {}, { firstDealer: 0 }), {
    cards: 2,
    hands: { p1: ['E1', 'C4'], p2: ['C3', 'O5'], p0: ['O3', 'P6'] },
  });

describe('getPlayerView', () => {
  it('shows only your own hand in a normal round', () => {
    const v = getPlayerView(threeCards(), 'p1');
    expect(v.hand).toEqual(['E1', 'C4']);
    expect(v.handHidden).toBe(false);
    const others = v.players.filter((p) => p.id !== 'p1');
    expect(others.every((p) => p.visibleCards === null && p.handCount === 2)).toBe(true);
    const json = JSON.stringify(v);
    for (const hidden of ['C3', 'O5', 'O3', 'P6']) expect(json).not.toContain(`"${hidden}"`);
    expect(json).not.toContain('rngState');
  });

  it('hides your own card and shows the others in the blind round', () => {
    const s = setupRound(newGame(3, {}, { firstDealer: 0 }), {
      cards: 1,
      hands: { p1: ['E1'], p2: ['C3'], p0: ['O3'] },
    });
    const v = getPlayerView(s, 'p2');
    expect(v.blind).toBe(true);
    expect(v.hand).toBeNull();
    expect(v.handHidden).toBe(true);
    expect(v.players.find((p) => p.id === 'p2')?.visibleCards).toBeNull();
    expect(v.players.find((p) => p.id === 'p1')?.visibleCards).toEqual(['E1']);
    expect(v.players.find((p) => p.id === 'p0')?.visibleCards).toEqual(['O3']);
    expect(JSON.stringify(v)).not.toContain('"C3"');
  });

  it('gives spectators only public information, except the blind round cards', () => {
    const normal = getPlayerView(threeCards(), null);
    expect(normal.hand).toBeNull();
    expect(normal.players.every((p) => p.visibleCards === null)).toBe(true);

    const blind = setupRound(newGame(2, {}, { firstDealer: 0 }), {
      cards: 1,
      hands: { p1: ['E1'], p0: ['C3'] },
    });
    const v = getPlayerView(blind, null);
    expect(v.players.map((p) => p.visibleCards)).toEqual([['C3'], ['E1']]);
  });

  it('reveals every hand with revealAll (local spectator mode)', () => {
    const v = getPlayerView(threeCards(), null, { revealAll: true });
    expect(v.players.map((p) => p.visibleCards)).toEqual([
      ['O3', 'P6'],
      ['E1', 'C4'],
      ['C3', 'O5'],
    ]);
  });

  it('gives no hand to an eliminated viewer', () => {
    const s = structuredClone(threeCards());
    s.players[1]!.eliminatedRound = 1;
    expect(getPlayerView(s, 'p1').hand).toBeNull();
  });

  it('lists legal bids only for the player on turn and exposes the forbidden bid', () => {
    let s = threeCards();
    expect(getPlayerView(s, 'p1').legalBids).toEqual([0, 1, 2]);
    expect(getPlayerView(s, 'p2').legalBids).toEqual([]);
    s = bidAll(s, [1, 0]);
    const dealer = getPlayerView(s, 'p0');
    expect(dealer.actor).toEqual({ playerId: 'p0', kind: 'bid' });
    expect(dealer.forbiddenBid).toBe(1);
    expect(dealer.legalBids).toEqual([0, 2]);
    expect(dealer.bidsSum).toBe(1);
    expect(getPlayerView(s, 'p1').forbiddenBid).toBe(1);
  });

  it('lists legal cards for the player on turn, but never in the blind round', () => {
    const s = bidAll(threeCards(), [1, 0, 0]);
    expect(getPlayerView(s, 'p1').legalCards).toEqual(['E1', 'C4']);
    expect(getPlayerView(s, 'p2').legalCards).toEqual([]);

    let blind = setupRound(newGame(2, {}, { firstDealer: 0 }), {
      cards: 1,
      hands: { p1: ['E1'], p0: ['C3'] },
    });
    blind = bidAll(blind, [0, 0]);
    expect(getPlayerView(blind, 'p1').legalCards).toEqual([]);
    expect(getPlayerView(blind, 'p1').actor).toEqual({ playerId: 'p1', kind: 'play' });
  });

  it('carries the vira and the manilha rank in the paulista mode', () => {
    const s = setupRound(newGame(3, { hierarchy: 'paulista' }, { firstDealer: 0 }), {
      cards: 2,
      hands: { p1: ['E1', 'C4'], p2: ['C3', 'O5'], p0: ['O3', 'P6'] },
      vira: 'C7',
    });
    const v = getPlayerView(s, 'p0');
    expect(v.vira).toBe('C7');
    expect(v.manilhaRank).toBe(10);
    expect(getPlayerView(threeCards(), 'p0').manilhaRank).toBeNull();
  });

  it('passes the turn deadline through', () => {
    expect(getPlayerView(threeCards(), 'p1', { turnDeadline: 123 }).turnDeadline).toBe(123);
  });
});
