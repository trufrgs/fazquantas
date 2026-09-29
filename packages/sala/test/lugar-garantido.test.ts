import type { JoinResult } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../src/erros';
import { autoPlay, connect, createRoom, joinRoom, ok, startWorld, waitUntil } from './helpers';

/**
 * O lugar é de quem sentou até ele sair, o anfitrião tirar ou a sala acabar. Relato de 29/09/2026:
 * criou a sala no iPhone, foi ao WhatsApp mandar um áudio chamando a gurizada e, na volta, "teu lugar
 * nessa sala não vale mais": o lobby dava 3 min para voltar e depois tirava o assento.
 */

const volta = (code: string, token: string, name = 'Ana') => ({ code, name, avatar: name.toLowerCase(), token, auto: true });
// Partida curta e ao vivo (30 s por jogada; `null` seria "sem limite", que é assíncrona).
const QUICK = { rules: { startingLives: 1, maxCards: 2 }, turnTimeoutSec: 30 };

describe('lugar garantido', () => {
  it('o anfitrião vai ao WhatsApp além do prazo e volta: o lugar é dele, e a coroa volta com ele', async () => {
    const mundo = startWorld({ coroaMs: 80 });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');

    ana.close();
    // Quem está na mesa não fica preso esperando: a coroa passa para ele, e o lugar da Ana fica.
    const semAna = await beto.waitForState((s) => s.hostId === b.playerId, 'a coroa passa para quem ficou', 2000);
    expect(semAna.seats.map((s) => s.playerId)).toEqual([a.playerId, b.playerId]);
    await new Promise((r) => setTimeout(r, 200));
    expect(mundo.rooms.get(a.code)!.seatCount).toBe(2);

    const celular = connect(mundo);
    const r = ok(await celular.call<JoinResult>('room:join', volta(a.code, a.token)));
    expect(r.playerId).toBe(a.playerId);
    await beto.waitForState((s) => s.hostId === a.playerId && s.seats[0]?.kind === 'human' && s.seats[0].connected, 'a coroa volta para quem criou');
  });

  it('sozinha na sala esperando a gurizada: sai, volta muito depois e a sala continua lá', async () => {
    const mundo = startWorld({ coroaMs: 40 });
    const ana = connect(mundo);
    const a = await createRoom(ana);
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ana.close();
    await new Promise((r) => setTimeout(r, 250));
    expect(mundo.rooms.get(a.code)?.seatCount).toBe(2);
    // Sem ninguém olhando a mesa, a coroa fica onde está (nunca vai para o bot).
    expect(mundo.rooms.get(a.code)?.hostId).toBe(a.playerId);
    expect(mundo.encerradas).toEqual([]);
    const celular = connect(mundo);
    expect(ok(await celular.call<JoinResult>('room:join', volta(a.code, a.token))).playerId).toBe(a.playerId);
    const state = await celular.waitForState((s) => s.youId === a.playerId);
    expect(state.hostId).toBe(a.playerId);
  });

  it('a coroa só passa para quem está na mesa: chegou alguém com o anfitrião fora há tempo, ela vai para ele', async () => {
    const mundo = startWorld({ coroaMs: 40 });
    const ana = connect(mundo);
    const a = await createRoom(ana);
    ana.close();
    await new Promise((r) => setTimeout(r, 120));
    const beto = connect(mundo);
    const b = await joinRoom(beto, a.code, 'Beto');
    const state = await beto.waitForState((s) => s.hostId === b.playerId, 'quem chegou pode começar');
    expect(state.seats).toHaveLength(2);
    const celular = connect(mundo);
    ok(await celular.call<JoinResult>('room:join', volta(a.code, a.token)));
    await beto.waitForState((s) => s.hostId === a.playerId, 'a coroa volta para quem criou');
  });

  it('na sala de cada um no seu tempo, ficar fora é o normal: nem o lugar nem a coroa mudam', async () => {
    const mundo = startWorld({ coroaMs: 30 });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: 21600 } });
    await joinRoom(beto, a.code, 'Beto');
    ana.close();
    await new Promise((r) => setTimeout(r, 150));
    const sala = mundo.rooms.get(a.code)!;
    expect(sala.seatCount).toBe(2);
    expect(sala.hostId).toBe(a.playerId);
  });

  it('partida terminada: quem saiu da tela segura o lugar para a próxima', async () => {
    const mundo = startWorld({ coroaMs: 40 });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: QUICK });
    const b = await joinRoom(beto, a.code, 'Beto');
    const pa = autoPlay(ana);
    const pb = autoPlay(beto);
    ok(await ana.call('room:start'));
    await beto.waitForState((s) => s.status === 'finished', 'fim da partida', 30_000);
    pa.stop();
    pb.stop();
    beto.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(mundo.rooms.get(a.code)!.seatCount).toBe(2);
    const celular = connect(mundo);
    expect(ok(await celular.call<JoinResult>('room:join', volta(a.code, b.token, 'Beto'))).playerId).toBe(b.playerId);
  });

  it('o prazo da coroa conta desde a queda, mesmo com a sala hibernando no meio', async () => {
    const mundo = startWorld({ coroaMs: 150 });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    ana.close();
    await beto.waitForState((s) => s.seats[0]?.kind === 'human' && !s.seats[0].connected, 'Ana caiu');
    await waitUntil(() => mundo.salvas.get(a.code)?.seats[0]?.kind === 'human', 'estado salvo');
    await new Promise((r) => setTimeout(r, 100));
    mundo.hibernar(a.code, [beto]);
    // Faltavam ~50 ms quando acordou: passa perto disso, não 150 ms depois.
    const t0 = Date.now();
    await beto.waitForState((s) => s.hostId === b.playerId, 'a coroa passa no prazo de antes', 1000);
    expect(Date.now() - t0).toBeLessThan(140);
    expect(mundo.rooms.get(a.code)!.seatCount).toBe(2);
  });

  it('voltar com o app em segundo plano não pega a coroa de volta; olhar a mesa, sim', async () => {
    const mundo = startWorld({ coroaMs: 60 });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    ana.close();
    await beto.waitForState((s) => s.hostId === b.playerId, 'a coroa passa para o Beto');
    // O Android reconectou sozinho com o jogo escondido: o lugar volta, a coroa fica com quem está olhando.
    const fundo = connect(mundo);
    expect(ok(await fundo.call<JoinResult>('room:join', { ...volta(a.code, a.token), visible: false })).playerId).toBe(a.playerId);
    await new Promise((r) => setTimeout(r, 30));
    expect(mundo.rooms.get(a.code)!.hostId).toBe(b.playerId);
    fundo.send('presence', { visible: true });
    await beto.waitForState((s) => s.hostId === a.playerId, 'a coroa volta quando a Ana olha a mesa');
  });

  it('anfitrião com o jogo escondido (conexão viva) além do prazo: a coroa passa e volta quando ele olha', async () => {
    const mundo = startWorld({ coroaMs: 60 });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    ana.send('presence', { visible: false });
    const passou = await beto.waitForState((s) => s.hostId === b.playerId, 'a coroa passa para quem está olhando');
    expect(passou.seats.map((s) => s.playerId)).toEqual([a.playerId, b.playerId]);
    ana.send('presence', { visible: true });
    await beto.waitForState((s) => s.hostId === a.playerId, 'a coroa volta');
  });

  it('quem criou e saiu de vez não pega a coroa de volta ao entrar de novo', async () => {
    const mundo = startWorld({ coroaMs: 60 });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    ok(await ana.call('room:leave'));
    await beto.waitForState((s) => s.hostId === b.playerId && s.seats.length === 1, 'a coroa fica com o Beto');
    const denovo = connect(mundo);
    const nova = await joinRoom(denovo, a.code, 'Ana');
    expect(nova.playerId).not.toBe(a.playerId);
    await new Promise((r) => setTimeout(r, 30));
    expect(mundo.rooms.get(a.code)!.hostId).toBe(b.playerId);
  });

  it('sala salva pela versão de antes (sem quem criou): o anfitrião salvo conta como quem criou', async () => {
    const mundo = startWorld({ coroaMs: 80 });
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    ana.close();
    await waitUntil(() => mundo.salvas.get(a.code)?.seats[0]?.kind === 'human', 'estado salvo');
    const salva = mundo.salvas.get(a.code)!;
    delete salva.criadorId;
    for (const seat of salva.seats) if (seat.kind === 'human') delete seat.foraDesde;
    mundo.hibernar(a.code, [beto]);
    await beto.waitForState((s) => s.hostId === b.playerId, 'a coroa passa depois de acordar', 2000);
    const celular = connect(mundo);
    ok(await celular.call<JoinResult>('room:join', volta(a.code, a.token)));
    await beto.waitForState((s) => s.hostId === a.playerId, 'a coroa volta para a Ana');
  });

  it('sala que acabou porque todo mundo saiu: o link antigo diz isso, não que ficou horas vazia', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const a = await createRoom(ana);
    ok(await ana.call('room:leave'));
    const beto = connect(mundo);
    expect(await beto.call('room:join', { code: a.code, name: 'Beto', avatar: 'beto' })).toEqual({
      ok: false,
      error: { code: 'ROOM_GONE', message: MESSAGES.roomGoneVazia },
    });
  });
});
