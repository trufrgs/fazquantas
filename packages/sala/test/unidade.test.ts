import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../src/limite';
import { profileIdFromKey, randomToken, sameSecret, PROFILE_KEY_PATTERN } from '../src/perfil';
import {
  createRoomSchema,
  gameActionSchema,
  isValidRoomCode,
  joinRoomSchema,
  normalizeRoomCode,
  parsePayload,
  sanitizeName,
  updateRoomSchema,
} from '../src/validacao';

describe('validação', () => {
  it('limpa apelidos', () => {
    expect(sanitizeName('  Ana   Maria ')).toBe('Ana Maria');
    expect(sanitizeName(`A${String.fromCharCode(0)}n${String.fromCharCode(0x1b)}a`)).toBe('Ana');
    expect(sanitizeName(`${String.fromCharCode(0x202e)}ateB`)).toBe('ateB');
    expect(sanitizeName('Zé 🧉')).toBe('Zé 🧉');
    const family = ['👩', '👩', '👧'].join(String.fromCharCode(0x200d)); // emoji com ZWJ fica inteiro
    expect(sanitizeName(family)).toBe(family);
    const cutEmoji = `Ana ${'🧉'.slice(0, 1)}`; // metade de um par surrogate
    expect(sanitizeName(cutEmoji)).toBe('Ana');
  });

  it('valida apelido por caracteres, não por unidades UTF-16', () => {
    const emoji16 = '🧉'.repeat(16);
    expect(parsePayload(joinRoomSchema, { code: 'ABCD', name: emoji16, avatar: '' }).name).toBe(
      emoji16,
    );
    expect(() =>
      parsePayload(joinRoomSchema, { code: 'ABCD', name: '🧉'.repeat(17), avatar: '' }),
    ).toThrow(/Apelido inválido/);
  });

  it('normaliza e valida o código da sala', () => {
    expect(normalizeRoomCode(' ab2c ')).toBe('AB2C');
    expect(isValidRoomCode('AB2C')).toBe(true);
    for (const bad of ['AB1C', 'ABIO', 'ABC', 'ABCDE', 'AB C', 'ABÇD'])
      expect(isValidRoomCode(bad), bad).toBe(false);
    expect(
      parsePayload(joinRoomSchema, { code: 'wxyz', name: 'Ana', avatar: 'a', token: null }),
    ).toEqual({
      code: 'WXYZ',
      name: 'Ana',
      avatar: 'a',
      token: null,
    });
  });

  it('regras: só chaves conhecidas, com tipos certos', () => {
    expect(parsePayload(updateRoomSchema, { rules: { startingLives: 3, extra: 1 } })).toEqual({
      rules: { startingLives: 3 },
    });
    expect(parsePayload(updateRoomSchema, { turnTimeoutSec: null })).toEqual({
      turnTimeoutSec: null,
    });
    expect(() => parsePayload(updateRoomSchema, { rules: { penalty: 'dobro' } })).toThrow(
      'Regras inválidas.',
    );
    expect(() => parsePayload(updateRoomSchema, { turnTimeoutSec: 20 })).toThrow(
      'Tempo por jogada inválido.',
    );
  });

  it('ação: palpite inteiro 0..20 ou carta existente', () => {
    expect(
      parsePayload(gameActionSchema, { action: { type: 'play', cardId: 'O12', x: 1 } }),
    ).toEqual({
      action: { type: 'play', cardId: 'O12' },
    });
    expect(() =>
      parsePayload(gameActionSchema, { action: { type: 'play', cardId: 'O8' } }),
    ).toThrow('Jogada inválida.');
    expect(() => parsePayload(gameActionSchema, { action: { type: 'bid', value: -1 } })).toThrow();
    expect(() => parsePayload(gameActionSchema, undefined)).toThrow('Dados inválidos.');
  });
});

describe('ajustes novos', () => {
  it('ritmo, série, ranking e senha', () => {
    expect(parsePayload(updateRoomSchema, { pace: 'calma', bestOf: 5, ranked: true, password: '  galpão 7 ' })).toEqual({
      pace: 'calma',
      bestOf: 5,
      ranked: true,
      password: 'galpão 7',
    });
    expect(parsePayload(updateRoomSchema, { password: null })).toEqual({ password: null });
    expect(() => parsePayload(updateRoomSchema, { bestOf: 4 })).toThrow('Série inválida');
    expect(() => parsePayload(updateRoomSchema, { pace: 'lenta' })).toThrow('Ritmo inválido.');
    expect(() => parsePayload(updateRoomSchema, { password: '' })).toThrow('Senha inválida');
    expect(parsePayload(updateRoomSchema, { turnTimeoutSec: 120 })).toEqual({ turnTimeoutSec: 120 });
    // Ajustes na criação: a mensagem é a do campo de dentro.
    expect(() => parsePayload(createRoomSchema, { name: 'Ana', avatar: 'a', settings: { pace: 'x' } })).toThrow(
      'Ritmo inválido.',
    );
  });

  it('senha de quem entra é limpa como a guardada', () => {
    expect(parsePayload(joinRoomSchema, { code: 'ABCD', name: 'Ana', avatar: 'a', password: ' galpão   7 ' }).password).toBe(
      'galpão 7',
    );
  });
});

describe('perfil', () => {
  it('id público estável, curto e diferente da chave', async () => {
    const key = randomToken(16);
    expect(key).toMatch(PROFILE_KEY_PATTERN);
    const id = await profileIdFromKey(key);
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(id).not.toBe(key);
    expect(await profileIdFromKey(key)).toBe(id);
    expect(await profileIdFromKey(randomToken(16))).not.toBe(id);
  });

  it('compara segredos', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
  });
});

describe('TokenBucket', () => {
  it('aguenta a rajada e repõe com o tempo', () => {
    let now = 0;
    const bucket = new TokenBucket(3, 2, () => now);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    now += 500; // repõe 1
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
    now += 60_000; // nunca passa da capacidade
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});

