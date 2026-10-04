import { DEFAULT_RULES, type PlayerView, type Play, type PublicPlayer, type RoundRecord } from '@fodinha/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextoDaRodada } from '../manilhas';
import { Agenda, useZoeira, type Contexto } from './agenda';
import {
  cenasDoFimDaRodada,
  CORO,
  coroDe,
  DURACAO,
  enfeitesDe,
  falaDaCantada,
  falaDaDemora,
  falaDoFimDaRodada,
  FALAS_POR_RODADA,
  FREGUES_EM,
  INTERVALO_DA_FAIXA_MS,
  maoQueDecide,
  MAX_CENAS,
  mascarasDe,
  quemMatou,
  zerosSeguidos,
  sequencia,
  valorDoGalo,
} from './diretor';

const NOMES = ['Ana', 'Beto', 'Caio', 'Dani'];
const jogador = (i: number, lives: number, extra: Partial<PublicPlayer> = {}): PublicPlayer => ({
  id: `p${i}`,
  name: NOMES[i]!,
  lives,
  eliminated: lives <= 0,
  eliminatedRound: lives <= 0 ? 1 : null,
  inRound: lives > 0,
  isDealer: false,
  bid: null,
  tricks: 0,
  handCount: 0,
  visibleCards: null,
  ...extra,
});
const rodada = (number: number, cards: number, linhas: Record<string, [cantou: number, fez: number, antes: number, depois: number]>, eliminated: string[] = []): RoundRecord => ({
  number,
  cards,
  dealerId: 'p0',
  vira: null,
  bids: Object.fromEntries(Object.entries(linhas).map(([id, l]) => [id, l[0]])),
  tricks: Object.fromEntries(Object.entries(linhas).map(([id, l]) => [id, l[1]])),
  livesBefore: Object.fromEntries(Object.entries(linhas).map(([id, l]) => [id, l[2]])),
  livesAfter: Object.fromEntries(Object.entries(linhas).map(([id, l]) => [id, l[3]])),
  eliminated,
});
function visao(o: Partial<PlayerView> & { players: PublicPlayer[] }): PlayerView {
  return {
    seq: 1,
    you: 'p0',
    rules: { ...DEFAULT_RULES },
    phase: 'playing',
    roundNumber: 1,
    cardsThisRound: 3,
    direction: 'up',
    dealerId: 'p0',
    order: o.players.map((p) => p.id),
    vira: null,
    manilhaRank: null,
    blind: false,
    hand: [],
    handHidden: false,
    trick: null,
    completedTricks: [],
    lastTrick: null,
    actor: null,
    legalBids: [],
    legalCards: [],
    forbiddenBid: null,
    bidsSum: 0,
    history: [],
    result: null,
    turnDeadline: null,
    ...o,
  };
}
const ctx = contextoDaRodada(DEFAULT_RULES, null);
const tie = DEFAULT_RULES.tieRule;

describe('enfeites do assento', () => {
  it('conta as rodadas seguidas acertando e errando, só as que a pessoa jogou', () => {
    const h = [
      rodada(1, 1, { p0: [1, 1, 3, 3], p1: [0, 1, 3, 2] }),
      rodada(2, 2, { p0: [1, 1, 3, 3], p1: [1, 0, 2, 1] }),
      rodada(3, 3, { p0: [2, 2, 3, 3] }),
    ];
    expect(sequencia(h, 'p0')).toEqual({ acertos: 3, erros: 0 });
    expect(sequencia(h, 'p1')).toEqual({ acertos: 0, erros: 2 });
    expect(sequencia(h, 'p2')).toEqual({ acertos: 0, erros: 0 });
  });

  it('líder é quem está sozinho na frente; lanterna, quem está sozinho atrás', () => {
    const history = [rodada(1, 1, { p0: [0, 0, 3, 3], p1: [0, 1, 3, 2], p2: [0, 1, 3, 2], p3: [1, 0, 3, 1] })];
    const e = enfeitesDe(visao({ players: [jogador(0, 3), jogador(1, 2), jogador(2, 2), jogador(3, 1)], history }));
    expect([...e].filter(([, v]) => v.lider).map(([id]) => id)).toEqual(['p0']);
    expect([...e].filter(([, v]) => v.lanterna).map(([id]) => id)).toEqual(['p3']);
    expect(e.get('p3')!.borracho).toBe(3);
    expect(e.get('p1')!.borracho).toBe(1);
    expect(e.get('p0')!.borracho).toBe(0);
  });

  it('empate na frente ou atrás: ninguém leva a coroa nem a lanterna; antes da primeira rodada, também não', () => {
    const history = [rodada(1, 1, { p0: [0, 0, 3, 3], p1: [0, 0, 3, 3], p2: [0, 1, 3, 2], p3: [0, 1, 3, 2] })];
    const e = enfeitesDe(visao({ players: [jogador(0, 3), jogador(1, 3), jogador(2, 2), jogador(3, 2)], history }));
    expect([...e.values()].some((v) => v.lider || v.lanterna)).toBe(false);
    const comeco = enfeitesDe(visao({ players: [jogador(0, 3), jogador(1, 2)] }));
    expect([...comeco.values()].some((v) => v.lider || v.lanterna)).toBe(false);
  });

  it('mão quente e pé-frio a partir de três rodadas, nunca os dois', () => {
    const history = [1, 2, 3, 4].map((n) => rodada(n, 1, { p0: [1, 1, 5, 5], p1: [1, 0, 6 - n, 5 - n] }));
    const e = enfeitesDe(visao({ players: [jogador(0, 5), jogador(1, 1)], history, rules: { ...DEFAULT_RULES, startingLives: 5 } }));
    expect(e.get('p0')).toMatchObject({ quente: 4, frio: 0 });
    expect(e.get('p1')).toMatchObject({ quente: 0, frio: 4 });
  });

  it('quem saiu fica só com a lápide, e nela o que matou', () => {
    const history = [rodada(1, 3, { p0: [0, 0, 3, 3], p1: [3, 0, 3, 0] }, ['p1'])];
    const e = enfeitesDe(visao({ players: [jogador(0, 3), jogador(1, 0)], history }));
    expect(e.get('p1')).toEqual({ borracho: 0, quente: 0, frio: 0, lider: false, lanterna: false, epitafio: 'cantou 3, fez 0', galinha: false });
    expect(e.get('p0')!.epitafio).toBeNull();
  });
});

describe('quem mata quem', () => {
  const mao = (...cartas: [string, string][]): Play[] => cartas.map(([playerId, cardId]) => ({ playerId, cardId }) as Play);

  it('a carta que toma a mão mata a que estava levando', () => {
    expect(quemMatou(mao(['p0', 'O4'], ['p1', 'E3']), ctx, tie)).toEqual({ matador: 'p1', vitima: 'p0', carta: 'O4' });
    expect(quemMatou(mao(['p0', 'O4'], ['p1', 'E3'], ['p2', 'E1']), ctx, tie)).toEqual({ matador: 'p2', vitima: 'p1', carta: 'E3' });
  });

  it('carta mais fraca, primeira carta e empate não matam ninguém', () => {
    expect(quemMatou(mao(['p0', 'E3']), ctx, tie)).toBeNull();
    expect(quemMatou(mao(['p0', 'E3'], ['p1', 'O4']), ctx, tie)).toBeNull();
    expect(quemMatou(mao(['p0', 'E3'], ['p1', 'O3']), ctx, tie)).toBeNull();
  });

  it('o "é galo" fala de um valor, ou da carta que estiver levando', () => {
    expect(valorDoGalo('galo-3')).toBe('3');
    expect(valorDoGalo('galo')).toBe('qualquer');
    expect(valorDoGalo('cagao')).toBeNull();
  });
});

describe('fim da rodada', () => {
  it('quem saiu leva a chinelada; quem errou por dois ou mais, a vaca', () => {
    const r = rodada(4, 4, { p0: [1, 1, 3, 3], p1: [3, 0, 3, 0], p2: [0, 2, 3, 1], p3: [1, 2, 3, 2] }, ['p1']);
    expect(cenasDoFimDaRodada(r)).toEqual([
      { alvo: 'p1', tipo: 'chinelada' },
      { alvo: 'p2', tipo: 'vaca' },
    ]);
  });

  it(`no máximo ${MAX_CENAS} cenas, as mais pesadas`, () => {
    const r = rodada(4, 4, { p0: [0, 3, 3, 0], p1: [3, 0, 3, 0], p2: [0, 2, 3, 1], p3: [4, 1, 3, 2] }, ['p3']);
    const cenas = cenasDoFimDaRodada(r);
    expect(cenas).toHaveLength(MAX_CENAS);
    expect(cenas[0]).toEqual({ alvo: 'p3', tipo: 'chinelada' });
  });

  it('o narrador diz uma coisa só, a mais marcante, e não repete o ditado', () => {
    const players = [jogador(0, 3), jogador(1, 1), jogador(2, 2)];
    const history = [rodada(1, 3, { p0: [3, 3, 3, 3], p1: [1, 0, 2, 1], p2: [0, 0, 2, 2] })];
    const v = visao({ players, history, phase: 'roundEnd' });
    expect(falaDoFimDaRodada(v, new Set())).toEqual({ id: 'ganso', texto: 'Ana fez todas: anda que nem ganso novo em taipa de açude.' });
    expect(falaDoFimDaRodada(v, new Set(['ganso']))?.id).toBe('potro');
    expect(falaDoFimDaRodada(v, new Set(['ganso', 'potro']))).toBeNull();
  });

  it('fazer a única carta da rodada não é "fez todas"; escapar no último palito é firmeza de palanque', () => {
    const players = [jogador(0, 3), jogador(1, 1)];
    const history = [rodada(2, 1, { p0: [1, 1, 3, 3], p1: [0, 0, 1, 1] })];
    expect(falaDoFimDaRodada(visao({ players, history }), new Set())?.id).toBe('palanque');
  });

  it('cantar todas só é risco com três cartas ou mais', () => {
    expect(falaDaCantada('Ana', 3, 3)?.id).toBe('bolso');
    expect(falaDaCantada('Ana', 2, 2)).toBeNull();
    expect(falaDaCantada('Ana', 2, 3)).toBeNull();
  });

  it('a demora tem duas falas e depois o narrador cansa', () => {
    expect(falaDaDemora('Ana', new Set())?.id).toBe('viuva');
    expect(falaDaDemora('Ana', new Set(['viuva']))?.id).toBe('lesma');
    expect(falaDaDemora('Ana', new Set(['viuva', 'lesma']))).toBeNull();
  });
});

describe('coro', () => {
  it('três pessoas diferentes com a mesma frase dentro da janela', () => {
    const f = (playerId: string, em: number, reaction = 'cagao' as const) => ({ playerId, reaction, em });
    expect(coroDe([f('p0', 0), f('p1', 1000), f('p2', 2000)], 2000)).toBe('cagao');
    expect(coroDe([f('p0', 0), f('p0', 1000), f('p1', 2000)], 2000)).toBeNull();
    expect(coroDe([f('p0', 0), f('p1', 1000), f('p2', CORO.janelaMs + 1)], CORO.janelaMs + 1)).toBeNull();
  });
});

describe('a agenda: uma coisa de cada vez em cada lugar', () => {
  const contexto: Contexto = { avatarDe: () => undefined, ativa: true, calma: false, aoVivo: true };
  const players = () => [jogador(0, 3, { bid: 1 }), jogador(1, 3, { bid: 1 }), jogador(2, 3, { bid: 1 }), jogador(3, 3, { bid: 1 })];
  const mao = (...cartas: [string, string][]): Play[] => cartas.map(([playerId, cardId]) => ({ playerId, cardId }) as Play);
  let seq = 1;
  const v = (o: Partial<PlayerView>) => visao({ players: players(), seq: ++seq, ...o });

  beforeEach(() => {
    vi.useFakeTimers();
    seq = 1;
  });
  afterEach(() => vi.useRealTimers());

  it('o que já estava na mesa quando ela abriu não vira cena', () => {
    const a = new Agenda();
    a.comecar();
    const history = [rodada(1, 3, { p0: [0, 3, 3, 0] }, ['p0'])];
    a.ver(v({ phase: 'roundEnd', history }), contexto, 0);
    expect(useZoeira.getState().cenas).toEqual({});
  });

  it('fim de rodada: cenas nos assentos e uma fala; depois de um tempo, somem', () => {
    const a = new Agenda();
    a.comecar();
    a.ver(v({ phase: 'trickEnd' }), contexto, 0);
    const history = [rodada(1, 3, { p0: [3, 3, 3, 3], p1: [3, 0, 3, 0], p2: [0, 2, 3, 1], p3: [1, 1, 3, 3] }, ['p1'])];
    a.ver(v({ phase: 'roundEnd', history }), contexto, 1000);
    const q = useZoeira.getState();
    expect(q.cenas.p1?.tipo).toBe('chinelada');
    expect(q.cenas.p2?.tipo).toBe('vaca');
    expect(q.faixa?.texto).toContain('ganso novo');
    vi.advanceTimersByTime(Math.max(DURACAO.vaca, DURACAO.fala) + 10);
    expect(useZoeira.getState().cenas).toEqual({});
    expect(useZoeira.getState().faixa).toBeNull();
  });

  it('a faixa respeita o intervalo e o limite de falas por rodada', () => {
    const a = new Agenda();
    a.comecar();
    a.ver(v({ phase: 'bidding', players: players().map((p) => ({ ...p, bid: null })) }), contexto, 0);
    const canta = (i: number, agora: number) =>
      a.ver(v({ phase: 'bidding', players: players().map((p, j) => ({ ...p, bid: j <= i ? 3 : null })) }), contexto, agora);
    canta(0, 1000);
    expect(useZoeira.getState().faixa?.texto).toContain('Ana cantou todas');
    // O mesmo ditado não sai de novo, nem outra fala antes do intervalo.
    canta(1, 2000);
    expect(useZoeira.getState().faixa?.texto).toContain('Ana');
    expect(FALAS_POR_RODADA).toBeGreaterThan(0);
    expect(INTERVALO_DA_FAIXA_MS).toBeGreaterThan(0);
  });

  it('em câmera rápida não acontece nada; com "reduzir movimento", só a faixa', () => {
    const history = [rodada(1, 3, { p0: [3, 3, 3, 3], p1: [3, 0, 3, 0] }, ['p1'])];
    const rapida = new Agenda();
    rapida.comecar();
    rapida.ver(v({ phase: 'trickEnd' }), { ...contexto, ativa: false }, 0);
    rapida.ver(v({ phase: 'roundEnd', history }), { ...contexto, ativa: false }, 1000);
    expect(useZoeira.getState()).toMatchObject({ cenas: {}, faixa: null });
    const calma = new Agenda();
    calma.comecar();
    calma.ver(v({ phase: 'trickEnd' }), { ...contexto, calma: true }, 0);
    calma.ver(v({ phase: 'roundEnd', history }), { ...contexto, calma: true }, 1000);
    expect(useZoeira.getState().cenas).toEqual({});
    expect(useZoeira.getState().faixa).not.toBeNull();
  });

  it('traíra: alguém cantou "é galo" para a carta que estava levando e outro matou', () => {
    const a = new Agenda();
    a.comecar();
    const trick = (plays: Play[]) => ({ leaderId: 'p0', plays });
    a.ver(v({ trick: trick(mao(['p0', 'O4'])) }), contexto, 0);
    a.ver(v({ trick: trick(mao(['p0', 'O4'], ['p1', 'C5'])) }), contexto, 500);
    a.ouvir('p3', 'galo-5', 600);
    a.ver(v({ trick: trick(mao(['p0', 'O4'], ['p1', 'C5'], ['p2', 'E3'])) }), contexto, 900);
    expect(useZoeira.getState().cenas.p2?.tipo).toBe('traira');
  });

  it('sem o "é galo", matar a carta é só jogo', () => {
    const a = new Agenda();
    a.comecar();
    const trick = (plays: Play[]) => ({ leaderId: 'p0', plays });
    a.ver(v({ trick: trick(mao(['p0', 'O4'])) }), contexto, 0);
    a.ver(v({ trick: trick(mao(['p0', 'O4'], ['p1', 'E3'])) }), contexto, 500);
    expect(useZoeira.getState().cenas).toEqual({});
  });

  it(`freguês: na ${FREGUES_EM}ª carta morta pelo mesmo dono, o cartão sai com a mão fechada, uma vez só, e tira a faixa`, () => {
    const a = new Agenda();
    a.comecar();
    a.ver(v({ phase: 'trickEnd' }), contexto, 0);
    let agora = 0;
    for (let n = 1; n <= FREGUES_EM + 1; n++) {
      const cartas = mao(['p0', n % 2 ? 'O4' : 'C4'], ['p1', n % 2 ? 'E3' : 'O3']);
      const roundNumber = n;
      a.ver(v({ roundNumber, trick: { leaderId: 'p0', plays: cartas.slice(0, 1) } }), contexto, (agora += 1000));
      a.ver(v({ roundNumber, trick: { leaderId: 'p0', plays: cartas } }), contexto, (agora += 1000));
      expect(useZoeira.getState().palco).toBeNull();
      a.ver(v({ roundNumber, phase: 'trickEnd', lastTrick: { leaderId: 'p0', plays: cartas, winnerId: 'p1', cancelled: [] } }), contexto, (agora += 1000));
      if (n === FREGUES_EM) {
        expect(useZoeira.getState().palco).toMatchObject({ fregues: 'p0', dono: 'p1' });
        expect(useZoeira.getState().faixa).toBeNull();
        vi.advanceTimersByTime(DURACAO.fregues + 10);
      }
      expect(useZoeira.getState().palco).toBeNull();
    }
    expect(useZoeira.getState().fregues).toEqual({ fregues: 'p0', dono: 'p1', vezes: FREGUES_EM + 1 });
  });

  it('coro: três mandam a mesma frase e ela toma a faixa; logo em seguida, não repete', () => {
    const a = new Agenda();
    a.comecar();
    a.ver(v({}), contexto, 0);
    a.ouvir('p0', 'cagao', 1000);
    a.ouvir('p1', 'cagao', 2000);
    expect(useZoeira.getState().faixa).toBeNull();
    a.ouvir('p2', 'cagao', 3000);
    expect(useZoeira.getState().faixa).toMatchObject({ coro: true, texto: 'Cagão!' });
    vi.advanceTimersByTime(DURACAO.coro + 10);
    for (const [i, p] of ['p0', 'p1', 'p2'].entries()) a.ouvir(p, 'cagao', 4000 + i * 100);
    expect(useZoeira.getState().faixa).toBeNull();
  });

  it('o cinzeiro junta uma bituca por quem espera, na conta de quem demora', () => {
    const a = new Agenda();
    a.comecar();
    a.demorou('p1', 3);
    a.demorou('p1', 3);
    a.demorou('p2', 2);
    expect(useZoeira.getState().cinzeiro).toEqual({ total: 8, por: { p1: 6, p2: 2 } });
  });
});

describe('palco e passantes (3ª leva)', () => {
  const contexto: Contexto = { avatarDe: () => undefined, ativa: true, calma: false, aoVivo: true };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('começo da partida: a cuia escolhe o pé, depois da faixa da rodada', () => {
    const a = new Agenda();
    a.comecar();
    a.ver(visao({ players: [jogador(0, 3), jogador(1, 3)], phase: 'bidding', roundNumber: 1, dealerId: 'p1' }), contexto, 0);
    expect(useZoeira.getState().palco).toBeNull();
    vi.advanceTimersByTime(1800);
    expect(useZoeira.getState().palco).toMatchObject({ tipo: 'cuia', pe: 'p1' });
  });

  it('sobraram dois: duelo na rodada nova', () => {
    const a = new Agenda();
    a.comecar();
    a.configurar({ sorte: () => 0.99, data: null });
    a.ver(visao({ players: [jogador(0, 3), jogador(1, 3), jogador(2, 1)], phase: 'roundEnd', roundNumber: 3, seq: 5 }), contexto, 0);
    a.ver(visao({ players: [jogador(0, 3), jogador(1, 3), jogador(2, 0)], phase: 'bidding', roundNumber: 4, seq: 6 }), contexto, 100);
    vi.advanceTimersByTime(1800);
    expect(useZoeira.getState().palco).toMatchObject({ tipo: 'duelo', a: 'p0', b: 'p1' });
  });

  it('tropeço por sorteio; "é galo" faz o galo atravessar, um de cada vez', () => {
    const a = new Agenda();
    a.comecar();
    a.configurar({ sorte: () => 0, data: null });
    a.ver(visao({ players: [jogador(0, 3), jogador(1, 3)], phase: 'roundEnd', roundNumber: 2, seq: 5 }), contexto, 0);
    a.ver(visao({ players: [jogador(0, 3), jogador(1, 3)], phase: 'bidding', roundNumber: 3, seq: 6, dealerId: 'p0' }), contexto, 100);
    vi.advanceTimersByTime(500);
    expect(useZoeira.getState().palco).toMatchObject({ tipo: 'tropeco', de: 'p0' });
    a.ouvir('p1', 'galo', 1000);
    const primeiro = useZoeira.getState().passante;
    expect(primeiro?.tipo).toBe('galo');
    a.ouvir('p0', 'galo-3', 1100);
    expect(useZoeira.getState().passante?.chave).toBe(primeiro?.chave);
  });

  it('conta mortes, empates e frases para os troféus', () => {
    const a = new Agenda();
    a.comecar();
    a.configurar({ sorte: () => 0.99, data: null });
    const ps = [jogador(0, 3, { bid: 1 }), jogador(1, 3, { bid: 1 })];
    a.ver(visao({ players: ps, trick: { leaderId: 'p0', plays: [{ playerId: 'p0', cardId: 'O4' }] }, seq: 2 }), contexto, 0);
    a.ver(visao({ players: ps, trick: { leaderId: 'p0', plays: [{ playerId: 'p0', cardId: 'O4' }, { playerId: 'p1', cardId: 'E3' }] }, seq: 3 }), contexto, 10);
    a.ver(
      visao({ players: ps, phase: 'trickEnd', seq: 4, lastTrick: { leaderId: 'p0', plays: [{ playerId: 'p0', cardId: 'O3' }, { playerId: 'p1', cardId: 'E3' }], winnerId: null, cancelled: ['p0', 'p1'] } }),
      contexto,
      20,
    );
    a.ouvir('p0', 'cagao', 30);
    expect(useZoeira.getState().contas).toMatchObject({ mortes: { p1: 1 }, empates: { p0: 1, p1: 1 }, frases: { p0: 1 } });
  });
});

describe('4ª leva: máscaras, galinha, cumadre e a mão que decide', () => {
  const contexto: Contexto = { avatarDe: () => undefined, ativa: true, calma: false, aoVivo: true };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('máscaras: focinho em quem fez mais, nariz em quem fez menos, do fim da rodada até a primeira carta', () => {
    const history = [rodada(2, 2, { p0: [0, 1, 3, 2], p1: [2, 1, 3, 2], p2: [1, 1, 3, 3], p3: [1, 0, 1, 0] }, ['p3'])];
    const ps = [jogador(0, 2), jogador(1, 2), jogador(2, 3), jogador(3, 0)];
    const fim = mascarasDe(visao({ players: ps, history, phase: 'roundEnd', roundNumber: 2 }));
    expect([...fim.entries()]).toEqual([
      ['p0', 'porco'],
      ['p1', 'palhaco'],
    ]);
    expect(mascarasDe(visao({ players: ps, history, phase: 'bidding', roundNumber: 3 })).size).toBe(2);
    expect(mascarasDe(visao({ players: ps, history, phase: 'playing', roundNumber: 3 })).size).toBe(2);
    const jogando = visao({ players: ps, history, phase: 'playing', roundNumber: 3, trick: { leaderId: 'p0', plays: [{ playerId: 'p0', cardId: 'O4' }] } });
    expect(mascarasDe(jogando).size).toBe(0);
    expect(mascarasDe(visao({ players: ps, history, phase: 'gameOver', roundNumber: 2 })).size).toBe(0);
  });

  it('a galinha: três zeros seguidos nas rodadas que jogou', () => {
    const history = [
      rodada(1, 1, { p0: [0, 0, 3, 3], p1: [1, 1, 3, 3] }),
      rodada(2, 2, { p0: [0, 0, 3, 3], p1: [0, 0, 3, 3] }),
      rodada(3, 3, { p0: [0, 1, 3, 2], p1: [1, 1, 3, 3] }),
    ];
    expect(zerosSeguidos(history, 'p0')).toBe(3);
    expect(zerosSeguidos(history, 'p1')).toBe(0);
    const e = enfeitesDe(visao({ players: [jogador(0, 2), jogador(1, 3)], history, phase: 'bidding', roundNumber: 4 }));
    expect(e.get('p0')!.galinha).toBe(true);
    expect(e.get('p1')!.galinha).toBe(false);
  });

  it('a mão que decide: só na última mão, e só com alguém por um fio', () => {
    const ultima = { leaderId: 'p0', plays: [{ playerId: 'p0', cardId: 'O4' }, { playerId: 'p1', cardId: 'E3' }], winnerId: 'p1', cancelled: [] } as const;
    const ps = [jogador(0, 1, { bid: 1, tricks: 0 }), jogador(1, 2, { bid: 0, tricks: 1 })];
    expect(maoQueDecide(visao({ players: ps, phase: 'trickEnd', lastTrick: { ...ultima, plays: [...ultima.plays], cancelled: [] } }))).toEqual(['p0']);
    const aindaTemCarta = [jogador(0, 1, { bid: 1, tricks: 0, handCount: 1 }), jogador(1, 2, { bid: 0, tricks: 1, handCount: 1 })];
    expect(maoQueDecide(visao({ players: aindaTemCarta, phase: 'trickEnd', lastTrick: { ...ultima, plays: [...ultima.plays], cancelled: [] } }))).toEqual([]);
    expect(maoQueDecide(visao({ players: ps, phase: 'playing' }))).toEqual([]);
  });

  it('o corte de novela entra na mão que decide e tira o que estiver no palco', () => {
    const a = new Agenda();
    a.comecar();
    a.configurar({ sorte: () => 0.99, data: null });
    const ps = [jogador(0, 1, { bid: 1, tricks: 0 }), jogador(1, 2, { bid: 0, tricks: 0 })];
    a.ver(visao({ players: ps, seq: 2, trick: { leaderId: 'p0', plays: [{ playerId: 'p0', cardId: 'O4' }] } }), contexto, 0);
    useZoeira.setState({ palco: { chave: 999, tipo: 'tropeco', de: 'p1' } });
    const fechada = [jogador(0, 1, { bid: 1, tricks: 0 }), jogador(1, 2, { bid: 0, tricks: 1 })];
    a.ver(
      visao({ players: fechada, phase: 'trickEnd', seq: 3, lastTrick: { leaderId: 'p0', plays: [{ playerId: 'p0', cardId: 'O4' }, { playerId: 'p1', cardId: 'E3' }], winnerId: 'p1', cancelled: [] } }),
      contexto,
      10,
    );
    // A última carta aparece inteira antes do corte.
    expect(useZoeira.getState().palco).toMatchObject({ tipo: 'tropeco' });
    vi.advanceTimersByTime(500);
    expect(useZoeira.getState().palco).toMatchObject({ tipo: 'corte', quem: ['p0'] });
    // A mesa recolheu a mão (ou acabou a rodada): o corte sai na hora, não cobre o resumo.
    a.ver(visao({ players: fechada, phase: 'roundEnd', seq: 4 }), contexto, 600);
    expect(useZoeira.getState().palco).toBeNull();
  });

  it('cumadre: empardou duas vezes na mesma rodada', () => {
    const a = new Agenda();
    a.comecar();
    const ps = [jogador(0, 3, { bid: 1, handCount: 1 }), jogador(1, 3, { bid: 1, handCount: 1 })];
    const empate = { leaderId: 'p0', plays: [{ playerId: 'p0', cardId: 'O3' }, { playerId: 'p1', cardId: 'E3' }], winnerId: null, cancelled: ['p0', 'p1'] } as const;
    const t = () => ({ ...empate, plays: [...empate.plays], cancelled: [...empate.cancelled] });
    a.ver(visao({ players: ps, seq: 2 }), contexto, 0);
    a.ver(visao({ players: ps, phase: 'trickEnd', seq: 3, completedTricks: [t()], lastTrick: t() }), contexto, 10);
    expect(useZoeira.getState().cenas).toEqual({});
    a.ver(visao({ players: ps, phase: 'playing', seq: 4, completedTricks: [t()] }), contexto, 20);
    a.ver(visao({ players: ps, phase: 'trickEnd', seq: 5, completedTricks: [t(), t()], lastTrick: t() }), contexto, 30);
    expect(Object.values(useZoeira.getState().cenas).map((c) => c.tipo)).toEqual(['cumadre', 'cumadre']);
  });
});
