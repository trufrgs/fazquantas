/** Naipes do baralho espanhol: ouros, copas, espadas e paus (bastos). */
export type Suit = 'O' | 'C' | 'E' | 'P';
/** Valores do baralho de 40 cartas (sem 8 e 9): 10 = sota, 11 = cavalo, 12 = rei. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
/** Id compacto: naipe + valor, ex. `E1` (ás de espadas), `O7`, `C12`. */
export type CardId = `${Suit}${Rank}`;

export interface Card {
  readonly id: CardId;
  readonly suit: Suit;
  readonly rank: Rank;
}

export const SUITS: readonly Suit[] = ['O', 'C', 'E', 'P'];
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export const SUIT_NAMES: Readonly<Record<Suit, string>> = {
  O: 'ouros',
  C: 'copas',
  E: 'espadas',
  P: 'paus',
};

export const RANK_NAMES: Readonly<Record<Rank, string>> = {
  1: 'Ás',
  2: 'Dois',
  3: 'Três',
  4: 'Quatro',
  5: 'Cinco',
  6: 'Seis',
  7: 'Sete',
  10: 'Sota',
  11: 'Cavalo',
  12: 'Rei',
};

const CARDS = new Map<string, Card>();
for (const suit of SUITS) {
  for (const rank of RANKS) {
    const id = `${suit}${rank}` as CardId;
    CARDS.set(id, Object.freeze({ id, suit, rank }));
  }
}

export function isCardId(value: unknown): value is CardId {
  return typeof value === 'string' && CARDS.has(value);
}

/** Carta canônica (objeto congelado e compartilhado) para um id. */
export function card(id: CardId): Card {
  const found = CARDS.get(id);
  if (!found) throw new Error(`Carta inválida: ${String(id)}`);
  return found;
}

/** Baralho completo, na ordem naipe → valor (novo array a cada chamada). */
export function fullDeck(): Card[] {
  return [...CARDS.values()];
}

export function cardName(c: Card): string {
  return `${RANK_NAMES[c.rank]} de ${SUIT_NAMES[c.suit]}`;
}
