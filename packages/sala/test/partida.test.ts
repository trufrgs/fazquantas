import type { JoinResult } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import {
  autoPlay,
  connect,
  createRoom,
  joinRoom,
  ok,
  privacyViolations,
  startWorld,
  waitUntil,
  type ClienteTeste,
  type Mundo,
} from './helpers';

/** Confere cada visão no instante em que chega, contra o estado real da sala. */
function watchPrivacy(mundo: Mundo, client: ClienteTeste, code: string, youId: string) {
  const problems: string[] = [];
  client.onView((message) => {
    const truth = mundo.rooms.get(code)?.game?.state ?? null;
    problems.push(...privacyViolations(message, youId, truth));
  });
  return problems;
}

async function twoHumans(mundo: Mundo) {
  const ana = connect(mundo);
  const beto = connect(mundo);
  const a = await createRoom(ana);
  const b = await joinRoom(beto, a.code, 'Beto');
  return { ana, beto, a, b, code: a.code };
}

describe('partida online', () => {
  it('2 humanos + 2 bots jogam até o fim sem vazar cartas; depois, revanche', async () => {
    const mundo = startWorld();
    const { ana, beto, a, b, code } = await twoHumans(mundo);
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ok(await ana.call('room:addBot', { difficulty: 'medio' }));
    ok(
      await ana.call('room:update', {
        rules: { startingLives: 2, maxCards: 3 },
        turnTimeoutSec: null,
      }),
    );

    const leaksA = watchPrivacy(mundo, ana, code, a.playerId);
    const leaksB = watchPrivacy(mundo, beto, code, b.playerId);
    const playerA = autoPlay(ana);
    const playerB = autoPlay(beto);

    ok(await ana.call('room:start'));
    await ana.waitForState((s) => s.status === 'finished', 'fim da partida', 45_000);
    const final = await beto.waitForView((m) => m.view.phase === 'gameOver', 'visão final');

    expect(final.view.result?.winners.length).toBeGreaterThan(0);
    expect(final.view.result?.ranking).toHaveLength(4);
    expect(final.view.history.length).toBeGreaterThan(1);
    // Houve rodadas às cegas e rodadas normais; nenhuma visão vazou nada.
    expect(ana.views.some((m) => m.view.blind)).toBe(true);
    expect(ana.views.some((m) => !m.view.blind && (m.view.hand?.length ?? 0) > 1)).toBe(true);
    expect(leaksA).toEqual([]);
    expect(leaksB).toEqual([]);
    for (const m of ana.views) expect(m.view.you).toBe(a.playerId);
    for (const m of beto.views) expect(m.view.you).toBe(b.playerId);
    // Jogadas dos bots e automáticas chegam com actorId/auto.
    const bots = ana.state!.seats.filter((s) => s.kind === 'bot').map((s) => s.playerId);
    expect(ana.views.some((m) => m.auto && bots.includes(m.actorId ?? ''))).toBe(true);
    expect(ana.views.some((m) => !m.auto && m.actorId === b.playerId)).toBe(true);
    // Todos os palpites/cartas legais que os humanos mandaram foram aceitos.
    expect(playerA.errors).toEqual([]);
    expect(playerB.errors).toEqual([]);

    // Revanche: o convidado pede (com a anfitriã olhando a mesa, espera por ela); ela puxa, e começa
    // na hora com os mesmos assentos.
    ok(await beto.call('room:rematch'));
    expect(mundo.rooms.get(a.code)!.status).toBe('finished');
    const viewsBefore = beto.views.length;
    ok(await ana.call('room:rematch'));
    await beto.waitForState((s) => s.status === 'playing', 'revanche');
    const fresh = await beto.waitFor(
      () =>
        beto.views
          .slice(viewsBefore)
          .find((m) => m.view.roundNumber === 1 && m.view.result === null),
      'primeira visão da revanche',
    );
    expect(fresh.view.players.map((p) => p.id)).toEqual(final.view.players.map((p) => p.id));
    expect(fresh.view.players.every((p) => p.lives === 2)).toBe(true);
    playerA.stop();
    playerB.stop();
  });

  it('depois do fim, o anfitrião volta a sala para o lobby e gente nova pode entrar', async () => {
    const mundo = startWorld();
    const { ana, beto, code } = await twoHumans(mundo);
    ok(await ana.call('room:update', { rules: { startingLives: 1, maxCards: 2 }, turnTimeoutSec: null }));
    const playerA = autoPlay(ana);
    const playerB = autoPlay(beto);
    expect(await ana.call('room:lobby')).toEqual({ ok: true }); // no lobby: nada muda
    ok(await ana.call('room:start'));
    expect(await ana.call('room:lobby')).toMatchObject({ ok: false, error: { code: 'GAME_IN_PROGRESS' } });
    await ana.waitForState((s) => s.status === 'finished', 'fim da partida', 45_000);
    playerA.stop();
    playerB.stop();

    ok(await ana.call('room:lobby'));
    await beto.waitForState((s) => s.status === 'lobby', 'sala de volta ao lobby');
    expect(mundo.rooms.get(code)!.game).toBeNull();

    const cida = connect(mundo);
    await joinRoom(cida, code, 'Cida');
    const state = await ana.waitForState((s) => s.seats.length === 3, 'Cida na sala');
    expect(state.seats.map((s) => s.name)).toEqual(['Ana', 'Beto', 'Cida']);
    ok(await ana.call('room:start'));
    await cida.waitForView((m) => m.view.roundNumber === 1, 'Cida joga a nova partida');
  });

  it('ação fora da vez e ação duplicada dão erro sem mudar o estado', async () => {
    const mundo = startWorld();
    const { ana, beto, a, code } = await twoHumans(mundo);
    ok(await ana.call('room:update', { rules: { blindRound: 'off' }, turnTimeoutSec: 120 }));
    ok(await ana.call('room:start'));
    const first = await ana.waitForView(() => true);
    await beto.waitForView(() => true);

    const game = mundo.rooms.get(code)!.game!;
    const actorId = first.view.actor!.playerId;
    const [actor, other] = actorId === a.playerId ? [ana, beto] : [beto, ana];
    const seq = game.state.seq;
    const viewCount = other.views.length;

    const outOfTurn = await other.call('game:action', { action: { type: 'bid', value: 0 } });
    expect(outOfTurn).toEqual({
      ok: false,
      error: { code: 'GAME_ERROR', message: 'Não é tua vez.' },
    });
    // Mandar o playerId de quem está na vez não adianta: vale sempre o do socket.
    const spoofed = await other.call('game:action', {
      action: { type: 'bid', value: 0, playerId: actorId },
      playerId: actorId,
    });
    expect(spoofed).toMatchObject({ ok: false, error: { code: 'GAME_ERROR' } });
    expect(game.state.seq).toBe(seq);

    const bid = actor.lastView!.view.legalBids[0]!;
    const [once, twice] = await Promise.all([
      actor.call('game:action', { action: { type: 'bid', value: bid } }),
      actor.call('game:action', { action: { type: 'bid', value: bid } }),
    ]);
    expect(once).toEqual({ ok: true });
    expect(twice).toMatchObject({ ok: false, error: { code: 'GAME_ERROR' } });
    expect(game.state.seq).toBe(seq + 1);

    // Uma visão nova só para o palpite aceito.
    await other.waitFor(() => other.views.length === viewCount + 1, 'visão do palpite');
    const wrongCard = await other.call('game:action', { action: { type: 'play', cardId: 'P3' } });
    expect(wrongCard).toMatchObject({ ok: false, error: { code: 'GAME_ERROR' } });
    expect(game.state.seq).toBe(seq + 1);
    expect(other.views.length).toBe(viewCount + 1);
  });

  it('reconexão com token no meio da partida devolve o assento e a mão', async () => {
    const mundo = startWorld();
    const { ana, beto, b, code } = await twoHumans(mundo);
    ok(await ana.call('room:update', { rules: { blindRound: 'off' }, turnTimeoutSec: 120 }));
    ok(await ana.call('room:start'));
    await beto.waitForView(() => true);

    beto.close();
    await ana.waitForState(
      (s) => s.seats[1]?.kind === 'human' && !s.seats[1].connected,
      'Beto caiu',
    );
    expect(mundo.rooms.get(code)!.game!.isAway(b.playerId)).toBe(true);

    const beto2 = connect(mundo);
    const res = ok(
      await beto2.call<JoinResult>('room:join', {
        code: code.toLowerCase(),
        name: 'Outro Nome',
        avatar: 'outro',
        token: b.token,
      }),
    );
    expect(res).toEqual({ ok: true, code, playerId: b.playerId, token: b.token });

    const state = await beto2.waitForState((s) => s.status === 'playing');
    await beto2.waitForView((m) => m.view.you === b.playerId);
    expect(state.youId).toBe(b.playerId);
    expect(state.seats[1]).toMatchObject({ playerId: b.playerId, name: 'Beto', connected: true });
    // Ordem garantida: ack, estado da sala, e só então a visão.
    expect(beto2.events.slice(0, 3)).toEqual(['ack:room:join', 'room:state', 'game:view']);

    const game = mundo.rooms.get(code)!.game!;
    expect(game.isAway(b.playerId)).toBe(false);
    await waitUntil(() => beto2.lastView?.view.seq === game.state.seq, 'visão atualizada');
    const { view } = beto2.lastView!;
    expect(view.you).toBe(b.playerId);
    expect(view.hand?.length).toBeGreaterThan(0);
    expect(view.hand).toEqual(game.state.round.hands[b.playerId]);
    await ana.waitForState(
      (s) => s.seats[1]?.kind === 'human' && s.seats[1].connected,
      'Beto voltou',
    );
  });

  it('reconectar em outra conexão fecha a antiga, sem marcar o jogador como desconectado', async () => {
    const mundo = startWorld();
    const { ana, beto, b, code } = await twoHumans(mundo);
    const beto2 = connect(mundo);
    ok(await beto2.call('room:join', { code, name: 'Beto', avatar: 'beto', token: b.token }));

    await beto.waitFor(() => !beto.connected, 'conexão antiga fechada');
    // Aviso e código que fazem o app não reconectar sozinho (evita duas abas brigando).
    expect(beto.replaced).toBe(1);
    expect(beto.closed?.code).toBe(4001);
    await beto2.waitForState((s) => s.youId === b.playerId);
    // Uma volta de mensagem depois, o assento continua conectado.
    ok(await ana.call('room:update', { turnTimeoutSec: 30 }));
    const state = await ana.waitForState((s) => s.turnTimeoutSec === 30);
    expect(state.seats[1]).toMatchObject({ playerId: b.playerId, connected: true });
    expect(state.seats).toHaveLength(2);
  });

  it('humano que cai tem a vez jogada automaticamente', async () => {
    const mundo = startWorld();
    const { ana, beto, b } = await twoHumans(mundo);
    ok(await ana.call('room:update', { turnTimeoutSec: 120 }));
    const player = autoPlay(ana);
    ok(await ana.call('room:start'));
    await beto.waitForView(() => true);

    beto.close();
    const auto = await ana.waitFor(
      () => ana.views.find((m) => m.actorId === b.playerId),
      'jogada automática do Beto',
    );
    expect(auto.auto).toBe(true);
    expect(auto.view.players.find((p) => p.id === b.playerId)?.bid).not.toBeNull();
    player.stop();
  });

  it('sair no meio da partida vira bot médio; a coroa passa se era o anfitrião', async () => {
    const mundo = startWorld();
    const { ana, beto, a, b, code } = await twoHumans(mundo);
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ok(await ana.call('room:update', { turnTimeoutSec: 120 }));
    ok(await ana.call('room:start'));
    await beto.waitForView(() => true);

    ok(await ana.call('room:leave'));
    const state = await beto.waitForState((s) => s.seats[0]?.kind === 'bot');
    expect(state.status).toBe('playing');
    expect(state.hostId).toBe(b.playerId);
    expect(state.seats[0]).toEqual({
      kind: 'bot',
      playerId: a.playerId,
      name: 'Ana',
      avatar: 'ana',
      difficulty: 'medio',
    });
    // O token de quem saiu não devolve o assento: ela volta para a plateia (02/10/2026).
    const again = ok(await ana.call<{ playerId: string }>('room:join', { code, name: 'Ana', avatar: 'ana', token: a.token }));
    expect(again.playerId).not.toBe(a.playerId);
    const depois = await beto.waitForState((s) => (s.plateia ?? []).length === 1);
    expect(depois.seats[0]?.kind).toBe('bot');
  });

  it('sem nenhum humano conectado a partida pausa; volta quando alguém reconecta', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const a = await createRoom(ana);
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
    ok(await ana.call('room:start'));
    await ana.waitForView(() => true);
    const game = mundo.rooms.get(a.code)!.game!;

    ana.close();
    await waitUntil(() => game.isPaused, 'pausa');
    const seq = game.state.seq;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(game.state.seq).toBe(seq); // nada anda sem ninguém olhando

    const ana2 = connect(mundo);
    await joinRoom(ana2, a.code, 'Ana', a.token);
    await waitUntil(() => !game.isPaused, 'retomada');
    const { view } = await ana2.waitForView((m) => m.view.you === a.playerId);
    expect(view.seq).toBeGreaterThanOrEqual(seq);
  });
});
