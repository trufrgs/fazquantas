import { DEFAULT_RULES, PRESETS } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { atualizarRegrasAntigas } from './regras-antigas';

const antes = {
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

describe('regras guardadas do padrão antigo', () => {
  it('quem estava no padrão antigo (gaúcha, com vira ou rápida) passa para o novo', () => {
    expect(atualizarRegrasAntigas(antes)).toEqual(DEFAULT_RULES);
    expect(atualizarRegrasAntigas({ ...antes, hierarchy: 'vira' })).toEqual(PRESETS.find((p) => p.id === 'vira')!.rules);
    expect(atualizarRegrasAntigas({ ...antes, startingLives: 3, maxCards: 5 })).toEqual(PRESETS.find((p) => p.id === 'rapida')!.rules);
  });

  it('quem ajustou alguma coisa fica como estava', () => {
    expect(atualizarRegrasAntigas({ ...antes, startingLives: 7 })).toMatchObject({ startingLives: 7, penalty: 'difference' });
    expect(atualizarRegrasAntigas({ ...antes, tieRule: 'cancel' })).toMatchObject({ startingLives: 5, tieRule: 'cancel' });
  });
});
