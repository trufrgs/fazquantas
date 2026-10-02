import type { JoinResult } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../src/erros';
import { connect, createRoom, joinRoom, ok, startWorld } from './helpers';

const LOOSE = { rateLimit: { burst: 10_000, perSecond: 10_000 } };

describe('entrada inválida', () => {
  it('payload inválido ou ausente → INVALID_PAYLOAD, e a sala segue viva', async () => {
    const mundo = startWorld(LOOSE);
    const ana = connect(mundo);
    const { code } = await createRoom(ana);
    const huge = { name: 'x'.repeat(10_000), avatar: 'a' };
    const nested = { name: { toString: 'Ana' }, avatar: ['a'] };

    const creates: unknown[] = [
      undefined,
      null,
      'texto',
      42,
      [1, 2, 3],
      { name: 123, avatar: 'a' },
      { name: '   ', avatar: 'a' },
      { name: 'Um nome comprido demais', avatar: 'a' },
      { name: 'Ana', avatar: 'tem espaço' },
      { name: 'Ana', avatar: 'a'.repeat(65) },
      huge,
      nested,
      { name: 'Ana', avatar: 'a', profileKey: 'curta' },
      { name: 'Ana', avatar: 'a', settings: { pace: 'lenta' } },
      { name: 'Ana', avatar: 'a', settings: { password: '' } },
    ];
    for (const payload of creates) {
      // Criação vai para um código novo; o que importa é a validação.
      const res = await connect(mundo).call('room:create', payload);
      expect(res, `room:create ${JSON.stringify(payload)?.slice(0, 80)}`).toEqual({
        ok: false,
        error: { code: 'INVALID_PAYLOAD', message: expect.any(String) },
      });
    }

    const cases: [string, unknown][] = [
      ['room:join', { code: 'IIII', name: 'Ana', avatar: 'a' }],
      ['room:join', { code: 'ABC', name: 'Ana', avatar: 'a' }],
      ['room:join', { code: 1234, name: 'Ana', avatar: 'a' }],
      ['room:join', { code, name: 'Ana', avatar: 'a', token: 'x'.repeat(65) }],
      ['room:join', { code, name: 'Ana', avatar: 'a', token: 7 }],
      ['room:join', { code, name: 'Ana', avatar: 'a', password: 'x'.repeat(500) }],
      ['room:update', { rules: { startingLives: 99 } }],
      ['room:update', { rules: { hierarchy: 'paulista' } }],
      ['room:update', { rules: 'todas' }],
      ['room:update', { turnTimeoutSec: 45 }],
      ['room:update', { turnTimeoutSec: '30' }],
      ['room:update', { pace: 'turbo' }],
      ['room:update', { bestOf: 2 }],
      ['room:update', { bestOf: '3' }],
      ['room:update', { ranked: 'sim' }],
      ['room:update', { password: '   ' }],
      ['room:update', { password: 'x'.repeat(25) }],
      ['room:addBot', { difficulty: 'impossivel' }],
      ['room:addBot', {}],
      ['room:setBot', { playerId: '', difficulty: 'facil' }],
      ['room:removeSeat', { playerId: 7 }],
      ['game:action', { action: { type: 'bid', value: 99 } }],
      ['game:action', { action: { type: 'bid', value: 1.5 } }],
      ['game:action', { action: { type: 'play', cardId: 'X9' } }],
      ['game:action', { action: { type: 'continue' } }],
      ['game:action', { type: 'bid', value: 1 }],
      ['game:react', { reaction: 'xingar' }],
      ['presence', { visible: 'sim' }],
    ];
    for (const [event, payload] of cases) {
      const res = await ana.call(event, payload, { at: code });
      expect(res, `${event} ${JSON.stringify(payload).slice(0, 80)}`).toEqual({
        ok: false,
        error: { code: 'INVALID_PAYLOAD', message: expect.any(String) },
      });
    }

    expect(await connect(mundo).call('room:create', { name: '', avatar: 'a' })).toEqual({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: MESSAGES.name },
    });
    expect(await connect(mundo).call('room:join', { code: '0000', name: 'Ana', avatar: 'a' })).toEqual({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: MESSAGES.code },
    });
    expect(await ana.call('room:update', { rules: { startingLives: 0 } })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: expect.stringContaining('Vidas iniciais') },
    });
    expect(await ana.call('room:update', { password: 'x'.repeat(25) })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: MESSAGES.password },
    });

    // Sem resposta, com lixo, e eventos que não existem: nada responde, nada cai.
    await ana.raw('não é json');
    await ana.raw('null');
    await ana.raw('[1,2,3]');
    await ana.raw(JSON.stringify({ e: 'nao:existe', d: { a: 1 } }));
    await ana.raw(JSON.stringify({ e: 'room:start', id: 'x' }));
    ana.send('game:action');
    ana.send('game:react');
    ana.send('error', 'boom');

    // A mesma conexão continua funcionando, e a sala também.
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    const state = await ana.waitForState((s) => s.seats.length === 2);
    expect(state.code).toBe(code);
  });

  it('nome é limpo: controles e marcas invisíveis saem, espaços se juntam', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const res = ok(
      await ana.call<JoinResult>('room:create', {
        name: `  Zé${String.fromCharCode(0x202e)}\n da${String.fromCharCode(7)}   Silva `,
        avatar: 'ze',
      }),
    );
    const state = await ana.waitForState((s) => s.youId === res.playerId);
    expect(state.seats[0]?.name).toBe('Zé da Silva');
  });

  it('mensagem gigante fecha só aquela conexão', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const { code } = await createRoom(ana);
    const beto = connect(mundo);
    await joinRoom(beto, code, 'Beto');
    await beto.raw(JSON.stringify({ e: 'game:react', d: { reaction: 'tri', lixo: 'x'.repeat(200_000) } }));
    expect(beto.closed?.code).toBe(1009);
    const state = await ana.waitForState((s) => s.seats[1]?.kind === 'human' && !s.seats[1].connected);
    expect(state.seats).toHaveLength(2);
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
  });
});

describe('limites', () => {
  it('rajada acima do limite recebe RATE_LIMITED e é ignorada', async () => {
    const mundo = startWorld({ agora: () => 1_000_000 }); // relógio parado: o balde não enche
    const ana = connect(mundo);
    const { code } = await createRoom(ana); // 1 ficha
    const results = await Promise.all(Array.from({ length: 30 }, () => ana.call('room:addBot', { difficulty: 'facil' })));
    const accepted = results.filter((r) => r.ok || r.error.code !== 'RATE_LIMITED');
    const limited = results.filter((r) => !r.ok && r.error.code === 'RATE_LIMITED');
    expect(accepted).toHaveLength(19);
    expect(limited).toHaveLength(11);
    expect(limited[0]).toEqual({ ok: false, error: { code: 'RATE_LIMITED', message: MESSAGES.rateLimited } });
    // Ignorada mesmo: o que estourou o limite não mudou a sala.
    expect(mundo.rooms.get(code)!.seatCount).toBe(8);
    // Outra conexão tem o próprio balde.
    const beto = connect(mundo);
    // (com a mesa cheia, ele entra na plateia)
    expect(await beto.call('room:join', { code, name: 'Beto', avatar: 'b' })).toMatchObject({ ok: true });
  });

  it('reações vão para todos da sala, no máximo uma a cada 1,5 s por jogador', async () => {
    let now = 5_000;
    const mundo = startWorld({ agora: () => now });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const outsider = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    await createRoom(outsider, 'Caio');

    ana.send('game:react', { reaction: 'tri' });
    ana.send('game:react', { reaction: 'masbah' }); // cedo demais: ignorada
    beto.send('game:react', { reaction: 'barbada' }); // o limite é por jogador
    await ana.waitFor(() => ana.reactions.length === 2, 'duas reações');
    now += 1_500;
    ana.send('game:react', { reaction: 'bemcapaz' });
    expect(await ana.call('game:react', { reaction: 'nada' })).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    await beto.waitFor(() => beto.reactions.some((r) => r.reaction === 'bemcapaz'), 'reação depois do intervalo');

    expect(beto.reactions).toEqual([
      { playerId: a.playerId, reaction: 'tri', at: 5_000 },
      { playerId: b.playerId, reaction: 'barbada', at: 5_000 },
      { playerId: a.playerId, reaction: 'bemcapaz', at: 6_500 },
    ]);
    expect(ana.reactions).toEqual(beto.reactions);
    expect(outsider.reactions).toEqual([]);
  });
});
