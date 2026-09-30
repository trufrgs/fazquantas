import type { ClientAction } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { connect, createRoom, ok, startWorld, type ClienteTeste } from './helpers';

/** Joga mal de propósito: canta sempre o máximo (com um palito, erra e sai logo). */
function jogaMal(client: ClienteTeste): void {
  let lastSeq = -1;
  client.onView((message) => {
    const v = message.view;
    if (v.phase === 'gameOver' || v.seq < lastSeq) lastSeq = -1;
    if (!v.actor || v.actor.playerId !== v.you || v.seq === lastSeq) return;
    let action: ClientAction | null = null;
    if (v.actor.kind === 'bid' && v.legalBids.length > 0) action = { type: 'bid', value: Math.max(...v.legalBids) };
    else if (v.actor.kind === 'play' && v.legalCards.length > 1) action = { type: 'play', cardId: v.legalCards[0]! };
    if (!action) return;
    lastSeq = v.seq;
    void client.call('game:action', { action });
  });
}

describe('acelerar até o fim', () => {
  it('só quando nenhum humano ainda joga; aí a partida corre em câmera rápida e a próxima volta ao normal', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const a = await createRoom(ana);
    for (const difficulty of ['facil', 'medio', 'dificil'] as const) ok(await ana.call('room:addBot', { difficulty }));
    ok(await ana.call('room:update', { rules: { startingLives: 1, maxCards: 3 }, turnTimeoutSec: null }));
    jogaMal(ana);

    let acelerou = false;
    for (let partida = 0; partida < 6 && !acelerou; partida++) {
      ok(await (partida === 0 ? ana.call('room:start') : ana.call('room:rematch')));
      await ana.waitForState((s) => s.status === 'playing' && !s.acelerando, 'partida rolando');
      // Com a Ana ainda jogando, não acelera.
      const cedo = await ana.call('game:acelerar');
      expect(cedo.ok).toBe(false);
      // A Ana erra e sai; se a partida ainda não acabou, dá para acelerar.
      const fora = await ana.waitForView(
        (m) => m.view.phase === 'gameOver' || !!m.view.players.find((p) => p.id === a.playerId)?.eliminated,
        'Ana fora (ou fim)',
        30_000,
      );
      if (fora.view.phase === 'gameOver' || mundo.rooms.get(a.code)?.status !== 'playing') {
        await ana.waitForState((s) => s.status === 'finished', 'fim');
        continue;
      }
      const pedido = await ana.call('game:acelerar');
      if (!pedido.ok) {
        // Acabou entre a visão e o pedido.
        await ana.waitForState((s) => s.status === 'finished', 'fim');
        continue;
      }
      await ana.waitForState((s) => s.acelerando === true, 'câmera rápida ligada');
      acelerou = true;
      await ana.waitForState((s) => s.status === 'finished', 'fim da partida acelerada', 30_000);
    }
    expect(acelerou).toBe(true);
    // A revanche volta ao ritmo da sala.
    ok(await ana.call('room:rematch'));
    await ana.waitForState((s) => s.status === 'playing', 'revanche');
    expect(ana.state?.acelerando).toBe(false);
  });
});
