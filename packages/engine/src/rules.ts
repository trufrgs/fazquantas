import type { HierarchyMode } from './hierarchy';

export type PenaltyMode = 'difference' | 'fixed';
/**
 * - `cancel` ("melar"): cartas de mesma força se anulam e vence a maior que sobrou.
 * - `nobody`: se as maiores empatam, ninguém leva a vaza.
 * - `suit`: o naipe desempata tudo (ouros < espadas < copas < paus).
 */
export type TieRule = 'cancel' | 'nobody' | 'suit';
/**
 * Cartas por rodada: `up` = subindo, o serrote (1 → máx, volta a 1); `down` = descendo, começa no
 * máximo (máx → 1, volta ao máx); `upDown` = sobe e desce, a pirâmide (1 → máx → 1 → …).
 */
export type Progression = 'up' | 'down' | 'upDown';
/** Rodada de 1 carta às cegas: todas, só a primeira da partida, ou nenhuma. */
export type BlindRound = 'all' | 'first' | 'off';

export interface Rules {
  hierarchy: HierarchyMode;
  /** Vidas com que cada jogador começa. */
  startingLives: number;
  /** `fixed` (padrão): quem erra perde 1 vida, erre por quanto errar; `difference`: perde |palpite − mãos|. */
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

/**
 * Padrão desde 29/09/2026 (pedido de quem jogou): 3 vidas, e quem erra a cantada perde 1, erre por
 * quanto errar. Antes eram 5 vidas perdendo a diferença, e a partida ficava comprida.
 */
export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  hierarchy: 'gaucha',
  startingLives: 3,
  penalty: 'fixed',
  tieRule: 'nobody',
  blindRound: 'all',
  dealerRestriction: true,
  dealerRestrictionInBlind: false,
  progression: 'up',
  restartOnElimination: true,
  maxCards: null,
});

export type PresetId = 'gaucha' | 'vira' | 'rapida';

export interface Preset {
  id: PresetId;
  name: string;
  description: string;
  rules: Readonly<Rules>;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'gaucha',
    name: 'Gaúcha',
    description: 'Manilhas fixas: espadão, bastião, 7 de espadas e 7 de ouros. 3 vidas; quem erra a cantada perde 1.',
    rules: DEFAULT_RULES,
  },
  {
    id: 'vira',
    name: 'Com vira',
    description: 'A carta seguinte à vira é manilha: paus, copas, espadas, ouros.',
    rules: Object.freeze({ ...DEFAULT_RULES, hierarchy: 'vira' }),
  },
  {
    id: 'rapida',
    name: 'Rápida',
    description: 'Gaúcha com no máximo 5 cartas por rodada.',
    rules: Object.freeze({ ...DEFAULT_RULES, maxCards: 5 }),
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
    progression: pick(src.progression, ['up', 'down', 'upDown'], DEFAULT_RULES.progression),
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
