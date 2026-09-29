import { describe, expect, it } from 'vitest';
import { motivoParaEncerrar, paraConferir } from '../src/automacao-regras';
import type { Automacao, SalaAberta } from '../src/painel-do';

const cfg: Automacao = { lobbyParadoHoras: 12, fimParadoHoras: 2, resumoDiario: true, limiteSalasPorHora: 30 };
const H = 3_600_000;
const now = Date.parse('2026-09-29T00:00:00Z');

describe('automação: mesa parada', () => {
  it('lobby parado passa do limite: encerra; antes do limite: não', () => {
    expect(motivoParaEncerrar({ existe: true, status: 'lobby', atividade: now - 13 * H }, cfg, now, now - 20 * H)).toMatch(/lobby há mais de 12 h/);
    expect(motivoParaEncerrar({ existe: true, status: 'lobby', atividade: now - 11 * H }, cfg, now, now - 20 * H)).toBeNull();
  });

  it('partida terminada e ninguém puxa a próxima: encerra depois de 2 h', () => {
    expect(motivoParaEncerrar({ existe: true, status: 'finished', atividade: now - 3 * H }, cfg, now, now - 5 * H)).toMatch(/terminada/);
    expect(motivoParaEncerrar({ existe: true, status: 'finished', atividade: now - 1 * H }, cfg, now, now - 5 * H)).toBeNull();
  });

  it('partida em andamento nunca é encerrada pela automação', () => {
    expect(motivoParaEncerrar({ existe: true, status: 'playing', atividade: now - 100 * H }, cfg, now, now - 200 * H)).toBeNull();
  });

  it('regra desligada (0) não encerra; sem atividade conhecida, conta desde a criação', () => {
    expect(motivoParaEncerrar({ existe: true, status: 'lobby', atividade: now - 50 * H }, { ...cfg, lobbyParadoHoras: 0 }, now, now - 50 * H)).toBeNull();
    expect(motivoParaEncerrar({ existe: true, status: 'lobby', atividade: null }, cfg, now, now - 13 * H)).toMatch(/lobby/);
  });

  it('sala que não existe não tem regra (o painel só fecha a linha)', () => {
    expect(motivoParaEncerrar({ existe: false }, cfg, now, now - 50 * H)).toBeNull();
  });
});

describe('automação: o que conferir', () => {
  const sala = (code: string, paradaMin: number): SalaAberta => ({
    code,
    status: 'lobby',
    assincrona: false,
    conectados: 0,
    criada: now - 24 * H,
    atividade: now - paradaMin * 60_000,
  });

  it('só as paradas há mais de 20 min, as mais antigas primeiro, até 60', () => {
    const abertas = [sala('AAAA', 5), sala('BBBB', 30), sala('CCCC', 600), ...Array.from({ length: 70 }, (_, i) => sala(`X${i}`, 100 + i))];
    const lista = paraConferir(abertas, now);
    expect(lista).toHaveLength(60);
    expect(lista[0]!.code).toBe('CCCC');
    expect(lista.some((s) => s.code === 'AAAA')).toBe(false);
  });
});
