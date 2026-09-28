import type { HierarchyMode } from './hierarchy';

export type PenaltyMode = 'difference' | 'fixed';
/**
 * - `cancel` ("melar"): cartas de mesma força se anulam e vence a maior que sobrou.
 * - `nobody`: se as maiores empatam, ninguém leva a vaza.
 * - `suit`: o naipe desempata tudo (ouros < espadas < copas < paus).
 */
export type TieRule = 'cancel' | 'nobody' | 'suit';
/** `up` = serrote (1 → máx, volta a 1); `upDown` = pirâmide (1 → máx → 1 → …). */
export type Progression = 'up' | 'upDown';
/** Rodada de 1 carta às cegas: todas, só a primeira da partida, ou nenhuma. */
export type BlindRound = 'all' | 'first' | 'off';

export interface Rules {
  hierarchy: HierarchyMode;
  /** Vidas com que cada jogador começa. */
  startingLives: number;
  /** `difference`: perde |palpite − vazas|; `fixed`: perde 1 vida por erro. */
  penalty: PenaltyMode;
  tieRule: TieRule;
  blindRound: BlindRound;
  /** O último a palpitar (pé) não pode fazer a soma dos palpites igualar o nº de cartas. */
  dealerRestriction: boolean;
  /** A regra do pé também vale na rodada às cegas. */
  dealerRestrictionInBlind: boolean;
  progression: Progression;
  /** Quando alguém é eliminado, a rodada seguinte recomeça com 1 carta. */
  restartOnElimination: boolean;
  /** Teto de cartas por rodada; `null` = o que o baralho permitir. */
  maxCards: number | null;
}

export const DECK_SIZE = 40;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MIN_LIVES = 1;
export const MAX_LIVES = 12;
export const MAX_CARDS_OPTIONS = [3, 5, 7, 9] as const;

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  hierarchy: 'vira',
  startingLives: 5,
  penalty: 'difference',
  tieRule: 'cancel',
  blindRound: 'all',
  dealerRestriction: true,
  dealerRestrictionInBlind: false,
  progression: 'up',
  restartOnElimination: true,
  maxCards: null,
});

export type PresetId = 'tradicional' | 'gaucha' | 'rapida';

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
    description: 'Com vira, 5 vidas, cartas iguais melam.',
    rules: DEFAULT_RULES,
  },
  {
    id: 'gaucha',
    name: 'Gaúcha',
    description: 'Manilhas fixas do truco gaudério: espadão, bastião, 7 de espadas e 7 de ouros.',
    rules: Object.freeze({ ...DEFAULT_RULES, hierarchy: 'gaucha' }),
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
    hierarchy: pick(src.hierarchy, ['vira', 'gaucha', 'mineira'], DEFAULT_RULES.hierarchy),
    startingLives:
      Number.isInteger(lives) && lives >= MIN_LIVES && lives <= MAX_LIVES
        ? lives
        : DEFAULT_RULES.startingLives,
    penalty: pick(src.penalty, ['difference', 'fixed'], DEFAULT_RULES.penalty),
    tieRule: pick(src.tieRule, ['cancel', 'nobody', 'suit'], DEFAULT_RULES.tieRule),
    blindRound: pick(src.blindRound, ['all', 'first', 'off'], DEFAULT_RULES.blindRound),
    dealerRestriction: bool(src.dealerRestriction, DEFAULT_RULES.dealerRestriction),
    dealerRestrictionInBlind: bool(
      src.dealerRestrictionInBlind,
      DEFAULT_RULES.dealerRestrictionInBlind,
    ),
    progression: pick(src.progression, ['up', 'upDown'], DEFAULT_RULES.progression),
    restartOnElimination: bool(src.restartOnElimination, DEFAULT_RULES.restartOnElimination),
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
