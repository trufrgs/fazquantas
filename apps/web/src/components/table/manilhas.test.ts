import { DEFAULT_TIMING, type CardId } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import {
  acertoDe,
  chaveDoGolpe,
  contextoDaRodada,
  golpeComAnimacao,
  golpesDaMao,
  manilhaDe,
  mandaNaMesa,
  mesaMudou,
  mesaVista,
  TEMPO_GOLPE,
  vitimasEmOrdem,
  type MesaVista,
} from './manilhas';

const gaucha = contextoDaRodada({ hierarchy: 'gaucha' }, null);
/** A mão na ordem em que as cartas caíram: Nice, Lurdes, Lia e Thomas. */
const mao = (...cartas: CardId[]) => cartas.map((cardId, i) => ({ playerId: ['nice', 'lurdes', 'lia', 'thomas'][i]!, cardId }));
const resumo = (plays: ReturnType<typeof mao>, fechada = true) =>
  golpesDaMao(plays, gaucha, fechada).map((g) => `${g.momento}:${g.atacante}>${g.vitimas.join('+')}:${g.golpe}`);

describe('quem mata quem', () => {
  it('cada manilha gaúcha tem o seu golpe e o seu grito; copas não é manilha', () => {
    expect(manilhaDe('E1', gaucha)).toEqual({ golpe: 'corta', nome: 'Espadão' });
    expect(manilhaDe('P1', gaucha)).toEqual({ golpe: 'bate', nome: 'Bastião' });
    expect(manilhaDe('E7', gaucha)).toEqual({ golpe: 'fura', nome: 'Sete de espadas' });
    expect(manilhaDe('O7', gaucha)).toEqual({ golpe: 'moedas', nome: 'Sete belo' });
    expect(manilhaDe('C7', gaucha)).toBeNull();
    expect(manilhaDe('C3', gaucha)).toBeNull();
  });

  it('manilha no meio: ataca as que já estavam e, no fim, a que chegou depois', () => {
    const plays = mao('C4', 'O5', 'E1', 'C6');
    expect(resumo(plays, false)).toEqual(['entrada:lia>nice+lurdes:corta']);
    expect(resumo(plays)).toEqual(['entrada:lia>nice+lurdes:corta', 'fim:lia>thomas:corta']);
  });

  it('manilha abrindo a mão: ninguém apanha na hora; no fim, todas', () => {
    expect(resumo(mao('P1', 'C4', 'O5', 'C6'), false)).toEqual([]);
    expect(resumo(mao('P1', 'C4', 'O5', 'C6'))).toEqual(['fim:nice>lurdes+lia+thomas:bate']);
  });

  it('a mais forte vem depois: ataca a manilha que mandava (e não bate duas vezes em ninguém)', () => {
    expect(resumo(mao('C4', 'O7', 'E1', 'C6'))).toEqual([
      'entrada:lurdes>nice:moedas',
      'entrada:lia>lurdes:corta',
      'fim:lia>thomas:corta',
    ]);
  });

  it('a mais fraca vem depois: a que manda revida na hora', () => {
    expect(resumo(mao('C4', 'E1', 'P1', 'C6'))).toEqual([
      'entrada:lurdes>nice:corta',
      'revide:lurdes>lia:corta',
      'fim:lurdes>thomas:corta',
    ]);
  });

  it('a mais fraca por último não tem revide à parte: apanha no fim, junto com as outras', () => {
    // A última carta fecha a mão na mesma jogada (o motor resolve ali): nunca aparece com a mão aberta.
    expect(resumo(mao('C4', 'E1', 'C6'), false)).toEqual(['entrada:lurdes>nice:corta']);
    expect(resumo(mao('C4', 'E1', 'C6', 'P1'))).toEqual(['entrada:lurdes>nice:corta', 'fim:lurdes>lia+thomas:corta']);
  });

  it('três manilhas: revide, virada e o fim, cada carta apanha uma vez só', () => {
    expect(resumo(mao('E7', 'O7', 'P1', 'C6'))).toEqual([
      'revide:nice>lurdes:fura',
      'entrada:lia>nice:bate',
      'fim:lia>thomas:bate',
    ]);
  });

  it('sem manilha na mão, ninguém bate em ninguém', () => {
    expect(resumo(mao('C4', 'O5', 'C3', 'C6'))).toEqual([]);
  });

  it('na mineira, o naipe decide: o zap bate, a de copas derrama vinho', () => {
    const mineira = contextoDaRodada({ hierarchy: 'mineira' }, null);
    expect(manilhaDe('P4', mineira)).toEqual({ golpe: 'bate', nome: 'Zap' });
    expect(manilhaDe('C7', mineira)).toEqual({ golpe: 'vinho', nome: 'Copas' });
    expect(manilhaDe('E1', mineira)).toEqual({ golpe: 'corta', nome: 'Espadilha' });
    expect(manilhaDe('O7', mineira)).toEqual({ golpe: 'moedas', nome: 'Pica-fumo' });
    expect(manilhaDe('E7', mineira)).toBeNull();
  });

  it('com vira, as quatro do valor seguinte (a de copas derrama vinho)', () => {
    const vira = contextoDaRodada({ hierarchy: 'vira' }, 'O6'); // manilha = 7
    expect(manilhaDe('P7', vira)).toEqual({ golpe: 'bate', nome: 'Zap' });
    expect(manilhaDe('C7', vira)).toEqual({ golpe: 'vinho', nome: 'Copas' });
    expect(manilhaDe('E7', vira)).toEqual({ golpe: 'corta', nome: 'Espadilha' });
    expect(manilhaDe('O7', vira)).toEqual({ golpe: 'moedas', nome: 'Pica-fumo' });
  });

  it('grito grande para quem passa a mandar; a manilha que chega depois de uma mais forte, não', () => {
    const plays = mao('C4', 'E1', 'P1', 'C6');
    expect(mandaNaMesa(plays, 1, gaucha)).toBe(true);
    expect(mandaNaMesa(plays, 2, gaucha)).toBe(false);
  });

  it('com a mesa cheia (8), a última vítima apanha antes de a mão sair da mesa', () => {
    const oito = (...cartas: CardId[]) => cartas.map((cardId, i) => ({ playerId: `j${i}`, cardId }));
    const comuns: CardId[] = ['C4', 'O5', 'C6', 'O4', 'C5', 'O6', 'C3'];
    const vira = contextoDaRodada({ hierarchy: 'vira' }, 'O6');
    const golpes = [
      ...(['E1', 'P1', 'E7', 'O7'] as const).flatMap((m) => [
        ...golpesDaMao(oito(m, ...comuns), gaucha, true), // abre a mão: 7 vítimas no fim
        ...golpesDaMao(oito(...comuns, m), gaucha, true), // fecha a mão: 7 vítimas na entrada
      ]),
      ...golpesDaMao(oito('C7', ...comuns.map((c) => (c === 'O6' ? 'E4' : c))), vira, true), // o vinho
    ];
    expect(new Set(golpes.map((g) => g.golpe))).toEqual(new Set(['corta', 'bate', 'fura', 'moedas', 'vinho']));
    const naMesa = DEFAULT_TIMING.trickPauseMs / 1000;
    for (const g of golpes) {
      expect(g.vitimas).toHaveLength(7);
      // A última vítima apanha com folga para a pancada aparecer; a última moeda (ou gota) pousa antes
      // de a mão sair. A reação da carta pode ficar pela metade.
      expect(acertoDe(g, 6)).toBeLessThanOrEqual(naMesa - 0.15);
      const cadencia = g.golpe === 'moedas' || g.golpe === 'vinho' ? 2 * TEMPO_GOLPE.cadencia : 0;
      expect(acertoDe(g, 6) + cadencia).toBeLessThanOrEqual(naMesa - 0.02);
    }
  });

  it('a espada corta da esquerda para a direita; as outras armas vão na ordem das cartas', () => {
    const x: Record<string, number> = { nice: 300, lurdes: 40, lia: 170, thomas: 190 };
    const [corte] = golpesDaMao(mao('C4', 'O5', 'C6', 'E1'), gaucha, true);
    expect(corte!.vitimas).toEqual(['nice', 'lurdes', 'lia']);
    expect(vitimasEmOrdem(corte!, (id) => x[id]!)).toEqual(['lurdes', 'lia', 'nice']);
    const [pancada] = golpesDaMao(mao('C4', 'O5', 'C6', 'P1'), gaucha, true);
    expect(vitimasEmOrdem(pancada!, (id) => x[id]!)).toEqual(['nice', 'lurdes', 'lia']);
  });
});

describe('o que a mesa já mostrou', () => {
  /** Passa as visões pela mesa, como a `TrickArea` e os sons fazem, e diz os golpes animados em cada uma. */
  const passar = (...visoes: [plays: ReturnType<typeof mao>, fechada: boolean][]) => {
    let mesa: MesaVista | null = null;
    return visoes.map(([plays, fechada]) => {
      if (!mesa || mesaMudou(mesa, 1, plays, fechada)) mesa = mesaVista(mesa, 1, plays, fechada);
      const m = mesa;
      return golpesDaMao(plays, gaucha, fechada)
        .filter((g) => golpeComAnimacao(g, plays, m))
        .map(chaveDoGolpe);
    });
  };
  const cartas = mao('C4', 'O5', 'E1', 'C6');
  const ate = (n: number) => cartas.slice(0, n);

  it('carta a carta, cada golpe anima quando a jogada que o dispara chega', () => {
    expect(passar([[], false], [ate(1), false], [ate(2), false], [ate(3), false], [ate(4), true])).toEqual([
      [],
      [],
      [],
      ['entrada:2'],
      ['entrada:2', 'fim:4'],
    ]);
  });

  it('a mesa que aparece no meio da mão (voltou para a sala) não repete o que já aconteceu', () => {
    expect(passar([ate(3), false], [ate(4), true])).toEqual([[], ['fim:4']]);
    expect(passar([ate(4), true])).toEqual([[]]);
  });

  it('chegou mais de uma carta de uma vez (a conexão voltou): nada do pulo anima, nem o fim', () => {
    expect(passar([ate(1), false], [ate(3), false], [ate(4), true])).toEqual([[], [], ['fim:4']]);
    expect(passar([ate(1), false], [ate(4), true])).toEqual([[], []]);
    // O mesmo vale para a mão nova que já chega com várias cartas.
    expect(passar([[], false], [ate(3), false])).toEqual([[], []]);
  });

  it('a mesma visão de novo não muda nada', () => {
    const mesa = mesaVista(null, 1, ate(2), false);
    expect(mesaMudou(mesa, 1, ate(2), false)).toBe(false);
    expect(mesaMudou(mesa, 1, ate(3), false)).toBe(true);
    expect(mesaMudou(mesa, 2, ate(2), false)).toBe(true);
  });
});
