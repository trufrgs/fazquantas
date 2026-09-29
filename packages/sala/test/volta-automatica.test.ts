import { WS_CLOSE, type JoinResult } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../src/erros';
import { connect, createRoom, joinRoom, ok, startWorld, waitUntil } from './helpers';

/**
 * A volta que o app faz sozinho (`auto`: reconexão, abrir o app) versus a entrada que a pessoa pede.
 * Achados da rodada de QA de 29/09/2026: a volta automática sentava como gente nova quem tinha sido
 * tirado sem conexão, e tomava o lugar do aparelho que a pessoa estava usando.
 */

const volta = (code: string, token: string | undefined, extra: object = {}) => ({ code, name: 'Beto', avatar: 'beto', token, auto: true, ...extra });

describe('volta automática', () => {
  it('não toma o lugar de uma conexão viva; a entrada pedida, sim', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    const celular = connect(mundo);
    const r = await celular.call<JoinResult>('room:join', volta(a.code, b.token));
    expect(r).toEqual({ ok: false, error: { code: 'SEAT_TAKEN', message: MESSAGES.seatTaken } });
    expect(beto.connected).toBe(true);
    expect(beto.replaced).toBe(0);
    // A pessoa tocou em "Voltar pra sala" no celular: assume.
    const r2 = ok(await celular.call<JoinResult>('room:join', { ...volta(a.code, b.token), auto: false }));
    expect(r2.playerId).toBe(b.playerId);
    await waitUntil(() => beto.closed?.code === WS_CLOSE.replaced, 'o notebook foi avisado');
  });

  it('a mesma aba voltando sempre assume, mesmo com a conexão velha dela parecendo viva', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const velha = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(velha, a.code, 'Beto', undefined, { aba: 'aba-do-beto-1' });
    velha.silencioMs = 5_000; // morreu há 5 s; o servidor ainda não sabe
    const nova = connect(mundo);
    const r = ok(await nova.call<JoinResult>('room:join', volta(a.code, b.token, { aba: 'aba-do-beto-1' })));
    expect(r.playerId).toBe(b.playerId);
    // Outra aba, com a nova conexão viva: não toma.
    const outra = connect(mundo);
    const r2 = await outra.call<JoinResult>('room:join', volta(a.code, b.token, { aba: 'outra-aba-99' }));
    expect(r2.ok ? null : r2.error.code).toBe('SEAT_TAKEN');
  });

  it('a conexão antiga muda há mais de 30 s (morta em silêncio): a volta automática assume', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    beto.silencioMs = 40_000;
    const novo = connect(mundo);
    const r = ok(await novo.call<JoinResult>('room:join', volta(a.code, b.token)));
    expect(r.playerId).toBe(b.playerId);
  });

  it('tirado pelo anfitrião enquanto estava sem conexão: ouve "te tiraram" e não senta de novo', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    beto.close();
    await ana.waitForState((s) => s.seats[1]?.kind === 'human' && !s.seats[1].connected, 'Beto caiu');
    ok(await ana.call('room:removeSeat', { playerId: b.playerId }));
    const voltou = connect(mundo);
    const r = await voltou.call<JoinResult>('room:join', volta(a.code, b.token));
    expect(r).toEqual({ ok: false, error: { code: 'KICKED', message: MESSAGES.kicked } });
    expect(mundo.rooms.get(a.code)!.seatCount).toBe(1);
  });

  it('o tirado continua sabendo depois de a sala hibernar', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    ok(await ana.call('room:removeSeat', { playerId: b.playerId }));
    await waitUntil(() => mundo.salvas.get(a.code)?.seats.length === 1, 'estado salvo');
    mundo.hibernar(a.code, [ana]);
    const voltou = connect(mundo);
    const r = await voltou.call<JoinResult>('room:join', volta(a.code, b.token));
    expect(r.ok ? null : r.error.code).toBe('KICKED');
  });

  it('lugar que não vale mais (saiu): a volta automática ouve o porquê; entrando pelo código, senta de novo', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    ok(await beto.call('room:leave'));
    const voltou = connect(mundo);
    const r = await voltou.call<JoinResult>('room:join', volta(a.code, b.token));
    expect(r).toEqual({ ok: false, error: { code: 'SEAT_LOST', message: MESSAGES.seatLost } });
    const denovo = ok(await voltou.call<JoinResult>('room:join', { ...volta(a.code, b.token), auto: false }));
    expect(denovo.playerId).not.toBe(b.playerId);
  });

  it('sem token, o mesmo perfil recupera o lugar; o mesmo nome de outro perfil, não', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const chave = 'k'.repeat(22);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto', undefined, { profileKey: chave });
    beto.close();
    await ana.waitForState((s) => s.seats[1]?.kind === 'human' && !s.seats[1].connected, 'Beto caiu');
    const impostor = connect(mundo);
    const r = await impostor.call<JoinResult>('room:join', volta(a.code, undefined, { profileKey: 'z'.repeat(22) }));
    expect(r.ok ? null : r.error.code).toBe('SEAT_LOST');
    const dono = connect(mundo);
    const r2 = ok(await dono.call<JoinResult>('room:join', volta(a.code, undefined, { profileKey: chave })));
    expect(r2.playerId).toBe(b.playerId);
  });
});

describe('entrada robusta', () => {
  it('a conexão que fecha enquanto o perfil é conferido não fica presa ao lugar', async () => {
    const mundo = startWorld({
      conferirPerfil: async (_id, nome) => {
        await new Promise((r) => setTimeout(r, 40));
        return { bloqueado: false, nome, avatar: null };
      },
    });
    const ana = connect(mundo);
    const a = await createRoom(ana);
    const beto = connect(mundo);
    const pedido = beto.call<JoinResult>('room:join', { code: a.code, name: 'Beto', avatar: 'beto' });
    beto.close();
    await pedido.catch(() => undefined);
    await new Promise((r) => setTimeout(r, 80));
    expect(mundo.rooms.get(a.code)!.seatCount).toBe(1);
  });

  it('conferência de perfil travada não prende a entrada: passa do prazo, senta com o nome que veio', async () => {
    const mundo = startWorld({ perfilPrazoMs: 60, conferirPerfil: () => new Promise(() => {}) });
    const ana = connect(mundo);
    const a = await createRoom(ana, 'Ana');
    expect(a.code).toMatch(/^[A-Z0-9]{4}$/);
    const beto = connect(mundo);
    const b = await joinRoom(beto, a.code, 'Beto');
    expect(b.playerId).toBeTruthy();
  });

  it('saída pelo token (sem WebSocket) libera o lugar e fecha a conexão que sobrou', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(beto, a.code, 'Beto');
    expect(mundo.servidor(a.code).leaveByToken(b.token)).toBe(true);
    expect(beto.closed?.code).toBe(WS_CLOSE.left);
    expect(mundo.rooms.get(a.code)!.seatCount).toBe(1);
    expect(mundo.servidor(a.code).leaveByToken(b.token)).toBe(false);
  });

  it('link antigo de sala encerrada pela administração diz isso, não "ficou sem ninguém"', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const a = await createRoom(ana);
    mundo.rooms.get(a.code)!.closeByAdmin('admin: teste');
    const beto = connect(mundo);
    const r = await beto.call<JoinResult>('room:join', { code: a.code, name: 'Beto', avatar: 'beto' });
    expect(r).toEqual({ ok: false, error: { code: 'ROOM_GONE', message: MESSAGES.roomGoneAdmin } });
  });

  it('celular morto em silêncio: pelo mesmo apelido, outro aparelho recupera o lugar sem esperar a queda', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const celular = connect(mundo);
    const a = await createRoom(ana);
    const b = await joinRoom(celular, a.code, 'Beto');
    ok(await ana.call('room:start'));
    // Com o celular vivo, o nome igual não toma o lugar (partida rolando: não senta ninguém novo).
    const notebook = connect(mundo);
    const antes = await notebook.call<JoinResult>('room:join', { code: a.code, name: 'Beto', avatar: 'beto' });
    expect(antes).toEqual({ ok: false, error: { code: 'GAME_IN_PROGRESS', message: MESSAGES.seatBusy } });
    celular.silencioMs = 45_000;
    const depois = ok(await notebook.call<JoinResult>('room:join', { code: a.code, name: 'Beto', avatar: 'beto' }));
    expect(depois.playerId).toBe(b.playerId);
  });
});
