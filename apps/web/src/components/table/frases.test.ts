import { describe, expect, it } from 'vitest';
import { alternarFavorita, galoDeUmToque, sugestoesDeGalo } from './frases';
import { contextoDaRodada } from './manilhas';

const gaucha = contextoDaRodada({ hierarchy: 'gaucha' }, null);

describe('frases da mesa', () => {
  it('o "é galo" sugere o valor das cartas da mesa, da que está levando a mão para a mais fraca, e o genérico no fim', () => {
    expect(sugestoesDeGalo(['C7', 'O4', 'P12', 'E4'], gaucha)).toEqual(['galo-12', 'galo-7', 'galo-4', 'galo']);
    // Manilha não é galo; mesa vazia, só o genérico.
    expect(sugestoesDeGalo(['E1', 'O7', 'C3'], gaucha)).toEqual(['galo-3', 'galo']);
    expect(sugestoesDeGalo([], gaucha)).toEqual(['galo']);
  });

  it('a favorita de um toque manda a carta que está levando a mão; com manilha levando ou mesa vazia, o genérico', () => {
    expect(galoDeUmToque(['O5', 'C4'], gaucha)).toBe('galo-5');
    expect(galoDeUmToque(['C4', 'O12', 'P6'], gaucha)).toBe('galo-12');
    expect(galoDeUmToque(['O5', 'E1'], gaucha)).toBe('galo');
    expect(galoDeUmToque([], gaucha)).toBe('galo');
  });

  it('no máximo três favoritas: a mais antiga sai para a nova entrar; tocar de novo tira', () => {
    expect(alternarFavorita(['galo', 'cagao', 'masbah'], 'fdp')).toEqual(['cagao', 'masbah', 'fdp']);
    expect(alternarFavorita(['galo', 'cagao'], 'cagao')).toEqual(['galo']);
  });
});
