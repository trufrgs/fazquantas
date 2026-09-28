import {
  BOT_NAMES,
  DEFAULT_RULES,
  ROOM_CAPACITY,
  normalizeRules,
  type JoinResult,
} from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../src/errors';
import { connect, createRoom, joinRoom, ok, startServer, waitUntil } from './helpers';

const CODE_FORMAT = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

describe('criar e entrar', () => {
  it('criar sala devolve código, token e room:state (ack antes do estado)', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const res = ok(await ana.call<JoinResult>('room:create', { name: '  Ana  ', avatar: 'ana-1' }));

    expect(res.code).toMatch(CODE_FORMAT);
    expect(res.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(res.playerId).toBeTruthy();

    const state = await ana.waitForState((s) => s.youId === res.playerId);
    expect(state).toEqual({
      code: res.code,
      status: 'lobby',
      seats: [
        { kind: 'human', playerId: res.playerId, name: 'Ana', avatar: 'ana-1', connected: true },
      ],
      hostId: res.playerId,
      youId: res.playerId,
      rules: { ...DEFAULT_RULES },
      turnTimeoutSec: 30,
      capacity: ROOM_CAPACITY,
    });
    expect(ana.events.slice(0, 2)).toEqual(['ack:room:create', 'room:state']);
    expect(JSON.stringify(ana.states)).not.toContain(res.token);
    expect(server.rooms.size).toBe(1);
  });

  it('avatar vazio ganha uma semente sorteada', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const res = ok(await ana.call<JoinResult>('room:create', { name: 'Ana', avatar: '' }));
    const state = await ana.waitForState((s) => s.youId === res.playerId);
    expect(state.seats[0]?.avatar).toMatch(/^[a-z0-9]{10}$/);
  });

  it('entra pelo código, inclusive em minúsculas; todos recebem o estado com o próprio youId', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const beto = await connect(server);
    const created = await createRoom(ana);
    const joined = await joinRoom(beto, ` ${created.code.toLowerCase()} `, 'Beto');

    expect(joined.code).toBe(created.code);
    expect(joined.playerId).not.toBe(created.playerId);
    expect(joined.token).not.toBe(created.token);

    const seen = await ana.waitForState((s) => s.seats.length === 2);
    const own = await beto.waitForState((s) => s.seats.length === 2);
    expect(seen.youId).toBe(created.playerId);
    expect(own.youId).toBe(joined.playerId);
    expect(own.hostId).toBe(created.playerId);
    expect(own.seats.map((s) => s.playerId)).toEqual([created.playerId, joined.playerId]);
  });

  it('código inexistente → ROOM_NOT_FOUND', async () => {
    const server = await startServer();
    const beto = await connect(server);
    const res = await beto.call('room:join', { code: 'ZZZZ', name: 'Beto', avatar: 'b' });
    expect(res).toEqual({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND', message: 'Sala não encontrada. Confira o código.' },
    });
  });

  it('sala cheia → ROOM_FULL (entrar e adicionar bot)', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const beto = await connect(server);
    const { code } = await createRoom(ana);
    for (let i = 1; i < ROOM_CAPACITY; i++)
      ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    await ana.waitForState((s) => s.seats.length === ROOM_CAPACITY);

    const join = await beto.call('room:join', { code, name: 'Beto', avatar: 'b' });
    expect(join).toEqual({ ok: false, error: { code: 'ROOM_FULL', message: MESSAGES.roomFull } });
    const bot = await ana.call('room:addBot', { difficulty: 'facil' });
    expect(bot).toMatchObject({ ok: false, error: { code: 'ROOM_FULL' } });

    const names = ana.state!.seats.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length); // bots sem nome repetido
  });

  it('entrar sem token numa partida em andamento → GAME_IN_PROGRESS', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const caio = await connect(server);
    const { code } = await createRoom(ana);
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ok(await ana.call('room:update', { turnTimeoutSec: null }));
    ok(await ana.call('room:start'));
    const res = await caio.call('room:join', { code, name: 'Caio', avatar: 'c' });
    expect(res).toMatchObject({ ok: false, error: { code: 'GAME_IN_PROGRESS' } });
  });

  it('criar ou entrar em outra sala sai da atual', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const beto = await connect(server);
    const first = await createRoom(ana);
    const second = await createRoom(beto, 'Beto');
    expect(server.rooms.size).toBe(2);

    await joinRoom(ana, second.code, 'Ana');
    expect(server.rooms.get(first.code)).toBeUndefined(); // ficou sem humanos
    const state = await beto.waitForState((s) => s.seats.length === 2);
    expect(state.code).toBe(second.code);
  });
});

describe('nomes', () => {
  it('humano homônimo de um bot faz o bot trocar de nome; homônimo de humano ganha número', async () => {
    const server = await startServer({ random: () => 0 });
    const ana = await connect(server);
    const { code } = await createRoom(ana);
    ok(await ana.call('room:addBot', { difficulty: 'medio' }));
    const bot = (await ana.waitForState((s) => s.seats.length === 2)).seats[1]!;

    const intruso = await connect(server);
    await joinRoom(intruso, code, bot.name);
    const state = await ana.waitForState((s) => s.seats.length === 3);
    const names = state.seats.map((s) => s.name);
    expect(names[2]).toBe(bot.name);
    expect(names[1]).not.toBe(bot.name);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3);

    const outraAna = await connect(server);
    await joinRoom(outraAna, code, 'Ana');
    const after = await ana.waitForState((s) => s.seats.length === 4);
    expect(after.seats[3]!.name).toBe('Ana 2');
  });
});

describe('anfitrião', () => {
  it('não-anfitrião recebe NOT_HOST em tudo que é do anfitrião', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const beto = await connect(server);
    const { code } = await createRoom(ana);
    const beto_ = await joinRoom(beto, code, 'Beto');
    ok(await ana.call('room:addBot', { difficulty: 'medio' }));
    const bot = (await ana.waitForState((s) => s.seats.length === 3)).seats[2]!;

    const attempts: [string, unknown[]][] = [
      ['room:start', []],
      ['room:rematch', []],
      ['room:lobby', []],
      ['room:addBot', [{ difficulty: 'facil' }]],
      ['room:update', [{ rules: { startingLives: 2 } }]],
      ['room:setBot', [{ playerId: bot.playerId, difficulty: 'dificil' }]],
      ['room:removeSeat', [{ playerId: bot.playerId }]],
    ];
    for (const [event, args] of attempts) {
      const res = await beto.call(event, ...args);
      expect(res, event).toEqual({
        ok: false,
        error: { code: 'NOT_HOST', message: 'Só o anfitrião pode fazer isso.' },
      });
    }
    expect(beto_.playerId).not.toBe(ana.state!.hostId);
    expect(server.rooms.get(code)!.status).toBe('lobby');
  });

  it('anfitrião adiciona bot, muda regras e começa', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const { code, playerId } = await createRoom(ana);

    ok(await ana.call('room:addBot', { difficulty: 'dificil' }));
    let state = await ana.waitForState((s) => s.seats.length === 2);
    const bot = state.seats[1]!;
    expect(bot).toMatchObject({ kind: 'bot', difficulty: 'dificil' });
    expect(BOT_NAMES).toContain(bot.name);
    expect(bot.avatar).toMatch(/^[a-z0-9]{10}$/);

    ok(
      await ana.call('room:update', {
        rules: { startingLives: 3, hierarchy: 'vira', maxCards: 5, inventada: true },
        turnTimeoutSec: 60,
      }),
    );
    state = await ana.waitForState((s) => s.turnTimeoutSec === 60);
    expect(state.rules).toEqual(
      normalizeRules({ ...DEFAULT_RULES, startingLives: 3, hierarchy: 'vira', maxCards: 5 }),
    );
    ok(await ana.call('room:update', { rules: { maxCards: null }, turnTimeoutSec: null }));
    state = await ana.waitForState((s) => s.turnTimeoutSec === null);
    expect(state.rules).toMatchObject({ startingLives: 3, hierarchy: 'vira', maxCards: null });

    ok(await ana.call('room:setBot', { playerId: bot.playerId, difficulty: 'facil' }));
    await ana.waitForState((s) => s.seats[1]?.kind === 'bot' && s.seats[1].difficulty === 'facil');

    const eventsBefore = ana.events.length;
    ok(await ana.call('room:start'));
    const playing = await ana.waitForState((s) => s.status === 'playing');
    const { view } = await ana.waitForView(() => true);
    expect(playing.status).toBe('playing');
    expect(view.you).toBe(playerId);
    expect(view.players.map((p) => p.id)).toEqual([playerId, bot.playerId]);
    expect(view.rules).toMatchObject({ startingLives: 3, hierarchy: 'vira' });
    // Ordem garantida: ack, depois o estado da sala, depois a primeira visão.
    expect(ana.events.slice(eventsBefore, eventsBefore + 3)).toEqual([
      'ack:room:start',
      'room:state',
      'game:view',
    ]);

    const again = await ana.call('room:start');
    expect(again).toMatchObject({ ok: false, error: { code: 'GAME_IN_PROGRESS' } });
    const locked = await ana.call('room:update', { rules: { startingLives: 2 } });
    expect(locked).toMatchObject({ ok: false, error: { code: 'GAME_IN_PROGRESS' } });
    const noBot = await ana.call('room:addBot', { difficulty: 'facil' });
    expect(noBot).toMatchObject({ ok: false, error: { code: 'GAME_IN_PROGRESS' } });
    const keepBot = await ana.call('room:removeSeat', { playerId: bot.playerId });
    expect(keepBot).toMatchObject({ ok: false, error: { code: 'GAME_IN_PROGRESS' } });
    expect(server.rooms.get(code)!.game).not.toBeNull();
  });

  it('sozinho não começa: NOT_ENOUGH_PLAYERS; fora de sala: NOT_IN_ROOM', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const beto = await connect(server);
    await createRoom(ana);
    expect(await ana.call('room:start')).toEqual({
      ok: false,
      error: { code: 'NOT_ENOUGH_PLAYERS', message: MESSAGES.notEnoughPlayers },
    });
    expect(await beto.call('room:start')).toMatchObject({
      ok: false,
      error: { code: 'NOT_IN_ROOM' },
    });
    const action = await beto.call('game:action', { action: { type: 'bid', value: 0 } });
    expect(action).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
    // Sair sem estar em sala é inofensivo.
    expect(await beto.call('room:leave')).toEqual({ ok: true });
  });

  it('anfitrião sai no lobby → coroa passa para o próximo humano', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const beto = await connect(server);
    const caio = await connect(server);
    const { code } = await createRoom(ana);
    const b = await joinRoom(beto, code, 'Beto');
    const c = await joinRoom(caio, code, 'Caio');

    expect(await ana.call('room:leave')).toEqual({ ok: true });
    const state = await caio.waitForState((s) => s.seats.length === 2);
    expect(state.hostId).toBe(b.playerId);
    expect(state.seats.map((s) => s.playerId)).toEqual([b.playerId, c.playerId]);

    ok(await beto.call('room:addBot', { difficulty: 'facil' }));
    expect(await caio.call('room:addBot', { difficulty: 'facil' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOST' },
    });
    // Quem saiu não recebe mais nada da sala.
    const statesBefore = ana.states.length;
    await caio.waitForState((s) => s.seats.length === 3);
    expect(ana.states.length).toBe(statesBefore);
  });

  it('expulsar humano: recebe room:kicked, sai da sala e pode voltar como novo', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const beto = await connect(server);
    const { code } = await createRoom(ana);
    const b = await joinRoom(beto, code, 'Beto');

    expect(await ana.call('room:removeSeat', { playerId: ana.state!.hostId })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
    ok(await ana.call('room:removeSeat', { playerId: b.playerId }));
    await beto.waitFor(() => beto.kicked === 1, 'room:kicked');
    const state = await ana.waitForState((s) => s.seats.length === 1);
    expect(state.seats[0]?.playerId).not.toBe(b.playerId);

    // O token antigo não vale mais; entra num assento novo.
    const back = await joinRoom(beto, code, 'Beto', b.token);
    expect(back.playerId).not.toBe(b.playerId);
    expect(await ana.call('room:removeSeat', { playerId: 'nao-existe' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: MESSAGES.seatGone },
    });
  });

  it('setBot só vale para bot; removeSeat tira o bot', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const { playerId } = await createRoom(ana);
    ok(await ana.call('room:addBot', { difficulty: 'medio' }));
    const bot = (await ana.waitForState((s) => s.seats.length === 2)).seats[1]!;
    expect(await ana.call('room:setBot', { playerId, difficulty: 'facil' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: MESSAGES.notBot },
    });
    ok(await ana.call('room:removeSeat', { playerId: bot.playerId }));
    await ana.waitForState((s) => s.seats.length === 1);
  });
});

describe('conexão e limpeza', () => {
  it('queda no lobby: volta com token no prazo; sem voltar, perde o assento e a coroa passa', async () => {
    const server = await startServer({ lobbyGraceMs: 200 });
    const ana = await connect(server);
    const beto = await connect(server);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');

    ana.close();
    await beto.waitForState((s) => s.seats[0]?.kind === 'human' && !s.seats[0].connected);
    const ana2 = await connect(server);
    const back = await joinRoom(ana2, a.code, 'Ana', a.token);
    expect(back).toEqual({ ok: true, code: a.code, playerId: a.playerId, token: a.token });
    const state = await beto.waitForState(
      (s) => s.seats[0]?.kind === 'human' && s.seats[0].connected,
    );
    expect(state.hostId).toBe(a.playerId);
    expect(state.seats).toHaveLength(2);

    ana2.close();
    const after = await beto.waitForState((s) => s.seats.length === 1, 'assento perdido', 3000);
    expect(after.hostId).toBe(b.playerId);
    expect(after.seats[0]?.playerId).toBe(b.playerId);

    const ana3 = await connect(server);
    const fresh = await joinRoom(ana3, a.code, 'Ana', a.token);
    expect(fresh.playerId).not.toBe(a.playerId);
  });

  it('todos saem com room:leave → a sala some na hora', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const beto = await connect(server);
    const { code } = await createRoom(ana);
    await joinRoom(beto, code, 'Beto');
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ok(await ana.call('room:leave'));
    ok(await beto.call('room:leave'));
    expect(server.rooms.size).toBe(0);
    expect(await beto.call('room:join', { code, name: 'Beto', avatar: 'b' })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
  });

  it('todos caem → a sala some na limpeza periódica', async () => {
    const server = await startServer({
      idleRoomMs: 100,
      cleanupIntervalMs: 25,
      lobbyGraceMs: 60_000,
    });
    const ana = await connect(server);
    const beto = await connect(server);
    const keep = await connect(server);
    const { code } = await createRoom(ana);
    await joinRoom(beto, code, 'Beto');
    const other = await createRoom(keep, 'Caio');

    ana.close();
    beto.close();
    await waitUntil(() => server.rooms.get(code)?.idleSince != null, 'sala ociosa');
    expect(server.rooms.get(code)).toBeDefined(); // ainda no prazo de reconexão
    await waitUntil(() => server.rooms.get(code) === undefined, 'limpeza da sala', 3000);
    expect(server.rooms.get(other.code)).toBeDefined(); // quem tem gente conectada fica
  });
});
