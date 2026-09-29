import { describe, expect, it } from 'vitest';
import { autoPlay, connect, createRoom, joinRoom, ok, startWorld, waitUntil } from './helpers';

/**
 * Quem volta sem o token (o navegador perdeu os dados: navegador de dentro do WhatsApp, aba anônima)
 * volta para o próprio lugar se o apelido bate com um lugar sem conexão. Bug relatado em 28/09/2026:
 * trocar de janela no celular fazia a pessoa entrar de novo como "Joao 2".
 */
describe('voltar sem o token', () => {
  it('no lobby: mesmo apelido (sem diferença de maiúscula/acento) volta pro mesmo lugar', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const joao = connect(mundo);
    const a = await createRoom(ana, 'Ana');
    const i = await joinRoom(joao, a.code, 'Joao');
    joao.close();
    await waitUntil(() => ana.state?.seats.some((s) => s.playerId === i.playerId && s.kind === 'human' && !s.connected) ?? false, 'Joao caiu');
    const joao2 = connect(mundo);
    const volta = await joinRoom(joao2, a.code, 'joão', undefined, { profileKey: 'outroAparelhoOutroAp01', avatar: 'g-cusco' });
    expect(volta.playerId).toBe(i.playerId);
    const state = await ana.waitForState((s) => s.seats.length === 2 && s.seats.every((x) => x.kind !== 'human' || x.connected));
    expect(state.seats.map((s) => s.name)).toEqual(['Ana', 'joão']);
  });

  it('com gente conectada no lugar, o apelido igual entra como outra pessoa', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const a = await createRoom(ana, 'Ana');
    await joinRoom(connect(mundo), a.code, 'Joao');
    const outro = await joinRoom(connect(mundo), a.code, 'Joao');
    const state = await ana.waitForState((s) => s.seats.length === 3);
    expect(state.seats.find((s) => s.playerId === outro.playerId)?.name).toBe('Joao 2');
  });

  it('no meio da partida volta pro lugar (em vez de "sala no meio da partida")', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const joao = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { turnTimeoutSec: 120 } });
    const i = await joinRoom(joao, a.code, 'Joao');
    const pa = autoPlay(ana);
    ok(await ana.call('room:start'));
    joao.close();
    await waitUntil(() => mundo.rooms.get(a.code)!.game!.isAway(i.playerId), 'Joao caiu na partida');
    const joao2 = connect(mundo);
    const volta = await joinRoom(joao2, a.code, 'Joao');
    expect(volta.playerId).toBe(i.playerId);
    await waitUntil(() => !mundo.rooms.get(a.code)!.game!.isAway(i.playerId), 'Joao de volta, a mesa para de jogar por ele');
    pa.stop();
  });

  it('sala com senha: sem token, voltar pelo apelido também pede a senha', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const joao = connect(mundo);
    const a = await createRoom(ana, 'Ana', { settings: { password: 'bah' } });
    const i = await joinRoom(joao, a.code, 'Joao', undefined, { password: 'bah' });
    joao.close();
    await waitUntil(() => ana.state?.seats.some((s) => s.playerId === i.playerId && s.kind === 'human' && !s.connected) ?? false, 'Joao caiu');
    const joao2 = connect(mundo);
    expect(await joao2.call('room:join', { code: a.code, name: 'Joao', avatar: 'i' })).toMatchObject({ ok: false, error: { code: 'PASSWORD_REQUIRED' } });
    const volta = await joinRoom(joao2, a.code, 'Joao', undefined, { password: 'bah' });
    expect(volta.playerId).toBe(i.playerId);
  });
});
