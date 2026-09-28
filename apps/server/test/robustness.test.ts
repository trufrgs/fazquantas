import type { JoinResult } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../src/errors';
import { connect, createRoom, joinRoom, ok, rawRequest, startServer } from './helpers';

const LOOSE = { rateLimit: { burst: 10_000, perSecond: 10_000 } };

describe('entrada inválida', () => {
  it('payload inválido ou ausente → INVALID_PAYLOAD, e o servidor segue vivo', async () => {
    const server = await startServer(LOOSE);
    const ana = await connect(server);
    await createRoom(ana);
    const huge = { name: 'x'.repeat(10_000), avatar: 'a' };
    const nested = { name: { toString: 'Ana' }, avatar: ['a'] };

    const cases: [string, unknown[]][] = [
      ['room:create', []],
      ['room:create', [undefined]],
      ['room:create', [null]],
      ['room:create', ['texto']],
      ['room:create', [42]],
      ['room:create', [[1, 2, 3]]],
      ['room:create', [{ name: 123, avatar: 'a' }]],
      ['room:create', [{ name: '   ', avatar: 'a' }]],
      ['room:create', [{ name: 'Um nome comprido demais', avatar: 'a' }]],
      ['room:create', [{ name: 'Ana', avatar: 'tem espaço' }]],
      ['room:create', [{ name: 'Ana', avatar: 'a'.repeat(65) }]],
      ['room:create', [huge]],
      ['room:create', [nested]],
      ['room:join', [{ code: 'IIII', name: 'Ana', avatar: 'a' }]],
      ['room:join', [{ code: 'ABC', name: 'Ana', avatar: 'a' }]],
      ['room:join', [{ code: 1234, name: 'Ana', avatar: 'a' }]],
      ['room:join', [{ code: 'ABCD', name: 'Ana', avatar: 'a', token: 'x'.repeat(65) }]],
      ['room:join', [{ code: 'ABCD', name: 'Ana', avatar: 'a', token: 7 }]],
      ['room:update', [{ rules: { startingLives: 99 } }]],
      ['room:update', [{ rules: { hierarchy: 'paulista' } }]],
      ['room:update', [{ rules: 'todas' }]],
      ['room:update', [{ turnTimeoutSec: 45 }]],
      ['room:update', [{ turnTimeoutSec: '30' }]],
      ['room:addBot', [{ difficulty: 'impossivel' }]],
      ['room:addBot', [{}]],
      ['room:setBot', [{ playerId: '', difficulty: 'facil' }]],
      ['room:removeSeat', [{ playerId: 7 }]],
      ['game:action', [{ action: { type: 'bid', value: 99 } }]],
      ['game:action', [{ action: { type: 'bid', value: 1.5 } }]],
      ['game:action', [{ action: { type: 'play', cardId: 'X9' } }]],
      ['game:action', [{ action: { type: 'continue' } }]],
      ['game:action', [{ type: 'bid', value: 1 }]],
      ['game:react', [{ reaction: 'xingar' }]],
    ];

    for (const [event, args] of cases) {
      const res = await ana.call(event, ...args);
      expect(res, `${event} ${JSON.stringify(args).slice(0, 80)}`).toEqual({
        ok: false,
        error: { code: 'INVALID_PAYLOAD', message: expect.any(String) },
      });
    }

    expect(await ana.call('room:create', { name: '', avatar: 'a' })).toEqual({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: MESSAGES.name },
    });
    expect(await ana.call('room:join', { code: '0000', name: 'Ana', avatar: 'a' })).toEqual({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: MESSAGES.code },
    });
    expect(await ana.call('room:update', { rules: { startingLives: 0 } })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: expect.stringContaining('Vidas iniciais') },
    });

    // Sem ack, com lixo, e eventos que não existem: nada responde, nada cai.
    ana.send('room:create');
    ana.send('room:create', 'x', 1, null);
    ana.send('game:action');
    ana.send('game:react');
    ana.send('room:start', 1, 2, 3);
    ana.send('nao:existe', { a: 1 });
    ana.send('room:leave', { inesperado: true });

    const health = await rawRequest(server.url, '/health');
    expect(health.status).toBe(200);
    // O mesmo socket continua funcionando (e o room:leave sem ack acima tirou a Ana da sala).
    const again = ok(await ana.call<JoinResult>('room:create', { name: 'Ana', avatar: 'a' }));
    expect(again.code).toHaveLength(4);
  });

  it('nome é limpo: controles e marcas invisíveis saem, espaços se juntam', async () => {
    const server = await startServer();
    const ana = await connect(server);
    const res = ok(
      await ana.call<JoinResult>('room:create', {
        name: `  Zé${String.fromCharCode(0x202e)}\n da${String.fromCharCode(7)}   Silva `,
        avatar: 'ze',
      }),
    );
    const state = await ana.waitForState((s) => s.youId === res.playerId);
    expect(state.seats[0]?.name).toBe('Zé da Silva');
  });

  it('mensagem gigante derruba só aquela conexão', async () => {
    const server = await startServer();
    const ana = await connect(server);
    ana.send('room:create', { name: 'Ana', avatar: 'a', lixo: 'x'.repeat(200_000) });
    await ana.waitFor(() => !ana.connected, 'conexão encerrada');
    const beto = await connect(server);
    await createRoom(beto, 'Beto');
    expect(server.rooms.size).toBe(1);
  });

  it('um cliente que emite o evento "error" não derruba o servidor', async () => {
    const server = await startServer();
    const ana = await connect(server);
    ana.send('error', 'boom');
    ana.send('error', { message: 'boom' });
    const res = ok(await ana.call<JoinResult>('room:create', { name: 'Ana', avatar: 'a' }));
    expect(res.code).toHaveLength(4);
  });
});

describe('limites', () => {
  it('rajada acima do limite recebe RATE_LIMITED e é ignorada', async () => {
    const server = await startServer({ now: () => 1_000_000 }); // relógio parado: o balde não enche
    const ana = await connect(server);
    const results = await Promise.all(Array.from({ length: 30 }, () => ana.call('room:leave')));
    const limited = results.filter((r) => !r.ok);
    expect(results.filter((r) => r.ok)).toHaveLength(20);
    expect(limited).toHaveLength(10);
    expect(limited[0]).toEqual({
      ok: false,
      error: { code: 'RATE_LIMITED', message: MESSAGES.rateLimited },
    });
    // Ignorada mesmo: criar sala estourando o limite não cria nada.
    expect(await ana.call('room:create', { name: 'Ana', avatar: 'a' })).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(server.rooms.size).toBe(0);
    // Outro socket tem o próprio balde.
    const beto = await connect(server);
    await createRoom(beto, 'Beto');
  });

  it('reações vão para todos da sala, no máximo uma a cada 1,5 s por jogador', async () => {
    let now = 5_000;
    const server = await startServer({ now: () => now });
    const ana = await connect(server);
    const beto = await connect(server);
    const outsider = await connect(server);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    await createRoom(outsider, 'Caio');

    ana.send('game:react', { reaction: 'tri' });
    ana.send('game:react', { reaction: 'masbah' }); // cedo demais: ignorada
    beto.send('game:react', { reaction: 'barbada' }); // o limite é por jogador
    await ana.waitFor(() => ana.reactions.length === 2, 'duas reações');
    now += 1_500;
    ana.send('game:react', { reaction: 'bemcapaz' });
    expect(await ana.call('game:react', { reaction: 'nada' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
    await beto.waitFor(
      () => beto.reactions.some((r) => r.reaction === 'bemcapaz'),
      'reação depois do intervalo',
    );

    expect(beto.reactions).toEqual([
      { playerId: a.playerId, reaction: 'tri', at: 5_000 },
      { playerId: b.playerId, reaction: 'barbada', at: 5_000 },
      { playerId: a.playerId, reaction: 'bemcapaz', at: 6_500 },
    ]);
    expect(ana.reactions).toEqual(beto.reactions);
    expect(outsider.reactions).toEqual([]);
  });
});
