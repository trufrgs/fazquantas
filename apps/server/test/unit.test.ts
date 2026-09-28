import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPACITOR_ORIGINS,
  DEFAULT_PORT,
  loadConfig,
  parseCorsOrigins,
  parsePort,
} from '../src/config';
import { splitArgs } from '../src/handlers';
import { TokenBucket } from '../src/rate-limit';
import {
  gameActionSchema,
  isValidRoomCode,
  joinRoomSchema,
  normalizeRoomCode,
  parsePayload,
  sanitizeName,
  updateRoomSchema,
} from '../src/validation';

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

describe('argumentos do socket', () => {
  it('separa payload e ack em qualquer combinação', () => {
    const ack = () => {};
    expect(splitArgs([])).toEqual({ payload: undefined, ack: null });
    expect(splitArgs([ack])).toEqual({ payload: undefined, ack });
    expect(splitArgs([{ a: 1 }, ack])).toEqual({ payload: { a: 1 }, ack });
    expect(splitArgs([{ a: 1 }])).toEqual({ payload: { a: 1 }, ack: null });
    expect(splitArgs([1, 2, ack])).toEqual({ payload: 1, ack });
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

describe('config', () => {
  it('lê o ambiente com padrões', () => {
    const config = loadConfig({}, { cwd: '/srv' });
    expect(config).toEqual({
      port: DEFAULT_PORT,
      host: '0.0.0.0',
      corsOrigins: true,
      staticDir: null,
    });
    const custom = loadConfig(
      {
        PORT: '8080',
        HOST: '127.0.0.1',
        STATIC_DIR: 'web/dist',
        CORS_ORIGINS: 'https://a.com/, https://b.com',
      },
      { cwd: '/srv' },
    );
    expect(custom.port).toBe(8080);
    expect(custom.host).toBe('127.0.0.1');
    expect(custom.staticDir).toBe(path.resolve('/srv', 'web/dist'));
    expect(custom.corsOrigins).toEqual(['https://a.com', 'https://b.com', ...CAPACITOR_ORIGINS]);
  });

  it('CORS vazio ou * libera tudo; porta inválida é erro claro', () => {
    expect(parseCorsOrigins(undefined)).toBe(true);
    expect(parseCorsOrigins(' , ')).toBe(true);
    expect(parseCorsOrigins('https://a.com,*')).toBe(true);
    expect(parsePort('0')).toBe(0);
    expect(() => parsePort('abc')).toThrow(/PORT inválida/);
    expect(() => parsePort('70000')).toThrow(/PORT inválida/);
  });

  it('usa o build padrão do web só se a pasta existir', () => {
    expect(loadConfig({}, { defaultStaticDir: '/nao/existe' }).staticDir).toBeNull();
    const here = path.resolve(import.meta.dirname);
    expect(loadConfig({}, { defaultStaticDir: here }).staticDir).toBe(here);
  });
});
