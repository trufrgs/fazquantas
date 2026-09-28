import type { HierarchyMode } from './hierarchy';

export type PenaltyMode = 'difference' | 'fixed';
export type TieRule = 'cancel' | 'first';
export type Progression = 'upDown' | 'up';

export interface Rules {
  /** Hierarquia das cartas. */
  hierarchy: HierarchyMode;
  /** Vidas com que cada jogador começa (1–10). */
  startingLives: number;
  /** `difference`: perde |aposta − vazas|; `fixed`: perde 1 vida por erro. */
  penalty: PenaltyMode;
  /** `cancel`: cartas de mesma força se anulam; `first`: vence a primeira jogada. */
  tieRule: TieRule;
  /** Na rodada de 1 carta, cada um vê as cartas dos outros e não a própria. */
  blindOneCardRound: boolean;
  /** O último a apostar (pé) não pode fazer a soma das apostas igualar o nº de cartas. */
  dealerRestriction: boolean;
  /** `upDown`: 1 → máx → 1 → …; `up`: 1 → máx, recomeça em 1. */
  progression: Progression;
  /** Teto de cartas por rodada; `null` = o que o baralho permitir. */
  maxCards: number | null;
}

export const DECK_SIZE = 40;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MIN_LIVES = 1;
export const MAX_LIVES = 10;
export const MAX_CARDS_OPTIONS = [3, 5, 7, 10] as const;

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  hierarchy: 'gaucha',
  startingLives: 5,
  penalty: 'difference',
  tieRule: 'cancel',
  blindOneCardRound: true,
  dealerRestriction: true,
  progression: 'upDown',
  maxCards: null,
});

export type PresetId = 'tradicional' | 'paulista' | 'rapida';

export interface Preset {
  id: PresetId;
  name: string;
  description: string;
  rules: Readonly<Rules>;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'tradicional',
    name: 'Tradicional',
    description: 'Manilhas fixas gaúchas, 5 vidas, cartas sobem e descem.',
    rules: DEFAULT_RULES,
  },
  {
    id: 'paulista',
    name: 'Com vira',
    description: 'A carta seguinte à vira é manilha: paus, copas, espadas, ouros.',
    rules: Object.freeze({ ...DEFAULT_RULES, hierarchy: 'paulista' }),
  },
  {
    id: 'rapida',
    name: 'Rápida',
    description: '3 vidas e no máximo 5 cartas por rodada.',
    rules: Object.freeze({ ...DEFAULT_RULES, startingLives: 3, maxCards: 5 }),
  },
];

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Aceita qualquer entrada e devolve regras válidas (campos inválidos voltam ao padrão). */
export function normalizeRules(input: unknown): Rules {
  const src = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const lives = Number(src.startingLives);
  const maxCards = src.maxCards === null ? null : Number(src.maxCards);
  return {
    hierarchy: pick(src.hierarchy, ['gaucha', 'paulista'], DEFAULT_RULES.hierarchy),
    startingLives:
      Number.isInteger(lives) && lives >= MIN_LIVES && lives <= MAX_LIVES
        ? lives
        : DEFAULT_RULES.startingLives,
    penalty: pick(src.penalty, ['difference', 'fixed'], DEFAULT_RULES.penalty),
    tieRule: pick(src.tieRule, ['cancel', 'first'], DEFAULT_RULES.tieRule),
    blindOneCardRound: bool(src.blindOneCardRound, DEFAULT_RULES.blindOneCardRound),
    dealerRestriction: bool(src.dealerRestriction, DEFAULT_RULES.dealerRestriction),
    progression: pick(src.progression, ['upDown', 'up'], DEFAULT_RULES.progression),
    maxCards:
      maxCards === null || !Number.isInteger(maxCards) || maxCards < 1 || maxCards > 20
        ? null
        : maxCards,
  };
}

export function sameRules(a: Rules, b: Rules): boolean {
  return (Object.keys(a) as (keyof Rules)[]).every((k) => a[k] === b[k]);
}

export function presetOf(rules: Rules): PresetId | null {
  return PRESETS.find((p) => sameRules(p.rules, rules))?.id ?? null;
}
