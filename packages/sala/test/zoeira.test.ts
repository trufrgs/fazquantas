import { LIMITES_DA_ZOEIRA, ZOEIRA_ESGOTADA, type JoinResult } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { connect, createRoom, joinRoom, ok, startWorld } from './helpers';

async function mesa() {
  const mundo = startWorld();
  const ana = connect(mundo);
  const beto = connect(mundo);
  const a = await createRoom(ana);
  const b = await joinRoom(beto, a.code, 'Beto');
  ok(await ana.call('room:update', { turnTimeoutSec: null }));
  return { mundo, ana, beto, a, b };
}

describe('zoeira (só enfeite)', () => {
  it('só com partida na mesa', async () => {
    const { ana, b } = await mesa();
    expect(await ana.call('game:zoar', { tipo: 'atirar', alvo: b.playerId, item: 'tomate' })).toMatchObject({ ok: false, error: { code: 'GAME_ERROR' } });
  });

  it('atirar chega para todos, com quem mandou; três por rodada', async () => {
    const { ana, beto, a, b } = await mesa();
    ok(await ana.call('room:start'));
    await beto.waitForView(() => true);
    for (let i = 0; i < LIMITES_DA_ZOEIRA.tirosPorRodada; i++) ok(await ana.call('game:zoar', { tipo: 'atirar', alvo: b.playerId, item: 'ovo' }));
    expect(await ana.call('game:zoar', { tipo: 'atirar', alvo: b.playerId, item: 'ovo' })).toEqual({ ok: false, error: { code: 'GAME_ERROR', message: ZOEIRA_ESGOTADA.tiros } });
    await new Promise((r) => setTimeout(r, 20));
    const vistos = beto.events.filter((e) => e === 'game:zoeira').length;
    expect(vistos).toBe(LIMITES_DA_ZOEIRA.tirosPorRodada);
    void a;
  });

  it('não vale em si mesmo, nem em quem não está na sala; cutucão só em quem está na vez', async () => {
    const { mundo, ana, beto, a, b } = await mesa();
    ok(await ana.call('room:start'));
    await beto.waitForView(() => true);
    expect(await ana.call('game:zoar', { tipo: 'carimbo', alvo: a.playerId, reaction: 'cagao' })).toMatchObject({ ok: false, error: { message: ZOEIRA_ESGOTADA.si } });
    expect(await ana.call('game:zoar', { tipo: 'carimbo', alvo: 'ninguem', reaction: 'cagao' })).toMatchObject({ ok: false, error: { message: ZOEIRA_ESGOTADA.alvo } });
    const sala = mundo.rooms.get(a.code)!;
    const vez = sala.turn!.playerId;
    const quem = vez === a.playerId ? beto : ana;
    const naVez = vez === a.playerId ? ana : beto;
    const outro = vez === a.playerId ? b.playerId : a.playerId;
    // Quem está na vez cutucando quem não está: não vale.
    expect(await naVez.call('game:zoar', { tipo: 'cutucar', alvo: outro })).toMatchObject({ ok: false, error: { message: ZOEIRA_ESGOTADA.demora } });
    ok(await quem.call('game:zoar', { tipo: 'cutucar', alvo: vez }));
    expect(await quem.call('game:zoar', { tipo: 'cutucar', alvo: vez })).toMatchObject({ ok: false, error: { message: ZOEIRA_ESGOTADA.cutucao } });
  });

  it('virar a mesa: uma vez por partida; a plateia também zoa', async () => {
    const { mundo, ana, beto, a } = await mesa();
    ok(await ana.call('room:start'));
    await beto.waitForView(() => true);
    ok(await ana.call('game:zoar', { tipo: 'virar' }));
    expect(await ana.call('game:zoar', { tipo: 'virar' })).toMatchObject({ ok: false, error: { message: ZOEIRA_ESGOTADA.virar } });
    const caio = connect(mundo);
    ok(await caio.call<JoinResult>('room:join', { code: a.code, name: 'Caio', avatar: 'c' }));
    ok(await caio.call('game:zoar', { tipo: 'atirar', alvo: a.playerId, item: 'chinelo' }));
  });

  it('dados inválidos são recusados', async () => {
    const { ana, beto, b } = await mesa();
    ok(await ana.call('room:start'));
    await beto.waitForView(() => true);
    expect(await ana.call('game:zoar', { tipo: 'atirar', alvo: b.playerId, item: 'pedra' })).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
    expect(await ana.call('game:zoar', { tipo: 'grito', reaction: 'cagao', forca: 9 })).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
  });
});
