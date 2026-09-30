import { describe, expect, it } from 'vitest';
import { STUN_PUBLICOS } from '../src/servidor';
import { connect, createRoom, joinRoom, ok, startWorld } from './helpers';

describe('microfone e câmera', () => {
  it('o que cada um abre aparece para a sala; o sinal passa entre quem está nela', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const caio = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    const c = await joinRoom(caio, a.code, 'Caio');

    const ice = await ana.call('midia:ice');
    ok(ice);
    expect((ice as unknown as { iceServers: unknown }).iceServers).toEqual(STUN_PUBLICOS);

    ok(await ana.call('midia:estado', { mic: true, camera: false }));
    ok(await beto.call('midia:estado', { mic: false, camera: true }));
    await caio.waitForState((s) => s.midias?.length === 2, 'Ana de microfone, Beto de câmera');
    expect(caio.state?.midias).toEqual([
      { playerId: a.playerId, mic: true, camera: false },
      { playerId: b.playerId, mic: false, camera: true },
    ]);

    // Qualquer um da sala pode ligar para qualquer um (quem não abriu nada também vê e ouve).
    ok(await caio.call('midia:sinal', { para: a.playerId, dados: { type: 'offer', sdp: 'v=0' } }));
    expect(ana.sinais).toEqual([{ de: c.playerId, dados: { type: 'offer', sdp: 'v=0' } }]);
    ok(await ana.call('midia:sinal', { para: 'ninguem', dados: { type: 'answer' } }));
    expect([beto.sinais, caio.sinais]).toEqual([[], []]);

    // Fechar tudo tira da lista; quem cai também some.
    ok(await ana.call('midia:estado', { mic: false, camera: false }));
    await caio.waitForState((s) => s.midias?.length === 1, 'Ana fechou tudo');
    beto.fechar(1000, 'saiu');
    await caio.waitForState((s) => s.midias?.length === 0, 'Beto caiu');
  });

  it('continua depois de a sala hibernar; bot não abre nada', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ok(await ana.call('midia:estado', { mic: true, camera: true }));
    await beto.waitForState((s) => s.midias?.length === 1, 'Ana abriu tudo');
    mundo.hibernar(a.code, [ana, beto]);
    ok(await beto.call('midia:sinal', { para: a.playerId, dados: { type: 'offer', sdp: 'depois' } }));
    expect(ana.sinais.at(-1)).toEqual({ de: b.playerId, dados: { type: 'offer', sdp: 'depois' } });
    // Para um bot o sinal não vai a lugar nenhum (e não quebra nada).
    const bot = beto.state!.seats.find((s) => s.kind === 'bot')!;
    ok(await ana.call('midia:sinal', { para: bot.playerId, dados: { type: 'offer' } }));
  });
});
