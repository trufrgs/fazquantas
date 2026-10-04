import { VOZ_NA_SALA, type JoinResult } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { connect, createRoom, joinRoom, ok, startWorld } from './helpers';

const AUDIO = 'AAAA'.repeat(100);

describe('a frase na tua voz (só na memória da sala)', () => {
  it('repassa para a sala, entrega a quem chega depois e esquece quem sai', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    await joinRoom(beto, a.code, 'Beto');
    ok(await ana.call('voz:frase', { reaction: 'cagao', audio: AUDIO }));
    await new Promise((r) => setTimeout(r, 10));
    expect(beto.vozes).toEqual([{ playerId: a.playerId, reaction: 'cagao', audio: AUDIO }]);
    // Quem manda não recebe de volta.
    expect(ana.vozes).toEqual([]);
    const caio = connect(mundo);
    ok(await caio.call<JoinResult>('room:join', { code: a.code, name: 'Caio', avatar: 'c' }));
    expect(caio.vozes).toEqual([{ playerId: a.playerId, reaction: 'cagao', audio: AUDIO }]);
    // Apagar também passa adiante.
    ok(await ana.call('voz:frase', { reaction: 'cagao', audio: null }));
    await new Promise((r) => setTimeout(r, 10));
    expect(beto.vozes.at(-1)).toEqual({ playerId: a.playerId, reaction: 'cagao', audio: null });
  });

  it('no máximo três frases por pessoa; gravação grande ou estragada não entra', async () => {
    const mundo = startWorld();
    const ana = connect(mundo);
    const beto = connect(mundo);
    const a = await createRoom(ana);
    await joinRoom(beto, a.code, 'Beto');
    for (const r of ['cagao', 'masbah', 'guloso', 'chorao']) ok(await ana.call('voz:frase', { reaction: r, audio: AUDIO }));
    const caio = connect(mundo);
    ok(await caio.call<JoinResult>('room:join', { code: a.code, name: 'Caio', avatar: 'c' }));
    expect(caio.vozes.map((v) => v.reaction)).toEqual(['masbah', 'guloso', 'chorao']);
    expect(VOZ_NA_SALA.maxFrases).toBe(3);
    expect(await ana.call('voz:frase', { reaction: 'cagao', audio: 'A'.repeat(VOZ_NA_SALA.maxB64 + 4) })).toMatchObject({ ok: false });
    expect(await ana.call('voz:frase', { reaction: 'cagao', audio: 'não é base64' })).toMatchObject({ ok: false });
    expect(await ana.call('voz:frase', { reaction: 'inventada', audio: AUDIO })).toMatchObject({ ok: false });
  });
});
