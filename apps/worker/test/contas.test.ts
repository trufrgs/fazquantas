import { describe, expect, it } from 'vitest';
import { apelidoKey, brtDay, hashPin, PIN_PATTERN, pinWaitMs, randomSalt, shortUserAgent, truncateIp } from '../src/contas';

describe('apelido guardado', () => {
  it('acento, maiúscula e espaços não fazem outro apelido', () => {
    expect(apelidoKey('Tomás')).toBe(apelidoKey('tomas'));
    expect(apelidoKey('  Vó   Cida ')).toBe('vo cida');
    expect(apelidoKey('João')).not.toBe(apelidoKey('Joana'));
  });

  it('PIN de 4 a 8 dígitos', () => {
    expect(PIN_PATTERN.test('1234')).toBe(true);
    expect(PIN_PATTERN.test('12345678')).toBe(true);
    expect(PIN_PATTERN.test('123')).toBe(false);
    expect(PIN_PATTERN.test('12a4')).toBe(false);
  });

  it('5 erros livres; depois a espera dobra até um dia', () => {
    expect(pinWaitMs(4)).toBe(0);
    expect(pinWaitMs(5)).toBe(15 * 60_000);
    expect(pinWaitMs(6)).toBe(30 * 60_000);
    expect(pinWaitMs(30)).toBe(24 * 60 * 60_000);
  });

  it('resumo do PIN depende do sal e não guarda o PIN', async () => {
    const salt = randomSalt();
    const h = await hashPin('4321', salt);
    expect(h).toBe(await hashPin('4321', salt));
    expect(h).not.toBe(await hashPin('4321', randomSalt()));
    expect(h).not.toContain('4321');
  });
});

describe('acessos', () => {
  it('IP truncado', () => {
    expect(truncateIp('203.0.113.201')).toBe('203.0.x.x');
    expect(truncateIp('2804:14c:5b73:8a00:1234::1')).toBe('2804:14c:5b73::/48');
    expect(truncateIp(null)).toBe('');
  });

  it('navegador e sistema em poucas palavras', () => {
    expect(
      shortUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'),
    ).toBe('Chrome · Android');
    expect(
      shortUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
    ).toBe('Safari · iOS');
  });

  it('o dia vira à meia-noite de Brasília', () => {
    expect(brtDay(Date.parse('2026-09-29T02:59:00Z'))).toBe('2026-09-28');
    expect(brtDay(Date.parse('2026-09-29T03:00:00Z'))).toBe('2026-09-29');
  });
});
