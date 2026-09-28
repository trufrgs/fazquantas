import { describe, expect, it } from 'vitest';
import { formatLeft, isUrgent } from './tempo';

describe('relógio da vez', () => {
  it('segundos, minutos e horas', () => {
    expect(formatLeft(22_100)).toBe('23 s');
    expect(formatLeft(65_000)).toBe('1:05');
    expect(formatLeft(5 * 3600_000 + 12 * 60_000)).toBe('5 h 12');
    expect(formatLeft(12 * 3600_000)).toBe('12 h');
    expect(formatLeft(0)).toBe('0 s');
  });

  it('tempo apertado: fim da vez curta, último quarto da vez em horas', () => {
    expect(isUrgent(9_000, 30_000)).toBe(true);
    expect(isUrgent(11_000, 30_000)).toBe(false);
    expect(isUrgent(7_000, 15_000)).toBe(true);
    expect(isUrgent(8_000, 15_000)).toBe(false);
    expect(isUrgent(2 * 3600_000, 12 * 3600_000)).toBe(true);
    expect(isUrgent(4 * 3600_000, 12 * 3600_000)).toBe(false);
    expect(isUrgent(9_000, null)).toBe(true);
  });
});
