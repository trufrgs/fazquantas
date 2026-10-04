import { seriesTarget, type JoinResult } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../src/erros';
import { MAX_PASSWORD_ATTEMPTS } from '../src/servidor';
import { profileIdFromKey, randomToken } from '../src/perfil';
import { autoPlay, connect, createRoom, joinRoom, ok, startWorld, waitUntil } from './helpers';

const QUICK = { rules: { startingLives: 1, maxCards: 2 }, turnTimeoutSec: null };

describe('senha da sala', () => {
  it('sem senha não entra; errada conta tentativa; certa entra; token dispensa', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { password: 'galpão 7' } });
    const own = await ana.waitForState((s) => s.youId === a.playerId);
    expect(own).toMatchObject({ hasPassword: true, password: 'galpão 7' });

    const beto = connect(mundo);
    expect(await beto.call('room:join', { code: a.code, name: 'Beto', avatar: 'b' })).toEqual({
      ok: false,
      error: { code: 'PASSWORD_REQUIRED', message: MESSAGES.passwordRequired },
    });
    expect(await beto.call('room:join', { code: a.code, name: 'Beto', avatar: 'b', password: 'galpao 7' })).toEqual({
      ok: false,
      error: { code: 'WRONG_PASSWORD', message: MESSAGES.wrongPassword },
    });
    const b = await joinRoom(beto, a.code, 'Beto', undefined, { password: '  galpão   7 ' });
    const seen = await beto.waitForState((s) => s.youId === b.playerId);
    // Quem não é anfitrião sabe que tem senha, mas não vê qual é.
    expect(seen).toMatchObject({ hasPassword: true, password: null });

    // Caiu e voltou com o token: não pede senha de novo.
    beto.close();
    const beto2 = connect(mundo);
    expect(await joinRoom(beto2, a.code, 'Beto', b.token)).toMatchObject({ playerId: b.playerId });

    // O anfitrião troca e tira a senha.
    ok(await ana.call('room:update', { password: 'nova' }));
    await ana.waitForState((s) => s.password === 'nova');
    ok(await ana.call('room:update', { password: null }));
    const open = await beto2.waitForState((s) => !s.hasPassword);
    expect(open.password).toBeNull();
    await joinRoom(connect(mundo), a.code, 'Caio');
  });

  it(`${MAX_PASSWORD_ATTEMPTS} senhas erradas fecham a conexão`, async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const { code } = await createRoom(ana, 'Ana', { settings: { password: '1234' } });
    const chute = connect(mundo);
    const results = [];
    for (let i = 0; i < MAX_PASSWORD_ATTEMPTS; i++) {
      results.push(await chute.call('room:join', { code, name: 'Chute', avatar: 'c', password: String(1000 + i) }));
    }
    expect(results.slice(0, -1).every((r) => !r.ok && r.error.code === 'WRONG_PASSWORD')).toBe(true);
    expect(results.at(-1)).toEqual({ ok: false, error: { code: 'TOO_MANY_ATTEMPTS', message: MESSAGES.tooManyAttempts } });
    await chute.waitFor(() => chute.closed, 'conexão fechada');
    expect(chute.closed?.code).toBe(4029);
    expect(mundo.rooms.get(code)!.seatCount).toBe(1);
  });
});

describe('ritmo', () => {
  it('muda no lobby e também no meio da partida (as regras não)', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    await createRoom(ana, 'Ana', { settings: { pace: 'calma' } });
    await ana.waitForState((s) => s.pace === 'calma');
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ok(await ana.call('room:update', { turnTimeoutSec: null }));
    ok(await ana.call('room:start'));
    ok(await ana.call('room:update', { pace: 'rapida' }));
    await ana.waitForState((s) => s.status === 'playing' && s.pace === 'rapida');
  });

  it('a partida calma demora mais que a normal', async () => {
    const timing = { botThinkMs: [20, 20] as [number, number], trickPauseMs: 20, lastCardMs: 0, decisiveMs: 0, roundPauseMs: 20, bidsRevealMs: 20, forcedPlayMs: 20, dealMs: 0, awayActMs: 20 };
    // Mesmo sorteio nas duas partidas: a única diferença é o ritmo (sem isso o teste oscilava).
    const seeded = () => {
      let x = 42;
      return () => {
        x = (x * 1664525 + 1013904223) % 4294967296;
        return x / 4294967296;
      };
    };
    const duration = async (pace: 'calma' | 'rapida') => {
      const mundo = startWorld({ timing, aleatorio: seeded() });
      const ana = connect(mundo);
      await createRoom(ana, 'Ana', { settings: { pace } });
      const player = autoPlay(ana);
      for (let i = 0; i < 2; i++) ok(await ana.call('room:addBot', { difficulty: 'medio' }));
      ok(await ana.call('room:update', { rules: { startingLives: 1, maxCards: 3 }, turnTimeoutSec: null }));
      const t0 = Date.now();
      ok(await ana.call('room:start'));
      await ana.waitForState((s) => s.status === 'finished', 'fim', 30_000);
      player.stop();
      return Date.now() - t0;
    };
    const slow = await duration('calma');
    const fast = await duration('rapida');
    expect(slow).toBeGreaterThan(fast);
  });
});

describe('série melhor de X', () => {
  it('melhor de 3: segue até alguém fazer 2 vitórias; depois começa série nova', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { bestOf: 3, ...QUICK } });
    const b = await joinRoom(beto, a.code, 'Beto');
    ok(await ana.call('room:addBot', { difficulty: 'medio' }));
    const pa = autoPlay(ana);
    const pb = autoPlay(beto);
    expect(seriesTarget(3)).toBe(2);

    ok(await ana.call('room:start'));
    let state = await beto.waitForState((s) => s.status === 'finished', 'fim da partida 1', 30_000);
    expect(state.series).toMatchObject({ bestOf: 3, target: 2, champion: null });
    expect(state.series!.games).toHaveLength(1);
    expect(Object.keys(state.series!.names).sort()).toEqual(state.seats.map((s) => s.playerId).sort());
    // O convidado pede a próxima; com a anfitriã olhando a mesa, ela é quem puxa.
    ok(await beto.call('room:rematch'));
    expect((await beto.waitForState((s) => (s.revanche ?? []).length === 1)).status).toBe('finished');

    let games = 1;
    while (!state.series!.champion) {
      ok(await ana.call('room:rematch'));
      games += 1;
      state = await beto.waitForState(
        (s) => s.status === 'finished' && s.series!.games.length === games,
        `fim da partida ${games}`,
        30_000,
      );
      expect(games).toBeLessThanOrEqual(3);
    }
    const series = state.series!;
    const champion = series.champion!;
    expect(champion.length).toBeGreaterThan(0);
    const wins = Object.values(series.wins).reduce((n, w) => n + w, 0);
    expect(wins).toBeGreaterThanOrEqual(series.games.length); // empate no topo dá vitória a mais de um
    if (series.games.length < 3) expect(champion.every((id) => series.wins[id] === 2)).toBe(true);
    // Pontos por colocação: um por quem ficou atrás. Com 3 na mesa, vencedor sozinho leva 2; dois
    // empatados no topo, 1 cada; os três empatados (raro), 0.
    for (const game of series.games) {
      for (const id of game.winners) expect(game.points[id]).toBe(3 - game.winners.length);
    }

    // Série decidida: a próxima partida abre outra série.
    ok(await ana.call('room:rematch'));
    const next = await beto.waitForState((s) => s.status === 'playing' && s.series!.games.length === 0, 'série nova');
    expect(next.series!.champion).toBeNull();
    pa.stop();
    pb.stop();
    expect(b.playerId).toBeTruthy();
  });

  it('voltar para o lobby e começar de novo abre série nova', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    await createRoom(ana, 'Ana', { settings: { bestOf: 5, ...QUICK } });
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    const pa = autoPlay(ana);
    ok(await ana.call('room:start'));
    await ana.waitForState((s) => s.status === 'finished', 'fim', 30_000);
    ok(await ana.call('room:lobby'));
    const lobby = await ana.waitForState((s) => s.status === 'lobby');
    expect(lobby.series!.games).toHaveLength(1); // a última série fica à vista
    ok(await ana.call('room:start'));
    const fresh = await ana.waitForState((s) => s.status === 'playing');
    expect(fresh.series!.games).toHaveLength(0);
    pa.stop();
  });
});

describe('ranking', () => {
  async function rankedRoom(humans: number, bots = 0) {
    const mundo = startWorld();
    const keys = Array.from({ length: humans }, () => randomToken(16));
    const clients = keys.map(() => connect(mundo));
    const host = await createRoom(clients[0]!, 'Ana', { profileKey: keys[0], settings: { ranked: true, ...QUICK } });
    const seats: JoinResult[] = [host];
    for (let i = 1; i < humans; i++) {
      seats.push(await joinRoom(clients[i]!, host.code, `J${i}`, undefined, { profileKey: keys[i] }));
    }
    for (let i = 0; i < bots; i++) ok(await clients[0]!.call('room:addBot', { difficulty: 'facil' }));
    const ids = await Promise.all(keys.map(profileIdFromKey));
    return { mundo, clients, seats, ids, code: host.code };
  }

  it('partida valendo com 2 humanos e 1 bot registra só os humanos, com pontos entre eles', async () => {
    const { mundo, clients, ids } = await rankedRoom(2, 1);
    const players = clients.map(autoPlay);
    ok(await clients[0]!.call('room:start'));
    await clients[0]!.waitForState((s) => s.status === 'finished', 'fim', 30_000);
    await waitUntil(() => mundo.ranqueadas.length === 1, 'ranking registrado');
    const [partida] = mundo.ranqueadas;
    expect(partida!.jogadores.map((j) => j.profileId).sort()).toEqual([...ids].sort());
    const points = partida!.jogadores.map((j) => j.points).sort();
    // Entre 2 humanos: 1 e 0, ou 0 e 0 se empataram.
    expect([[0, 1], [0, 0]]).toContainEqual(points);
    expect(partida!.jogadores.every((j) => !j.abandoned)).toBe(true);
    for (const p of players) p.stop();
  });

  it('valendo ranking precisa de 2 humanos com perfil', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    await createRoom(ana, 'Ana', { profileKey: randomToken(16), settings: { ranked: true } });
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    expect(await ana.call('room:start')).toEqual({ ok: false, error: { code: 'NOT_RANKABLE', message: MESSAGES.notRankable } });
    ok(await ana.call('room:update', { ranked: false }));
    ok(await ana.call('room:start'));
  });

  it('quem abandona uma partida valendo fica atrás de todos, com zero pontos', async () => {
    const { mundo, clients, ids } = await rankedRoom(3);
    const players = clients.slice(0, 2).map(autoPlay);
    ok(await clients[0]!.call('room:start'));
    await clients[2]!.waitForView(() => true);
    ok(await clients[2]!.call('room:leave')); // J2 sai: o assento vira bot
    await clients[0]!.waitForState((s) => s.status === 'finished', 'fim', 30_000);
    await waitUntil(() => mundo.ranqueadas.length === 1, 'ranking registrado');
    const quitter = mundo.ranqueadas[0]!.jogadores.find((j) => j.profileId === ids[2]);
    expect(quitter).toMatchObject({ abandoned: true, points: 0, won: false });
    const stayed = mundo.ranqueadas[0]!.jogadores.filter((j) => j.profileId !== ids[2]);
    expect(stayed.every((j) => j.points >= 1)).toBe(true);
    for (const p of players) p.stop();
  });

  it('partida que não vale ranking não registra nada', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const a = await createRoom(ana, 'Ana', { profileKey: randomToken(16), settings: QUICK });
    const beto = connect(mundo);
    await joinRoom(beto, a.code, 'Beto', undefined, { profileKey: randomToken(16) });
    const players = [autoPlay(ana), autoPlay(beto)];
    ok(await ana.call('room:start'));
    await ana.waitForState((s) => s.status === 'finished', 'fim', 30_000);
    expect(mundo.ranqueadas).toEqual([]);
    for (const p of players) p.stop();
  });
});

describe('ausência e avisos', () => {
  it('quem estoura o tempo 2 vezes seguidas fica ausente até dizer "voltei"', async () => {
    const mundo = startWorld({ turnScale: 0.001 }); // 30 s viram 30 ms
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: 30, rules: { blindRound: 'off' } } });
    const b = await joinRoom(beto, a.code, 'Beto');
    const pa = autoPlay(ana); // Ana joga; Beto some sem fechar a aba
    ok(await ana.call('room:start'));
    const away = await ana.waitForState(
      (s) => s.seats.some((seat) => seat.playerId === b.playerId && seat.kind === 'human' && seat.away),
      'Beto ausente',
      10_000,
    );
    expect(away.seats.find((s) => s.playerId === b.playerId)).toMatchObject({ connected: true, away: true });
    ok(await beto.call('room:present'));
    await ana.waitForState(
      (s) => s.seats.some((seat) => seat.playerId === b.playerId && seat.kind === 'human' && !seat.away),
      'Beto de volta',
    );
    pa.stop();
  });

  it('todos ausentes: a partida pausa; alguém voltar retoma', async () => {
    const mundo = startWorld({ turnScale: 0.001 });
    const ana = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: 30 } });
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ok(await ana.call('room:start'));
    const game = () => mundo.rooms.get(a.code)!.game!;
    await waitUntil(() => game().isAway(a.playerId) && game().isPaused, 'pausa com todo mundo ausente', 10_000);
    const seq = game().state.seq;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(game().state.seq).toBe(seq);
    ok(await ana.call('room:present'));
    await waitUntil(() => !game().isPaused, 'retomada');
  });

  it('a vez de quem está com a página escondida vira aviso (uma vez por vez)', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: null, rules: { blindRound: 'off' } } });
    const b = await joinRoom(beto, a.code, 'Beto');
    beto.send('presence', { visible: false });
    const pa = autoPlay(ana);
    ok(await ana.call('room:start'));
    const aviso = await ana.waitFor(() => mundo.avisos.find((x) => x.playerId === b.playerId && x.kind === 'turn'), 'aviso de vez');
    expect(aviso.profileId).toBeNull();
    const before = mundo.avisos.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mundo.avisos.length).toBe(before); // esperando o Beto: nada de aviso repetido
    beto.send('presence', { visible: true });
    pa.stop();
  });
});

describe('hibernação', () => {
  it('a sala salva no meio da partida volta igual e segue com as mesmas conexões', async () => {
    // Dois humanos automáticos, sem bot: jogam mais rápido do que qualquer pessoa.
    const mundo = startWorld({ rateLimit: { burst: 10_000, perSecond: 10_000 } });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { bestOf: 3, turnTimeoutSec: null, rules: { blindRound: 'off' } } });
    const b = await joinRoom(beto, a.code, 'Beto');
    ok(await ana.call('room:start'));
    const first = await ana.waitForView(() => true);
    const seqBefore = first.view.seq;
    await waitUntil(() => mundo.salvas.get(a.code)?.status === 'playing', 'estado salvo');

    const fresh = mundo.hibernar(a.code, [ana, beto]);
    const game = fresh.room!.game!;
    expect(game.state.seq).toBe(seqBefore);
    expect(fresh.room!.stateFor(a.playerId)).toMatchObject({ status: 'playing', bestOf: 3 });
    // As conexões continuam sentadas: jogam sem entrar de novo.
    const pa = autoPlay(ana);
    const pb = autoPlay(beto);
    const actor = game.state.round.order[0]!;
    const who = actor === a.playerId ? ana : beto;
    const bid = (who.lastView ?? (await who.waitForView(() => true))).view.legalBids[0]!;
    await who.call('game:action', { action: { type: 'bid', value: bid } });
    await ana.waitForState((s) => s.status === 'finished', 'fim depois de voltar', 30_000);
    // O token de antes continua valendo.
    const beto2 = connect(mundo);
    expect(await joinRoom(beto2, a.code, 'Beto', b.token)).toMatchObject({ playerId: b.playerId });
    pa.stop();
    pb.stop();
  });

  it('sala sem ninguém conectado acaba no prazo, mesmo acordando no meio (a contagem não recomeça)', async () => {
    const mundo = startWorld({ ociosaMs: 400, rateLimit: { burst: 10_000, perSecond: 10_000 } });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { rules: { blindRound: 'off' } } });
    await joinRoom(beto, a.code, 'Beto');
    ok(await ana.call('room:start'));
    await ana.waitForView(() => true);
    ana.close();
    beto.close();
    // A contagem da sala parada tem que estar no que foi salvo: é o que sobrevive à hibernação.
    await waitUntil(() => (mundo.salvas.get(a.code)?.idleSince ?? null) !== null, 'contagem salva', 1000);
    await new Promise((r) => setTimeout(r, 250));
    mundo.hibernar(a.code, []);
    // Faltavam ~150 ms: acaba no prazo de antes, não 400 ms depois de acordar.
    await waitUntil(() => mundo.encerradas.some((e) => e.code === a.code), 'sala encerrada por ociosa', 300);
  });

  it('no lobby, quem caiu antes de hibernar continua com o lugar depois de acordar', async () => {
    const mundo = startWorld({ coroaMs: 150 });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    beto.close();
    await ana.waitForState((s) => s.seats[1]?.kind === 'human' && !s.seats[1].connected);
    mundo.hibernar(a.code, [ana]);
    await new Promise((r) => setTimeout(r, 300));
    const sala = mundo.rooms.get(a.code)!;
    expect(sala.seatCount).toBe(2);
    expect(sala.hostId).toBe(a.playerId);
    const volta = connect(mundo);
    expect((await joinRoom(volta, a.code, 'Beto', b.token)).playerId).toBe(b.playerId);
  });
});
