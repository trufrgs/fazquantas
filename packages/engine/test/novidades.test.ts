import { describe, expect, it } from 'vitest';
import { currentActor } from '../src/game';
import { GameHost, TIMEOUTS_UNTIL_AWAY, type SeatConfig } from '../src/host';
import { PROFILE_KEY_PATTERN, profileIdFromKey, randomToken } from '../src/profile';
import { periodRange } from '../src/ranking';
import { newSeries, placementPoints, recordSeriesGame, seriesTable, seriesTarget, standingsOf } from '../src/series';
import type { GameState, PlayerState } from '../src/types';
import { FakeClock } from './fake-clock';

const player = (id: string, lives: number, eliminatedRound: number | null): PlayerState => ({
  id,
  name: id.toUpperCase(),
  lives,
  eliminatedRound,
});

/** Estado de fim de jogo só com o que a série usa. */
function finished(players: PlayerState[], winners: string[]): GameState {
  return { players, result: { winners, ranking: players.map((p) => p.id) } } as unknown as GameState;
}

describe('colocação e pontos', () => {
  it('quem durou mais fica na frente; mesma rodada, mais palitos; empate divide', () => {
    const players = [
      player('a', -1, 3),
      player('b', 2, null),
      player('c', 0, 3),
      player('d', 0, 3),
      player('e', 0, 1),
    ];
    expect(standingsOf(players)).toEqual([['b'], ['c', 'd'], ['a'], ['e']]);
  });

  it('um ponto por adversário que terminou atrás; empate não conta', () => {
    const standings = [['b'], ['c', 'd'], ['a'], ['e']];
    expect(placementPoints(standings)).toEqual({ b: 4, c: 2, d: 2, a: 1, e: 0 });
    // Só entre alguns (no ranking, só os humanos).
    expect(placementPoints(standings, new Set(['a', 'c', 'e']))).toEqual({ c: 2, a: 1, e: 0 });
  });
});

describe('série melhor de X', () => {
  it('a maioria das vitórias leva', () => {
    expect([1, 3, 5, 7].map((n) => seriesTarget(n as 1 | 3 | 5 | 7))).toEqual([1, 2, 3, 4]);
    let s = newSeries(3);
    const names = { a: 'Ana', b: 'Beto', c: 'Caio' };
    s = recordSeriesGame(s, finished([player('a', 1, null), player('b', 0, 2), player('c', 0, 1)], ['a']), names, 1);
    expect(s.champion).toBeNull();
    expect(s.wins).toEqual({ a: 1, b: 0, c: 0 });
    expect(s.points).toEqual({ a: 2, b: 1, c: 0 });
    s = recordSeriesGame(s, finished([player('a', 0, 3), player('b', 2, null), player('c', 0, 2)], ['b']), names, 2);
    expect(s.champion).toBeNull();
    s = recordSeriesGame(s, finished([player('a', 1, null), player('b', 0, 1), player('c', 0, 4)], ['a']), names, 3);
    expect(s.champion).toEqual(['a']);
    expect(s.games.map((g) => g.number)).toEqual([1, 2, 3]);
    expect(seriesTable(s).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    // Série decidida não muda mais.
    const after = recordSeriesGame(s, finished([player('c', 1, null), player('a', 0, 1), player('b', 0, 1)], ['c']), names, 4);
    expect(after).toBe(s);
  });

  it('ninguém chega na maioria até o fim: vence quem ganhou mais; empatado, quem somou mais pontos', () => {
    let s = newSeries(3);
    const names = { a: 'A', b: 'B', c: 'C' };
    s = recordSeriesGame(s, finished([player('a', 1, null), player('b', 0, 2), player('c', 0, 1)], ['a']), names, 1);
    s = recordSeriesGame(s, finished([player('b', 1, null), player('c', 0, 2), player('a', 0, 1)], ['b']), names, 2);
    s = recordSeriesGame(s, finished([player('c', 1, null), player('a', 0, 2), player('b', 0, 1)], ['c']), names, 3);
    // 1 vitória para cada; pontos: a = 2+0+1, b = 1+2+0, c = 0+1+2 → empate total, dividem.
    expect(s.champion?.sort()).toEqual(['a', 'b', 'c']);
  });

  it('partida avulsa é "melhor de 1": o vencedor leva na hora', () => {
    const s = recordSeriesGame(newSeries(1), finished([player('a', 1, null), player('b', 0, 1)], ['a']), { a: 'A', b: 'B' }, 1);
    expect(s.champion).toEqual(['a']);
  });
});

describe('períodos do ranking (horário de Brasília)', () => {
  // 28/09/2026 é uma segunda-feira.
  const segunda = Date.parse('2026-09-28T12:00:00-03:00');

  it('semana de segunda a domingo, virando à meia-noite de Brasília', () => {
    const r = periodRange('semana', segunda, segunda);
    expect(r.start).toBe(Date.parse('2026-09-28T00:00:00-03:00'));
    expect(r.end).toBe(Date.parse('2026-10-05T00:00:00-03:00'));
    expect(r.label).toBe('28 de setembro a 4 de outubro');
    expect(r.next).toBeNull(); // a semana corrente não tem "próxima"
    // Domingo 23h59 em Brasília ainda é a semana anterior (já é segunda em UTC).
    const domingo = Date.parse('2026-09-27T23:59:00-03:00');
    expect(periodRange('semana', domingo, segunda).label).toBe('21 a 27 de setembro');
    expect(periodRange('semana', domingo, segunda).next).toBe(r.start);
  });

  it('mês e ano', () => {
    const mes = periodRange('mes', segunda, segunda);
    expect(mes.start).toBe(Date.parse('2026-09-01T00:00:00-03:00'));
    expect(mes.end).toBe(Date.parse('2026-10-01T00:00:00-03:00'));
    expect(mes.label).toBe('Setembro de 2026');
    const ano = periodRange('ano', segunda, segunda);
    expect(ano.label).toBe('2026');
    expect(ano.end).toBe(Date.parse('2027-01-01T00:00:00-03:00'));
    expect(periodRange('ano', ano.prev!, segunda).label).toBe('2025');
    expect(periodRange('sempre', segunda).start).toBe(0);
  });
});

describe('perfil de ranking', () => {
  it('chave aleatória e id público derivado, estável', async () => {
    const key = randomToken(16);
    expect(key).toMatch(PROFILE_KEY_PATTERN);
    const id = await profileIdFromKey(key);
    expect(id).toHaveLength(22);
    expect(await profileIdFromKey(key)).toBe(id);
    expect(await profileIdFromKey(`${key}x`)).not.toBe(id);
  });
});

describe('GameHost: tempo da vez e ausência', () => {
  const seats: SeatConfig[] = [
    { id: 'eu', name: 'Eu', kind: 'human' },
    { id: 'tu', name: 'Tu', kind: 'human' },
    { id: 'b0', name: 'Bot', kind: 'bot', difficulty: 'medio' },
  ];

  it('o prazo sobrevive a salvar e restaurar (ninguém ganha tempo)', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats, seed: 5, clock, firstDealer: 2, turnTimeoutMs: 10_000, timing: { dealMs: 0 } });
    host.start();
    const deadline = host.deadline!;
    clock.advance(4_000);
    const restored = GameHost.restore(host.snapshot(), { clock, timing: { dealMs: 0 } });
    host.dispose();
    restored.start();
    expect(restored.deadline).toBe(deadline);
    clock.advance(5_999);
    expect(currentActor(restored.state)?.playerId).toBe('eu');
    clock.advance(2);
    expect(currentActor(restored.state)?.playerId).not.toBe('eu');
  });

  it(`${TIMEOUTS_UNTIL_AWAY} tempos estourados seguidos: ausente até agir de novo`, () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats, seed: 9, clock, firstDealer: 2, turnTimeoutMs: 1_000, timing: { dealMs: 0 } });
    host.start();
    // "tu" joga sempre; "eu" nunca responde.
    let guard = 0;
    while (!host.isAway('eu') && guard++ < 200) {
      const actor = currentActor(host.state);
      if (actor?.playerId === 'tu') {
        const v = host.view('tu');
        if (actor.kind === 'bid') host.act('tu', { type: 'bid', playerId: 'tu', value: v.legalBids[0]! });
        else if (v.legalCards.length > 0) host.act('tu', { type: 'play', playerId: 'tu', cardId: v.legalCards[0]! });
        else clock.advance(2_000);
      } else clock.advance(1_100);
    }
    expect(host.isAway('eu')).toBe(true);
    expect(host.awayPlayers()).toEqual(['eu']);
    expect(host.snapshot().away).toEqual(['eu']);
    // Ausente, a vez dele não espera o prazo inteiro.
    host.setAway('eu', false);
    expect(host.isAway('eu')).toBe(false);
    expect(host.snapshot().timeouts?.eu ?? 0).toBe(0);
  });
});
