import { profileIdFromKey, type JoinResult } from '@fodinha/engine';
import { describe, expect, it } from 'vitest';
import { connect, createRoom, joinRoom, ok, startWorld } from './helpers';

/** O que o Worker faz com o `ContasDO`: apelido guardado, aparelho juntado, apelido de outro e bloqueio. */
async function mundoComContas() {
  const thomasKey = 'thomasThomasThomas0001';
  const thomasId = await profileIdFromKey(thomasKey);
  // Outro aparelho do Thomas, juntado ao perfil guardado dele (pelo admin ou entrando com o PIN).
  const iphoneKey = 'iphoneIphoneIphone0001';
  const iphoneId = await profileIdFromKey(iphoneKey);
  const bloqueadoKey = 'chatoChatoChatoChato01';
  const bloqueadoId = await profileIdFromKey(bloqueadoKey);
  const mundo = startWorld({
    conferirPerfil: async (profileId, nome) => {
      if (profileId === bloqueadoId) return { bloqueado: true, nome, avatar: null };
      if (profileId === thomasId || profileId === iphoneId) {
        return { bloqueado: false, nome: 'Thomas', avatar: 'g-gauderio', perfil: thomasId, apelidoDeOutro: false };
      }
      if (nome.toLowerCase() === 'thomas') return { bloqueado: false, nome: 'Thomas 2', avatar: null, perfil: profileId, apelidoDeOutro: true };
      return { bloqueado: false, nome, avatar: null, perfil: profileId, apelidoDeOutro: false };
    },
  });
  return { mundo, thomasKey, thomasId, iphoneKey, bloqueadoKey };
}

describe('apelido guardado e bloqueio', () => {
  it('perfil guardado senta com o apelido e o avatar dele, mesmo mandando outro nome', async () => {
    const { mundo, thomasKey } = await mundoComContas();
    const t = connect(mundo);
    await createRoom(t, 'Tomzinho', { profileKey: thomasKey });
    const seat = t.state!.seats[0]!;
    expect(seat).toMatchObject({ name: 'Thomas', avatar: 'g-gauderio' });
  });

  it('o aparelho juntado ao perfil guardado senta como ele (o mesmo perfil, que pontua junto)', async () => {
    const { mundo, iphoneKey, thomasId } = await mundoComContas();
    const t = connect(mundo);
    const a = await createRoom(t, 'Thomas', { profileKey: iphoneKey });
    expect(t.state!.seats[0]).toMatchObject({ name: 'Thomas', avatar: 'g-gauderio' });
    expect(mundo.rooms.get(a.code)!.serialize().seats[0]).toMatchObject({ profileId: thomasId });
  });

  it('lugar novo com o apelido guardado de outra pessoa é recusado: entra com o PIN ou troca de apelido', async () => {
    const { mundo, thomasKey } = await mundoComContas();
    const t = connect(mundo);
    const a = await createRoom(t, 'Thomas', { profileKey: thomasKey });
    const outro = connect(mundo);
    const r = await outro.call('room:join', { code: a.code, name: 'Thomas', avatar: 'x', profileKey: 'outroOutroOutroOutro01' });
    expect(!r.ok && r.error.code).toBe('NICK_RESERVED');
    const criar = await connect(mundo).call('room:create', { name: 'thomas', avatar: 'x', profileKey: 'outroOutroOutroOutro02' });
    expect(!criar.ok && criar.error.code).toBe('NICK_RESERVED');
    expect(t.state!.seats.map((s) => s.name)).toEqual(['Thomas']);
  });

  it('quem já estava sentado com número (antes da regra) volta ao lugar, com ou sem o token', async () => {
    let regraNova = false;
    const mundo = startWorld({
      conferirPerfil: async (profileId, nome) =>
        nome.toLowerCase() === 'thomas'
          ? { bloqueado: false, nome: 'Thomas 2', avatar: null, perfil: profileId, apelidoDeOutro: regraNova }
          : { bloqueado: false, nome, avatar: null, perfil: profileId, apelidoDeOutro: false },
    });
    const ana = connect(mundo);
    const a = await createRoom(ana, 'Ana');
    const iphone = connect(mundo);
    const antes = await joinRoom(iphone, a.code, 'Thomas', undefined, { profileKey: 'iphoneIphoneIphone0002' });
    iphone.close();
    regraNova = true;
    const volta = connect(mundo);
    const comToken = ok(await volta.call<JoinResult>('room:join', { code: a.code, name: 'Thomas', avatar: 'x', token: antes.token }));
    expect(comToken.playerId).toBe(antes.playerId);
    // O navegador perdeu os dados (sem o token): o mesmo perfil ainda recupera o lugar.
    volta.close();
    const semToken = ok(await connect(mundo).call<JoinResult>('room:join', { code: a.code, name: 'Thomas', avatar: 'x', profileKey: 'iphoneIphoneIphone0002' }));
    expect(semToken.playerId).toBe(antes.playerId);
    expect(ana.state!.seats.map((s) => s.name)).toEqual(['Ana', 'Thomas 2']);
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
