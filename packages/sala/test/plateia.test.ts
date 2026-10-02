import { PLATEIA_CAPACITY, ROOM_CAPACITY, type JoinResult } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../src/erros';
import { autoPlay, connect, createRoom, joinRoom, ok, startWorld } from './helpers';

/** Sala com Ana (anfitriã) e um bot, partida sem limite de tempo começada. */
async function partidaRolando() {
  const mundo = startWorld();
  const ana = connect(mundo);
  const { code, playerId: anaId } = await createRoom(ana);
  ok(await ana.call('room:addBot', { difficulty: 'facil' }));
  ok(await ana.call('room:update', { turnTimeoutSec: null }));
  ok(await ana.call('room:start'));
  await ana.waitForState((s) => s.status === 'playing');
  return { mundo, ana, code, anaId };
}

describe('plateia', () => {
  it('quem chega com a partida rolando senta na plateia e vê a mesa, sem mão', async () => {
    const { mundo, ana, code } = await partidaRolando();
    const caio = connect(mundo);
    const res = ok(await caio.call<JoinResult>('room:join', { code, name: 'Caio', avatar: 'c' }));
    const state = await caio.waitForState((s) => (s.plateia ?? []).length === 1);
    expect(state.seats.map((s) => s.playerId)).not.toContain(res.playerId);
    expect(state.plateia).toEqual([{ playerId: res.playerId, name: 'Caio', avatar: 'c', connected: true, quer: false, aceito: false }]);
    const view = await caio.waitForView(() => true);
    expect(view.view.you).toBe(res.playerId);
    expect(view.view.hand).toBeNull();
    expect(view.view.players.map((p) => p.id)).not.toContain(res.playerId);
    // A anfitriã também vê a plateia.
    await ana.waitForState((s) => (s.plateia ?? []).length === 1);
  });

  it('mesa cheia no lobby: o próximo vai para a plateia; plateia cheia: ROOM_FULL', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const { code } = await createRoom(ana);
    for (let i = 1; i < ROOM_CAPACITY; i++) ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    for (let i = 0; i < PLATEIA_CAPACITY; i++) ok(await connect(mundo).call('room:join', { code, name: `P${i}`, avatar: 'p' }));
    const state = await ana.waitForState((s) => (s.plateia ?? []).length === PLATEIA_CAPACITY);
    expect(state.seats).toHaveLength(ROOM_CAPACITY);
    const sobra = await connect(mundo).call('room:join', { code, name: 'Zeca', avatar: 'z' });
    expect(sobra).toEqual({ ok: false, error: { code: 'ROOM_FULL', message: MESSAGES.roomFull } });
  });

  it('pede para jogar, o patrão aceita e ela senta na próxima partida', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const { code } = await createRoom(ana, 'Ana', { settings: { rules: { startingLives: 1, maxCards: 2 }, turnTimeoutSec: 30 } });
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    const jogando = autoPlay(ana);
    ok(await ana.call('room:start'));
    await ana.waitForState((s) => s.status === 'playing');
    const caio = connect(mundo);
    const { playerId: caioId } = ok(await caio.call<JoinResult>('room:join', { code, name: 'Caio', avatar: 'c' }));
    ok(await caio.call('room:querJogar', { quer: true }));
    await ana.waitForState((s) => s.plateia?.[0]?.quer === true);
    // Quem não é patrão não aceita (nem a própria plateia).
    expect(await caio.call('room:aceitar', { playerId: caioId, aceito: true })).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    ok(await ana.call('room:aceitar', { playerId: caioId, aceito: true }));
    let s = await caio.waitForState((x) => x.plateia?.[0]?.aceito === true);
    // Segue na plateia até a partida acabar.
    expect(s.seats.map((x) => x.playerId)).not.toContain(caioId);
    await ana.waitForState((x) => x.status === 'finished', 'fim', 30000);
    jogando.stop();
    ok(await ana.call('room:rematch'));
    s = await caio.waitForState((x) => x.status === 'playing' && x.seats.some((seat) => seat.playerId === caioId));
    expect(s.plateia).toEqual([]);
    const view = await caio.waitForView((m) => m.view.players.some((p) => p.id === caioId));
    expect(view.view.players.find((p) => p.id === caioId)?.name).toBe('Caio');
  });

  it('aceita no lobby: senta na hora; recusar limpa o pedido', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const { code } = await createRoom(ana);
    for (let i = 1; i < ROOM_CAPACITY; i++) ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    const caio = connect(mundo);
    const { playerId: caioId } = ok(await caio.call<JoinResult>('room:join', { code, name: 'Caio', avatar: 'c' }));
    ok(await caio.call('room:querJogar', { quer: true }));
    ok(await ana.call('room:aceitar', { playerId: caioId, aceito: false }));
    await ana.waitForState((s) => s.plateia?.[0]?.quer === false);
    // Abriu lugar (tirou um bot) e aceitou: senta.
    const bot = ana.state!.seats.at(-1)!.playerId;
    ok(await ana.call('room:removeSeat', { playerId: bot }));
    ok(await ana.call('room:aceitar', { playerId: caioId, aceito: true }));
    const s = await caio.waitForState((x) => x.seats.some((seat) => seat.playerId === caioId));
    expect(s.plateia).toEqual([]);
  });

  it('plateia sai sem virar bot; a partida segue; ela conversa (microfone e câmera)', async () => {
    const { mundo, ana, code } = await partidaRolando();
    const caio = connect(mundo);
    const { playerId: caioId } = ok(await caio.call<JoinResult>('room:join', { code, name: 'Caio', avatar: 'c' }));
    ok(await caio.call('midia:estado', { mic: true, camera: true }));
    await ana.waitForState((s) => (s.midias ?? []).some((m) => m.playerId === caioId && m.camera));
    ok(await caio.call('room:leave'));
    const s = await ana.waitForState((x) => (x.plateia ?? []).length === 0);
    expect(s.seats).toHaveLength(2);
    expect(s.status).toBe('playing');
    expect((s.midias ?? []).some((m) => m.playerId === caioId)).toBe(false);
  });

  it('a plateia não joga; quem joga não pede "jogar a próxima"', async () => {
    const { mundo, ana, code } = await partidaRolando();
    const caio = connect(mundo);
    ok(await caio.call<JoinResult>('room:join', { code, name: 'Caio', avatar: 'c' }));
    const jogada = await caio.call('game:action', { action: { type: 'bid', value: 0 } });
    expect(jogada).toMatchObject({ ok: false, error: { code: 'GAME_ERROR' } });
    expect(await ana.call('room:querJogar', { quer: true })).toEqual({ ok: false, error: { code: 'INVALID_PAYLOAD', message: MESSAGES.naoPlateia } });
  });
});

describe('patrões', () => {
  it('patrão faz outro patrão; o novo patrão manda (senha no meio da partida, aceitar)', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const { code, playerId: anaId } = await createRoom(ana);
    const { playerId: betoId } = await joinRoom(beto, code, 'Beto');
    expect(await beto.call('room:update', { password: '1234' })).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    ok(await ana.call('room:patrao', { playerId: betoId, patrao: true }));
    const s = await beto.waitForState((x) => (x.patroes ?? []).includes(betoId));
    expect(s.patroes).toEqual([anaId, betoId]);
    ok(await beto.call('room:update', { turnTimeoutSec: null }));
    ok(await beto.call('room:start'));
    await beto.waitForState((x) => x.status === 'playing');
    // Senha no meio da partida, para não entrar mais gente de fora.
    ok(await beto.call('room:update', { password: 'tche' }));
    const comSenha = await beto.waitForState((x) => x.hasPassword);
    expect(comSenha.password).toBe('tche');
    const naoPatrao = connect(mundo);
    expect(await naoPatrao.call('room:join', { code, name: 'Caio', avatar: 'c' })).toMatchObject({ ok: false, error: { code: 'PASSWORD_REQUIRED' } });
    const caio = ok(await naoPatrao.call<JoinResult>('room:join', { code, name: 'Caio', avatar: 'c', password: 'tche' }));
    // Quem não é patrão não vê a senha.
    const doCaio = await naoPatrao.waitForState((x) => x.youId === caio.playerId);
    expect(doCaio.password).toBeNull();
  });

  it('passar o chapéu: o anfitrião faz outro patrão e sai de patrão; não volta sozinho', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const { code, playerId: anaId } = await createRoom(ana);
    const { playerId: betoId } = await joinRoom(beto, code, 'Beto');
    expect(await ana.call('room:patrao', { playerId: anaId, patrao: false })).toEqual({ ok: false, error: { code: 'INVALID_PAYLOAD', message: MESSAGES.semPatrao } });
    ok(await ana.call('room:patrao', { playerId: betoId, patrao: true }));
    ok(await ana.call('room:patrao', { playerId: anaId, patrao: false }));
    const s = await ana.waitForState((x) => x.hostId === betoId);
    expect(s.patroes).toEqual([betoId]);
    expect(await ana.call('room:addBot', { difficulty: 'facil' })).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    // A coroa não volta para quem criou só porque ele está olhando a mesa.
    ok(await ana.call('room:present'));
    expect(mundo.rooms.get(code)!.hostId).toBe(betoId);
  });

  it('bot não vira patrão; patrão que sai da sala deixa de ser patrão', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const { code, playerId: anaId } = await createRoom(ana);
    const { playerId: betoId } = await joinRoom(beto, code, 'Beto');
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    const bot = (await ana.waitForState((s) => s.seats.length === 3)).seats[2]!.playerId;
    expect(await ana.call('room:patrao', { playerId: bot, patrao: true })).toEqual({ ok: false, error: { code: 'INVALID_PAYLOAD', message: MESSAGES.patraoHumano } });
    ok(await ana.call('room:patrao', { playerId: betoId, patrao: true }));
    ok(await beto.call('room:leave'));
    const s = await ana.waitForState((x) => x.seats.length === 2);
    expect(s.patroes).toEqual([anaId]);
  });

  it('o anfitrião sai: o chapéu vai para outro patrão antes de ir para o próximo da mesa', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const caio = connect(mundo);
    const { code } = await createRoom(ana);
    await joinRoom(beto, code, 'Beto');
    const { playerId: caioId } = await joinRoom(caio, code, 'Caio');
    ok(await ana.call('room:patrao', { playerId: caioId, patrao: true }));
    ok(await ana.call('room:leave'));
    const s = await beto.waitForState((x) => x.seats.length === 2);
    expect(s.hostId).toBe(caioId);
    expect(s.patroes).toEqual([caioId]);
  });
});
