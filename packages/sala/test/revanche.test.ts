import { describe, expect, it } from 'vitest';
import { autoPlay, connect, createRoom, joinRoom, ok, startWorld, waitUntil, type ClienteTeste } from './helpers';

/**
 * Pós-jogo (pedido de 29/09/2026: "facilitar a revanche"). Antes, só o anfitrião puxava, e quem
 * estava na mesa ficava olhando "esperando o anfitrião". Agora qualquer um pede; o anfitrião vê quem
 * pediu, e quando todo mundo que está olhando a mesa pediu, a revanche começa sozinha.
 */

// Partida curta e ao vivo (30 s por jogada; `null` seria "sem limite", que é assíncrona).
const QUICK = { rules: { startingLives: 1, maxCards: 2 }, turnTimeoutSec: 30 };

async function partidaAteOFim(clientes: ClienteTeste[]) {
  const jogando = clientes.map((c) => autoPlay(c));
  ok(await clientes[0]!.call('room:start'));
  await clientes[0]!.waitForState((s) => s.status === 'finished', 'fim da partida', 30_000);
  for (const j of jogando) j.stop();
}

describe('revanche', () => {
  it('convidado pede: o anfitrião vê quem pediu e puxa', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: QUICK });
    const b = await joinRoom(beto, a.code, 'Beto');
    await partidaAteOFim([ana, beto]);

    ok(await beto.call('room:rematch'));
    const pedido = await ana.waitForState((s) => (s.revanche ?? []).includes(b.playerId), 'a Ana vê o pedido do Beto');
    expect(pedido.status).toBe('finished');

    ok(await ana.call('room:rematch'));
    const nova = await beto.waitForState((s) => s.status === 'playing', 'a revanche começou');
    expect(nova.revanche).toEqual([]);
  });

  it('com o anfitrião olhando a mesa, os pedidos esperam por ele', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: QUICK });
    await joinRoom(beto, a.code, 'Beto');
    await partidaAteOFim([ana, beto]);
    ok(await beto.call('room:rematch'));
    await new Promise((r) => setTimeout(r, 30));
    expect(mundo.rooms.get(a.code)!.status).toBe('finished');
  });

  it('todo mundo que está na mesa pediu: começa sozinha, sem esperar o anfitrião que saiu', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const caio = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: QUICK });
    await joinRoom(beto, a.code, 'Beto');
    await joinRoom(caio, a.code, 'Caio');
    await partidaAteOFim([ana, beto, caio]);
    ana.send('presence', { visible: false }); // a anfitriã foi para o WhatsApp
    await waitUntil(() => mundo.rooms.get(a.code)!.stateFor(a.playerId) !== undefined, 'estado');
    ok(await beto.call('room:rematch'));
    expect(mundo.rooms.get(a.code)!.status).toBe('finished');
    ok(await caio.call('room:rematch'));
    await beto.waitForState((s) => s.status === 'playing', 'começou sozinha');
    // A Ana continua com o lugar dela na partida nova.
    expect(mundo.rooms.get(a.code)!.seatCount).toBe(3);
  });

  it('voltar para o lobby esquece os pedidos; o pedido sobrevive à sala hibernar', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: QUICK });
    const b = await joinRoom(beto, a.code, 'Beto');
    await partidaAteOFim([ana, beto]);
    ok(await beto.call('room:rematch'));
    await waitUntil(() => (mundo.salvas.get(a.code)?.revanche ?? []).includes(b.playerId), 'pedido salvo');
    mundo.hibernar(a.code, [ana, beto]);
    expect(mundo.rooms.get(a.code)!.stateFor(a.playerId).revanche).toEqual([b.playerId]);
    ok(await ana.call('room:lobby'));
    const lobby = await beto.waitForState((s) => s.status === 'lobby', 'de volta ao lobby');
    expect(lobby.revanche).toEqual([]);
  });
});
