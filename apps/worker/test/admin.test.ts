import { describe, expect, it } from 'vitest';
import { ADMIN_TOKEN_MS, checkPassword, issueToken, verifyToken } from '../src/admin';

describe('admin', () => {
  const secret = 'bah-que-senha-boa';

  it('senha certa passa; errada, curta ou sem segredo não', async () => {
    expect(await checkPassword(secret, secret)).toBe(true);
    expect(await checkPassword(secret, 'outra')).toBe(false);
    expect(await checkPassword(undefined, secret)).toBe(false);
    expect(await checkPassword('curta', 'curta')).toBe(false);
  });

  it('token vale 30 dias e morre se a senha mudar', async () => {
    const now = Date.parse('2026-09-28T20:00:00Z');
    const token = await issueToken(secret, now);
    expect(await verifyToken(secret, token, now + 1000)).toBe(true);
    expect(await verifyToken(secret, token, now + ADMIN_TOKEN_MS + 1)).toBe(false);
    expect(await verifyToken('outra-senha-qualquer', token, now + 1000)).toBe(false);
    expect(await verifyToken(secret, token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), now + 1000)).toBe(false);
    expect(await verifyToken(secret, null, now)).toBe(false);
  });
});
