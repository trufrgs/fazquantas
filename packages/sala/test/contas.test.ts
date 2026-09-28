import { profileIdFromKey } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { connect, createRoom, joinRoom, ok, startWorld } from './helpers';

/** O que o Worker faz com o `ContasDO`: apelido guardado, apelido de outro e bloqueio. */
async function mundoComContas() {
  const thomasKey = 'thomasThomasThomas0001';
  const thomasId = await profileIdFromKey(thomasKey);
  const bloqueadoKey = 'chatoChatoChatoChato01';
  const bloqueadoId = await profileIdFromKey(bloqueadoKey);
  const mundo = startWorld({
    conferirPerfil: async (profileId, nome) => {
      if (profileId === bloqueadoId) return { bloqueado: true, nome, avatar: null };
      if (profileId === thomasId) return { bloqueado: false, nome: 'Thomas', avatar: 'g-gauderio' };
      if (nome.toLowerCase() === 'thomas') return { bloqueado: false, nome: 'Thomas 2', avatar: null };
      return { bloqueado: false, nome, avatar: null };
    },
  });
  return { mundo, thomasKey, bloqueadoKey };
}

describe('apelido guardado e bloqueio', () => {
  it('perfil guardado senta com o apelido e o avatar dele, mesmo mandando outro nome', async () => {
    const { mundo, thomasKey } = await mundoComContas();
    const t = connect(mundo);
    await createRoom(t, 'Tomzinho', { profileKey: thomasKey });
    const seat = t.state!.seats[0]!;
    expect(seat).toMatchObject({ name: 'Thomas', avatar: 'g-gauderio' });
  });

  it('quem usa o apelido guardado de outro senta com número', async () => {
    const { mundo, thomasKey } = await mundoComContas();
    const t = connect(mundo);
    const a = await createRoom(t, 'Thomas', { profileKey: thomasKey });
    const outro = connect(mundo);
    await joinRoom(outro, a.code, 'Thomas', undefined, { profileKey: 'outroOutroOutroOutro01' });
    expect(t.state!.seats.map((s) => s.name)).toEqual(['Thomas', 'Thomas 2']);
  });

  it('perfil bloqueado não cria nem entra em sala', async () => {
    const { mundo, bloqueadoKey } = await mundoComContas();
    const b = connect(mundo);
    const r = await b.call('room:create', { name: 'Chato', avatar: 'x', profileKey: bloqueadoKey });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('BLOCKED');
    const ana = connect(mundo);
    const a = await createRoom(ana, 'Ana');
    const r2 = await connect(mundo).call('room:join', { code: a.code, name: 'Chato', avatar: 'x', profileKey: bloqueadoKey });
    expect(!r2.ok && r2.error.code).toBe('BLOCKED');
    ok(await ana.call('room:addBot', { difficulty: 'facil' }));
  });
});
