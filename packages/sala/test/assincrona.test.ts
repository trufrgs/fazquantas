import { currentActor } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { autoPlay, connect, createRoom, joinRoom, ok, startWorld, waitUntil } from './helpers';

/**
 * Sala assíncrona (1 h ou mais por jogada, ou sem limite): quem fecha o jogo não vira bot nem
 * fica ausente; a vez espera o prazo e vira aviso (com lembrete antes de acabar).
 */
describe('sala assíncrona', () => {
  it('quem fecha o jogo na partida não vira ausente: a vez espera, vira aviso e ele volta para jogar', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: 43200, rules: { blindRound: 'off' } } });
    const b = await joinRoom(beto, a.code, 'Beto');
    const pa = autoPlay(ana);
    ok(await ana.call('room:start'));
    beto.close();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const game = () => mundo.rooms.get(a.code)!.game!;
    await waitUntil(() => currentActor(game().state)?.playerId === b.playerId, 'vez do Beto', 5000);
    const seq = game().state.seq;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(game().state.seq).toBe(seq); // ninguém joga por ele
    expect(game().isAway(b.playerId)).toBe(false);
    expect(game().isPaused).toBe(false);
    const aviso = mundo.avisos.find((x) => x.playerId === b.playerId && x.kind === 'turn');
    expect(aviso?.deadline).toBeGreaterThan(Date.now() + 11 * 3600_000);

    const beto2 = connect(mundo);
    const pb = autoPlay(beto2); // antes de entrar: a visão chega junto com a volta
    await joinRoom(beto2, a.code, 'Beto', b.token);
    await beto2.waitForView((m) => m.view.seq > seq, 'a partida anda com o Beto de volta');
    pa.stop();
    pb.stop();
  });

  it('lembrete quando falta um quarto do prazo; depois o tempo estoura e a mesa joga', async () => {
    const mundo = startWorld({ turnScale: 0.00005 }); // 1 h vira 180 ms; lembrete a 45 ms do fim
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: 3600, rules: { blindRound: 'off' } } });
    const b = await joinRoom(beto, a.code, 'Beto');
    beto.send('presence', { visible: false });
    const pa = autoPlay(ana);
    ok(await ana.call('room:start'));
    const lembrete = await ana.waitFor(
      () => mundo.avisos.find((x) => x.playerId === b.playerId && x.kind === 'reminder'),
      'lembrete',
      5000,
    );
    expect(lembrete.deadline).toBeTypeOf('number');
    const game = () => mundo.rooms.get(a.code)!.game!;
    const seq = game().state.seq;
    await waitUntil(() => game().state.seq > seq, 'tempo estourado, a mesa joga', 5000);
    pa.stop();
  });

  it('quem fecha o jogo no lobby segura o lugar além do prazo da sala ao vivo', async () => {
    const mundo = startWorld({ graceMs: 30 });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: 21600 } });
    await joinRoom(beto, a.code, 'Beto');
    beto.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mundo.rooms.get(a.code)!.seatCount).toBe(2);
  });

  it('começar com alguém fora avisa essa pessoa', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: null } });
    const b = await joinRoom(beto, a.code, 'Beto');
    beto.close();
    await new Promise((resolve) => setTimeout(resolve, 5)); // a queda chega como evento
    ok(await ana.call('room:start'));
    expect(mundo.avisos.some((x) => x.playerId === b.playerId && x.kind === 'start')).toBe(true);
  });

  it('sem ninguém conectado, a sala assíncrona dura além da ociosidade normal e acaba depois', async () => {
    const mundo = startWorld({ ociosaMs: 30, ociosaAssincronaMs: 250 });
    const ana = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: 3600 } });
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ok(await ana.call('room:start'));
    ana.close();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(mundo.rooms.get(a.code)).toBeDefined();
    await waitUntil(() => mundo.rooms.get(a.code) === undefined, 'sala acaba depois da ociosidade assíncrona', 2000);
    expect(mundo.encerradas.at(-1)?.motivo).toBe('ociosa');
  });

  it('a sala ao vivo continua jogando por quem cai', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: 120 } });
    const b = await joinRoom(beto, a.code, 'Beto');
    ok(await ana.call('room:start'));
    beto.close();
    await waitUntil(() => mundo.rooms.get(a.code)!.game!.isAway(b.playerId), 'Beto ausente na ao vivo');
  });
});
