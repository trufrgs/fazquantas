import { describe, expect, it } from 'vitest';
import { ControleDaZoeira, porUmFio, quemVaiProCorte, temGolpe, ZOEIRA_ESGOTADA, type ContextoDaZoeira } from '../src/zoeira';

const fixo = { penalty: 'fixed' } as const;
const diferenca = { penalty: 'difference' } as const;

describe('porUmFio (a mão que decide)', () => {
  it('picks whoever is on the last stick and whose fate this hand decides', () => {
    const j = [
      { id: 'a', lives: 1, bid: 1, tricks: 0 }, // leva: acerta; não leva: sai
      { id: 'b', lives: 1, bid: 1, tricks: 1 }, // leva: passa e sai; não leva: acerta
      { id: 'c', lives: 1, bid: 2, tricks: 0 }, // já errou de qualquer jeito
      { id: 'd', lives: 2, bid: 0, tricks: 0 }, // erra e fica com 1: ninguém sai
      { id: 'e', lives: 1, bid: null, tricks: 0 },
    ];
    expect(porUmFio(fixo, j)).toEqual(['a', 'b']);
  });

  it('counts the difference penalty: missing by two only kills with two sticks or fewer', () => {
    const j = [
      { id: 'a', lives: 2, bid: 2, tricks: 1 }, // leva: acerta; não leva: perde 1 e fica
      { id: 'b', lives: 2, bid: 3, tricks: 1 }, // leva: perde 1; não leva: perde 2 e sai
    ];
    expect(porUmFio(diferenca, j)).toEqual(['b']);
  });

  it('ignores players already out', () => {
    expect(porUmFio(fixo, [{ id: 'a', lives: 0, bid: 1, tricks: 0 }])).toEqual([]);
  });
});

describe('quemVaiProCorte (the soap-opera cut stays rare)', () => {
  const fio = (id: string) => ({ id, lives: 1, bid: 1, tricks: 0 });
  it('one or two on the edge get the cut; the whole table on the edge does not', () => {
    expect(quemVaiProCorte(fixo, [fio('a')], [])).toEqual(['a']);
    expect(quemVaiProCorte(fixo, [fio('a'), fio('b')], [])).toEqual(['a', 'b']);
    expect(quemVaiProCorte(fixo, [fio('a'), fio('b'), fio('c')], [])).toEqual([]);
  });

  it('only the first round on the last stick: whoever was already on it last round gets no new cut', () => {
    const anterior = { livesBefore: { a: 1, b: 2 } };
    expect(quemVaiProCorte(fixo, [fio('a'), fio('b')], [anterior])).toEqual(['b']);
  });
});

describe('ControleDaZoeira: golpe and baforada', () => {
  const ctx = (o: Partial<ContextoDaZoeira> = {}): ContextoDaZoeira => ({
    agora: 0,
    rodada: 'p:1',
    partida: 'p',
    ator: 'b',
    alvos: new Set(['a', 'b', 'c']),
    ...o,
  });

  it('only avatars with a signature move can send it, and it spends a throw', () => {
    const c = new ControleDaZoeira();
    expect(c.pode('a', { tipo: 'golpe', alvo: 'b' }, ctx({ avatar: 'g-gauderio' }))).toBe(ZOEIRA_ESGOTADA.golpe);
    const z = { tipo: 'golpe', alvo: 'b' } as const;
    for (let i = 0; i < 3; i++) {
      expect(c.pode('a', z, ctx({ avatar: 'g-zorrilho' }))).toBeNull();
      c.registrar('a', z, ctx({ avatar: 'g-zorrilho' }));
    }
    expect(c.pode('a', { tipo: 'atirar', alvo: 'b', item: 'ovo' }, ctx())).toBe(ZOEIRA_ESGOTADA.tiros);
    expect(temGolpe('g-bugio')).toBe(true);
    expect(temGolpe('g-capivara')).toBe(false);
  });

  it('a puff only goes to whoever is on the turn, and has its own cooldown apart from the nudge', () => {
    const c = new ControleDaZoeira();
    expect(c.pode('a', { tipo: 'baforada', alvo: 'c' }, ctx())).toBe(ZOEIRA_ESGOTADA.demora);
    c.registrar('a', { tipo: 'baforada', alvo: 'b' }, ctx());
    expect(c.pode('a', { tipo: 'baforada', alvo: 'b' }, ctx({ agora: 1000 }))).toBe(ZOEIRA_ESGOTADA.cutucao);
    expect(c.pode('a', { tipo: 'cutucar', alvo: 'b' }, ctx({ agora: 1000 }))).toBeNull();
    expect(c.pode('a', { tipo: 'baforada', alvo: 'b' }, ctx({ agora: 6000 }))).toBeNull();
  });
});
