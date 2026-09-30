import { describe, expect, it } from 'vitest';
import { STUN_PUBLICOS } from '../src/servidor';
import { connect, createRoom, joinRoom, ok, startWorld } from './helpers';

describe('conversa por voz', () => {
  it('quem entra aparece para a sala, recebe os servidores ICE, e o sinal só passa entre quem está nela', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const caio = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    const c = await joinRoom(caio, a.code, 'Caio');

    const entrou = await ana.call('voz:entrar');
    ok(entrou);
    expect((entrou as unknown as { iceServers: unknown }).iceServers).toEqual(STUN_PUBLICOS);
    ok(await beto.call('voz:entrar'));
    await caio.waitForState((s) => s.vozes?.length === 2, 'Ana e Beto na conversa');
    expect(caio.state?.vozes).toEqual([
      { playerId: a.playerId, mudo: false },
      { playerId: b.playerId, mudo: false },
    ]);

    // Ana manda a oferta para o Beto; o Caio (fora da conversa) não recebe nem consegue mandar.
    ok(await ana.call('voz:sinal', { para: b.playerId, dados: { type: 'offer', sdp: 'v=0' } }));
    ok(await caio.call('voz:sinal', { para: a.playerId, dados: { type: 'offer', sdp: 'intruso' } }));
    expect(beto.sinais).toEqual([{ de: a.playerId, dados: { type: 'offer', sdp: 'v=0' } }]);
    expect(ana.sinais).toEqual([]);
    expect(caio.sinais).toEqual([]);

    // Mudo aparece para todo mundo; quem cai sai da conversa.
    ok(await beto.call('voz:mudo', { mudo: true }));
    await ana.waitForState((s) => s.vozes?.some((v) => v.playerId === b.playerId && v.mudo) === true, 'Beto mudo');
    beto.fechar(1000, 'saiu');
    await ana.waitForState((s) => s.vozes?.length === 1, 'Beto caiu e saiu da conversa');
    ok(await ana.call('voz:sair'));
    await caio.waitForState((s) => s.vozes?.length === 0, 'conversa vazia');
    expect(c.playerId).toBeTruthy();
  });

  it('a conversa continua depois de a sala hibernar', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    ok(await ana.call('voz:entrar'));
    ok(await beto.call('voz:entrar'));
    await ana.waitForState((s) => s.vozes?.length === 2, 'os dois na conversa');
    mundo.hibernar(a.code, [ana, beto]);
    ok(await ana.call('voz:sinal', { para: b.playerId, dados: { type: 'answer', sdp: 'depois' } }));
    expect(beto.sinais.at(-1)).toEqual({ de: a.playerId, dados: { type: 'answer', sdp: 'depois' } });
  });
});
