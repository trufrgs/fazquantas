import { card, fullDeck, SUITS, type Card, type CardId, type Rank, type Suit } from './cards';

/**
 * - `gaucha`: manilhas fixas do truco gaudério (espadão, bastião, 7 de espadas, 7 de ouros).
 * - `paulista`: manilha variável — a carta seguinte à vira; naipes paus > copas > espadas > ouros.
 */
export type HierarchyMode = 'gaucha' | 'paulista';

export interface StrengthCtx {
  readonly mode: HierarchyMode;
  readonly vira: Card | null;
}

/** Ordem-base do truco, da mais fraca para a mais forte. */
const BASE_ORDER: readonly Rank[] = [4, 5, 6, 7, 10, 11, 12, 1, 2, 3];
/** Naipes das manilhas paulistas, do mais fraco para o mais forte. */
const MANILHA_SUITS: readonly Suit[] = ['O', 'E', 'C', 'P'];
const MANILHA_NAMES: Readonly<Record<Suit, string>> = {
  P: 'Zap',
  C: 'Copas',
  E: 'Espadilha',
  O: 'Pica-fumo',
};

const GAUCHA_FIXED: Readonly<Partial<Record<CardId, { strength: number; name: string }>>> = {
  E1: { strength: 14, name: 'Espadão' },
  P1: { strength: 13, name: 'Bastião' },
  E7: { strength: 12, name: 'Sete de espadas' },
  O7: { strength: 11, name: 'Sete de ouros' },
};

/** Força das cartas comuns na hierarquia gaúcha (1 = mais fraca). */
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

/** Força da carta: maior vence; cartas empatadas têm o mesmo número. */
export function strength(c: Card, ctx: StrengthCtx): number {
  if (ctx.mode === 'gaucha') {
    return GAUCHA_FIXED[c.id]?.strength ?? GAUCHA_COMMON[c.rank];
  }
  if (ctx.vira && c.rank === manilhaRank(ctx.vira)) {
    return 11 + MANILHA_SUITS.indexOf(c.suit);
  }
  return BASE_ORDER.indexOf(c.rank) + 1;
}

export function isManilha(c: Card, ctx: StrengthCtx): boolean {
  if (ctx.mode === 'gaucha') return GAUCHA_FIXED[c.id] !== undefined;
  return ctx.vira !== null && c.rank === manilhaRank(ctx.vira);
}

/** Apelido tradicional da carta, quando ela tem um (Espadão, Zap…). */
export function specialName(c: Card, ctx: StrengthCtx): string | null {
  if (ctx.mode === 'gaucha') return GAUCHA_FIXED[c.id]?.name ?? null;
  return isManilha(c, ctx) ? MANILHA_NAMES[c.suit] : null;
}

/** Fraca → forte; empate por naipe (ouros, copas, espadas, paus) e depois valor. */
export function sortByStrength(cards: readonly Card[], ctx: StrengthCtx): Card[] {
  return cards
    .slice()
    .sort(
      (a, b) =>
        strength(a, ctx) - strength(b, ctx) ||
        SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) ||
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
