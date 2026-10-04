import { DEFAULT_RULES, type PlayerView, type PublicPlayer, type RoundRecord } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { contextoDaRodada } from '../manilhas';
import { CONTAS_VAZIAS, dataEspecial, jornalDaNoite, quatroManilhas, trofeusDaNoite } from './noite';

const jog = (i: number, lives: number, eliminatedRound: number | null = null): PublicPlayer => ({
  id: `p${i}`,
  name: ['Ana', 'Beto', 'Caio', 'Dani'][i]!,
  lives,
  eliminated: eliminatedRound !== null,
  eliminatedRound,
  inRound: eliminatedRound === null,
  isDealer: false,
  bid: null,
  tricks: 0,
  handCount: 0,
  visibleCards: null,
});
const rodada = (n: number, linhas: Record<string, [number, number, number]>): RoundRecord => ({
  number: n,
  cards: 3,
  dealerId: 'p0',
  vira: null,
  bids: Object.fromEntries(Object.entries(linhas).map(([id, l]) => [id, l[0]])),
  tricks: Object.fromEntries(Object.entries(linhas).map(([id, l]) => [id, l[1]])),
  livesBefore: Object.fromEntries(Object.entries(linhas).map(([id, l]) => [id, l[2]])),
  livesAfter: Object.fromEntries(Object.entries(linhas).map(([id, l]) => [id, l[2]])),
  eliminated: [],
});
function fim(history: RoundRecord[], players: PublicPlayer[], winners = ['p0']): PlayerView {
  return {
    seq: 9, you: 'p0', rules: { ...DEFAULT_RULES }, phase: 'gameOver', roundNumber: history.length, cardsThisRound: 1, direction: 'up', dealerId: 'p0',
    order: players.map((p) => p.id), vira: null, manilhaRank: null, blind: false, players, hand: null, handHidden: false, trick: null,
    completedTricks: [], lastTrick: null, actor: null, legalBids: [], legalCards: [], forbiddenBid: null, bidsSum: 0, history,
    result: { winners, ranking: players.map((p) => p.id) }, turnDeadline: null,
  };
}

describe('troféus da noite', () => {
  const players = [jog(0, 2), jog(1, 0, 3), jog(2, 0, 2)];
  const history = [
    rodada(1, { p0: [1, 1, 3], p1: [0, 1, 3], p2: [0, 0, 3] }),
    rodada(2, { p0: [2, 2, 3], p1: [0, 2, 2], p2: [0, 1, 1] }),
    rodada(3, { p0: [1, 1, 3], p1: [0, 0, 1] }),
  ];

  it('cada troféu com uma pessoa diferente, no máximo quatro', () => {
    const t = trofeusDaNoite(fim(history, players), { ...CONTAS_VAZIAS, mortes: { p2: 4 }, espera: { p0: 3 } });
    expect(t.map((x) => [x.id, x.quem])).toEqual([
      ['cagao', 'p1'],
      ['acougueiro', 'p2'],
      ['tartaruga', 'p0'],
    ]);
    expect(t[0]!.detalhe).toBe('3 zeros cantados');
  });

  it('empate no topo: ninguém leva', () => {
    const t = trofeusDaNoite(fim(history, players), { ...CONTAS_VAZIAS, mortes: { p0: 3, p2: 3 } });
    expect(t.some((x) => x.id === 'acougueiro')).toBe(false);
  });

  it('fênix: ganhou depois de três rodadas no último palito, e vem primeiro', () => {
    const h = [1, 2, 3].map((n) => rodada(n, { p0: [1, 1, 1], p1: [0, 1, 3] }));
    const t = trofeusDaNoite(fim(h, [jog(0, 1), jog(1, 0, 3)]), CONTAS_VAZIAS);
    expect(t[0]).toMatchObject({ id: 'fenix', quem: 'p0' });
  });

  it('o jornal: manchete do vencedor, nota de quem saiu primeiro, classificados dos troféus', () => {
    const j = jornalDaNoite(fim(history, players), { ...CONTAS_VAZIAS, mortes: { p2: 4 } }, new Date('2026-10-04T23:00:00Z'))!;
    expect(j.manchete).toBe('ANA É PATRÃO DA NOITE');
    expect(j.nota).toBe('Caio sai na 2ª rodada e culpa o baralho.');
    expect(j.classificados[0]).toContain('Caio');
    expect(j.classificados.length).toBeLessThanOrEqual(2);
  });
});

describe('datas e lances raros', () => {
  it('datas no horário de Brasília', () => {
    expect(dataEspecial(new Date('2026-09-20T15:00:00Z'))).toBe('farroupilha');
    expect(dataEspecial(new Date('2026-04-24T15:00:00Z'))).toBe('churrasco');
    expect(dataEspecial(new Date('2026-11-13T15:00:00Z'))).toBe('sexta13');
    // 04h BRT = 07h UTC
    expect(dataEspecial(new Date('2026-10-05T07:00:00Z'))).toBe('madrugada');
    expect(dataEspecial(new Date('2026-10-05T15:00:00Z'))).toBeNull();
  });

  it('as quatro manilhas gaúchas na mesma mão', () => {
    const ctx = contextoDaRodada(DEFAULT_RULES, null);
    const m = (ids: string[]) => ids.map((cardId, i) => ({ playerId: `p${i}`, cardId })) as never;
    expect(quatroManilhas(m(['O7', 'P1', 'E7', 'E1']), ctx)).toBe(true);
    expect(quatroManilhas(m(['O7', 'P1', 'E7', 'C4']), ctx)).toBe(false);
  });
});
