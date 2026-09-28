import { describe, expect, it } from 'vitest';
import { card, type CardId } from '../src/cards';
import {
  hierarchyGroups,
  isManilha,
  manilhaRank,
  sortByStrength,
  specialName,
  strength,
  type StrengthCtx,
} from '../src/hierarchy';

const gaucha: StrengthCtx = { mode: 'gaucha', vira: null };
const s = (id: CardId, ctx: StrengthCtx = gaucha) => strength(card(id), ctx);

describe('hierarquia gaúcha (manilhas fixas)', () => {
  it('orders the fixed manilhas above everything', () => {
    expect(s('E1')).toBeGreaterThan(s('P1'));
    expect(s('P1')).toBeGreaterThan(s('E7'));
    expect(s('E7')).toBeGreaterThan(s('O7'));
    expect(s('O7')).toBeGreaterThan(s('E3'));
  });

  it('orders the common cards 3 > 2 > false aces > 12 > 11 > 10 > false sevens > 6 > 5 > 4', () => {
    const chain: CardId[] = ['C3', 'C2', 'C1', 'C12', 'C11', 'C10', 'C7', 'C6', 'C5', 'C4'];
    for (let i = 0; i < chain.length - 1; i++) {
      expect(s(chain[i]!)).toBeGreaterThan(s(chain[i + 1]!));
    }
  });

  it('ties cards of the same rank that are not manilhas', () => {
    expect(s('O3')).toBe(s('P3'));
    expect(s('C1')).toBe(s('O1'));
    expect(s('C7')).toBe(s('P7'));
    expect(s('E12')).toBe(s('O12'));
  });

  it('marks and names the four fixed manilhas', () => {
    expect(['E1', 'P1', 'E7', 'O7'].every((id) => isManilha(card(id as CardId), gaucha))).toBe(
      true,
    );
    expect(isManilha(card('C1'), gaucha)).toBe(false);
    expect(specialName(card('E1'), gaucha)).toBe('Espadão');
    expect(specialName(card('P1'), gaucha)).toBe('Bastião');
    expect(specialName(card('E7'), gaucha)).toBe('Sete de espadas');
    expect(specialName(card('O7'), gaucha)).toBe('Sete de ouros');
    expect(specialName(card('C3'), gaucha)).toBeNull();
  });

  it('groups the whole deck in 14 strength levels, strongest first', () => {
    const groups = hierarchyGroups(gaucha);
    expect(groups).toHaveLength(14);
    expect(groups[0]).toEqual(['E1']);
    expect(groups.flat()).toHaveLength(40);
    expect(groups.at(-1)?.slice().sort()).toEqual(['C4', 'E4', 'O4', 'P4']);
  });
});

describe('hierarquia paulista (com vira)', () => {
  const withVira = (vira: CardId): StrengthCtx => ({ mode: 'paulista', vira: card(vira) });

  it('picks the next rank after the vira, cycling after the 3', () => {
    expect(manilhaRank(card('O7'))).toBe(10);
    expect(manilhaRank(card('C3'))).toBe(4);
    expect(manilhaRank(card('E12'))).toBe(1);
    expect(manilhaRank(card('P1'))).toBe(2);
    expect(manilhaRank(card('O4'))).toBe(5);
  });

  it('ranks manilhas above everything with suits paus > copas > espadas > ouros', () => {
    const ctx = withVira('O4'); // manilha = 5
    expect(s('P5', ctx)).toBeGreaterThan(s('C5', ctx));
    expect(s('C5', ctx)).toBeGreaterThan(s('E5', ctx));
    expect(s('E5', ctx)).toBeGreaterThan(s('O5', ctx));
    expect(s('O5', ctx)).toBeGreaterThan(s('P3', ctx));
    expect(isManilha(card('O5'), ctx)).toBe(true);
    expect(isManilha(card('O3'), ctx)).toBe(false);
    expect(specialName(card('P5'), ctx)).toBe('Zap');
    expect(specialName(card('C5'), ctx)).toBe('Copas');
    expect(specialName(card('E5'), ctx)).toBe('Espadilha');
    expect(specialName(card('O5'), ctx)).toBe('Pica-fumo');
  });

  it('uses the base truco order for the other cards and ties suits', () => {
    const ctx = withVira('O4');
    const chain: CardId[] = ['E3', 'E2', 'E1', 'E12', 'E11', 'E10', 'E7', 'E6', 'E4'];
    for (let i = 0; i < chain.length - 1; i++) {
      expect(s(chain[i]!, ctx)).toBeGreaterThan(s(chain[i + 1]!, ctx));
    }
    expect(s('E1', ctx)).toBe(s('P1', ctx));
  });

  it('has 13 strength levels: 4 unique manilhas + 9 tied ranks', () => {
    const groups = hierarchyGroups(withVira('O4'));
    expect(groups.slice(0, 4)).toEqual([['P5'], ['C5'], ['E5'], ['O5']]);
    expect(groups.flat()).toHaveLength(40);
    expect(groups).toHaveLength(13);
  });
});

describe('sortByStrength', () => {
  it('sorts weakest to strongest, breaking ties by suit order', () => {
    const hand = ['E1', 'C4', 'P3', 'O3', 'C12'].map((id) => card(id as CardId));
    expect(sortByStrength(hand, gaucha).map((c) => c.id)).toEqual(['C4', 'C12', 'O3', 'P3', 'E1']);
  });
});
