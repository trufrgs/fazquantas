import { card, fullDeck, type Card, type CardId, type Rank, type Suit } from './cards';
import type { TieRule } from './rules';

/**
 * - `gaucha` (padrão): manilhas fixas do truco gaudério — espadão, bastião, 7 de espadas,
 *   7 de ouros — e depois 3 > 2 > ases falsos > 12 > 11 > 10 > setes falsos > 6 > 5 > 4.
 * - `vira`: manilha variável — as 4 cartas do valor seguinte ao da vira; paus > copas > espadas >
 *   ouros.
 * - `mineira`: manilhas fixas do truco mineiro (4 de paus, 7 de copas, ás de espadas, 7 de ouros).
 */
export type HierarchyMode = 'vira' | 'gaucha' | 'mineira';

export interface StrengthCtx {
  readonly mode: HierarchyMode;
  readonly vira: Card | null;
}

/** Ordem-base do truco, da mais fraca para a mais forte. */
const BASE_ORDER: readonly Rank[] = [4, 5, 6, 7, 10, 11, 12, 1, 2, 3];
/** Naipes do mais fraco para o mais forte (manilhas e desempate por naipe). */
const SUIT_ORDER: readonly Suit[] = ['O', 'E', 'C', 'P'];
const MANILHA_NAMES: Readonly<Record<Suit, string>> = {
  P: 'Zap',
  C: 'Copas',
  E: 'Espadilha',
  O: 'Pica-fumo',
};

interface Fixed {
  strength: number;
  name: string;
}

const FIXED: Readonly<Record<'gaucha' | 'mineira', Partial<Record<CardId, Fixed>>>> = {
  gaucha: {
    E1: { strength: 14, name: 'Espadão' },
    P1: { strength: 13, name: 'Bastião' },
    E7: { strength: 12, name: 'Sete de espadas' },
    O7: { strength: 11, name: 'Sete de ouros' },
  },
  mineira: {
    P4: { strength: 14, name: 'Zap' },
    C7: { strength: 13, name: 'Copas' },
    E1: { strength: 12, name: 'Espadilha' },
    O7: { strength: 11, name: 'Pica-fumo' },
  },
};

/** Cartas comuns na hierarquia gaúcha (1 = mais fraca): sotas abaixo dos cavalos, reis e ases. */
const GAUCHA_COMMON: Readonly<Record<Rank, number>> = {
  3: 10,
  2: 9,
  1: 8,
  12: 7,
  11: 6,
  10: 5,
  7: 4,
  6: 3,
  5: 2,
  4: 1,
};

export function manilhaRank(vira: Card): Rank {
  const i = BASE_ORDER.indexOf(vira.rank);
  return BASE_ORDER[(i + 1) % BASE_ORDER.length]!;
}

/** Força da carta: maior vence; cartas empatadas têm o mesmo número (1–14). */
export function strength(c: Card, ctx: StrengthCtx): number {
  if (ctx.mode === 'vira') {
    if (ctx.vira && c.rank === manilhaRank(ctx.vira)) return 11 + SUIT_ORDER.indexOf(c.suit);
    return BASE_ORDER.indexOf(c.rank) + 1;
  }
  const fixed = FIXED[ctx.mode][c.id];
  if (fixed) return fixed.strength;
  return ctx.mode === 'gaucha' ? GAUCHA_COMMON[c.rank] : BASE_ORDER.indexOf(c.rank) + 1;
}

/**
 * Força usada para decidir a vaza. Com desempate por naipe (`suit`) nenhuma carta empata:
 * dentro do mesmo nível vale ouros < espadas < copas < paus.
 */
export function trickStrength(c: Card, ctx: StrengthCtx, tieRule: TieRule): number {
  const base = strength(c, ctx);
  return tieRule === 'suit' ? base * 4 + SUIT_ORDER.indexOf(c.suit) : base;
}

export function isManilha(c: Card, ctx: StrengthCtx): boolean {
  if (ctx.mode === 'vira') return ctx.vira !== null && c.rank === manilhaRank(ctx.vira);
  return FIXED[ctx.mode][c.id] !== undefined;
}

/** Apelido tradicional da carta, quando ela tem um (Espadão, Zap…). */
export function specialName(c: Card, ctx: StrengthCtx): string | null {
  if (ctx.mode === 'vira') return isManilha(c, ctx) ? MANILHA_NAMES[c.suit] : null;
  return FIXED[ctx.mode][c.id]?.name ?? null;
}

/** Fraca → forte; empate por naipe (ouros, copas, espadas, paus) e depois valor. */
export function sortByStrength(cards: readonly Card[], ctx: StrengthCtx): Card[] {
  return cards
    .slice()
    .sort(
      (a, b) =>
        strength(a, ctx) - strength(b, ctx) ||
        SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) ||
        a.rank - b.rank,
    );
}

/** Baralho agrupado por nível de força, do mais forte para o mais fraco. */
export function hierarchyGroups(ctx: StrengthCtx): CardId[][] {
  const byStrength = new Map<number, CardId[]>();
  for (const c of sortByStrength(fullDeck(), ctx)) {
    const k = strength(c, ctx);
    const group = byStrength.get(k) ?? [];
    group.push(c.id);
    byStrength.set(k, group);
  }
  return [...byStrength.entries()].sort((a, b) => b[0] - a[0]).map(([, ids]) => ids);
}

export function strengthOf(id: CardId, ctx: StrengthCtx): number {
  return strength(card(id), ctx);
}

