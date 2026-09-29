import { PRESETS, normalizeRules, sameRules, type PresetId, type Rules } from '@fodinha/engine';

/**
 * Os conjuntos prontos como eram até 29/09/2026 (5 vidas, perdendo a diferença; a "Rápida" com 3
 * vidas e até 5 cartas). O padrão virou 3 vidas perdendo 1 por erro, a pedido de quem jogou.
 */
const ANTES: Rules = {
  hierarchy: 'gaucha',
  startingLives: 5,
  penalty: 'difference',
  tieRule: 'nobody',
  blindRound: 'all',
  dealerRestriction: true,
  dealerRestrictionInBlind: false,
  progression: 'up',
  restartOnElimination: true,
  maxCards: null,
};

const ANTIGOS: readonly [Rules, PresetId][] = [
  [ANTES, 'gaucha'],
  [{ ...ANTES, hierarchy: 'vira' }, 'vira'],
  [{ ...ANTES, startingLives: 3, maxCards: 5 }, 'rapida'],
];

/**
 * Quem nunca mexeu nas regras (estava num conjunto pronto antigo) passa para o mesmo conjunto com o
 * padrão novo; quem ajustou alguma coisa fica como estava.
 */
export function atualizarRegrasAntigas(input: unknown): Rules {
  const regras = normalizeRules(input);
  const era = ANTIGOS.find(([antigo]) => sameRules(antigo, regras))?.[1];
  const novo = era ? PRESETS.find((p) => p.id === era)?.rules : undefined;
  return novo ? { ...novo } : regras;
}
