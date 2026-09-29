import { describe, expect, it } from 'vitest';
import { contextoDaRodada, manilhaDe, manilhasQueimadas } from './manilhas';

describe('efeito das manilhas', () => {
  const gaucha = contextoDaRodada({ hierarchy: 'gaucha' }, null);

  it('cada manilha gaúcha tem o seu efeito e o seu grito', () => {
    expect(manilhaDe('E1', gaucha)).toEqual({ efeito: 'corte', nome: 'Espadão' });
    expect(manilhaDe('P1', gaucha)).toEqual({ efeito: 'pancada', nome: 'Bastião' });
    expect(manilhaDe('E7', gaucha)).toEqual({ efeito: 'aco', nome: 'Sete de espadas' });
    expect(manilhaDe('O7', gaucha)).toEqual({ efeito: 'ouro', nome: 'Sete belo' });
    expect(manilhaDe('C3', gaucha)).toBeNull();
    expect(manilhaDe('C7', gaucha)).toBeNull();
  });

  it('com vira, as quatro do valor seguinte (a de copas pega fogo)', () => {
    const vira = contextoDaRodada({ hierarchy: 'vira' }, 'O6'); // manilha = 7
    expect(manilhaDe('P7', vira)).toEqual({ efeito: 'pancada', nome: 'Zap' });
    expect(manilhaDe('C7', vira)).toEqual({ efeito: 'brasa', nome: 'Copas' });
    expect(manilhaDe('E7', vira)).toEqual({ efeito: 'corte', nome: 'Espadilha' });
    expect(manilhaDe('O7', vira)).toEqual({ efeito: 'ouro', nome: 'Pica-fumo' });
    expect(manilhaDe('E1', vira)).toBeNull();
  });

  it('manilha batida por uma mais forte queimou; empardada ou vencedora, não', () => {
    const trick = {
      plays: [
        { playerId: 'a', cardId: 'P1' as const },
        { playerId: 'b', cardId: 'E1' as const },
        { playerId: 'c', cardId: 'C4' as const },
      ],
      winnerId: 'b',
      cancelled: [],
    };
    expect(manilhasQueimadas(trick, gaucha)).toEqual(['a']);
    expect(manilhasQueimadas({ ...trick, cancelled: ['a'] }, gaucha)).toEqual([]);
    expect(manilhasQueimadas({ ...trick, winnerId: null }, gaucha)).toEqual([]);
  });
});
