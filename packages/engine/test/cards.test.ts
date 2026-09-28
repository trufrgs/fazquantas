import { describe, expect, it } from 'vitest';
import { card, cardName, fullDeck, isCardId, RANKS, SUITS } from '../src/cards';
import { createRng, shuffle } from '../src/rng';

describe('cards', () => {
  it('builds a 40-card spanish deck without 8 and 9', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(40);
    expect(new Set(deck.map((c) => c.id)).size).toBe(40);
    expect(deck.some((c) => (c.rank as number) === 8 || (c.rank as number) === 9)).toBe(false);
    expect(SUITS).toEqual(['O', 'C', 'E', 'P']);
    expect(RANKS).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 11, 12]);
  });

  it('parses ids into canonical cards', () => {
    expect(card('E1')).toEqual({ id: 'E1', suit: 'E', rank: 1 });
    expect(card('P12')).toEqual({ id: 'P12', suit: 'P', rank: 12 });
    expect(card('O7')).toBe(card('O7'));
  });

  it('validates ids', () => {
    expect(isCardId('C10')).toBe(true);
    expect(isCardId('C8')).toBe(false);
    expect(isCardId('X1')).toBe(false);
    expect(isCardId('')).toBe(false);
    expect(isCardId(42)).toBe(false);
  });

  it('names cards in portuguese', () => {
    expect(cardName(card('E1'))).toBe('Ás de espadas');
    expect(cardName(card('O7'))).toBe('Sete de ouros');
    expect(cardName(card('C10'))).toBe('Sota de copas');
    expect(cardName(card('P11'))).toBe('Cavalo de paus');
    expect(cardName(card('E12'))).toBe('Rei de espadas');
  });
});

describe('rng', () => {
  it('is deterministic for a seed and resumable from its state', () => {
    const a = createRng(123);
    const seqA = [a.next(), a.next(), a.next()];
    const b = createRng(123);
    expect([b.next(), b.next(), b.next()]).toEqual(seqA);

    const c = createRng(99);
    c.next();
    const resumed = createRng(c.state);
    expect(resumed.next()).toBe(c.next());
  });

  it('produces values in [0, 1) and ints in range', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(5);
      expect(Number.isInteger(n) && n >= 0 && n < 5).toBe(true);
    }
  });

  it('shuffles deterministically without losing elements', () => {
    const deck = fullDeck().map((c) => c.id);
    const s1 = shuffle(deck, createRng(1));
    const s2 = shuffle(deck, createRng(1));
    expect(s1).toEqual(s2);
    expect(s1).not.toEqual(deck);
    expect([...s1].sort()).toEqual([...deck].sort());
    expect(deck[0]).toBe('O1');
  });
});
