import { describe, expect, it } from 'vitest';
import { horaBrasilia } from '../src/hora';

describe('horaBrasilia', () => {
  const now = Date.parse('2026-09-28T20:00:00Z'); // 17:00 BRT, segunda
  it('hoje só a hora; amanhã e depois com o dia', () => {
    expect(horaBrasilia(Date.parse('2026-09-28T23:40:00Z'), now)).toBe('20:40');
    expect(horaBrasilia(Date.parse('2026-09-29T12:15:00Z'), now)).toBe('amanhã às 09:15');
    expect(horaBrasilia(Date.parse('2026-10-02T12:15:00Z'), now)).toMatch(/^sex\.? às 09:15$/);
  });
  it('vira o dia pela meia-noite de Brasília, não a de UTC', () => {
    // 01:30 UTC de terça = 22:30 BRT de segunda
    expect(horaBrasilia(Date.parse('2026-09-29T01:30:00Z'), now)).toBe('22:30');
  });
});
