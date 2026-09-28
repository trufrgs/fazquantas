import { describe, expect, it } from 'vitest';
import { AlarmClock, FIRE_EARLY_MS, type AlarmStorage } from '../src/relogio';

function setup() {
  let now = 1_000_000;
  const alarms: (number | null)[] = [];
  const storage: AlarmStorage = {
    setAlarm: async (t) => void alarms.push(t),
    deleteAlarm: async () => void alarms.push(null),
  };
  const clock = new AlarmClock(storage, () => now);
  return { clock, alarms, advance: (ms: number) => (now += ms), at: () => now };
}

describe('AlarmClock', () => {
  it('agenda o alarme para o timer mais próximo', () => {
    const { clock, alarms, at } = setup();
    clock.setTimeout(() => {}, 5000);
    clock.setTimeout(() => {}, 2000);
    expect(alarms.at(-1)).toBe(at() + 2000);
  });

  it('roda um timer por disparo, na ordem, e reagenda o próximo', () => {
    const { clock, alarms, advance, at } = setup();
    const ran: string[] = [];
    clock.setTimeout(() => ran.push('b'), 2000);
    clock.setTimeout(() => ran.push('a'), 1000);
    advance(3000);
    expect(clock.fire()).toMatchObject({ ran: true, pending: 1 });
    expect(ran).toEqual(['a']);
    expect(alarms.at(-1)).toBeLessThanOrEqual(at());
    expect(clock.fire()).toMatchObject({ ran: true, pending: 0 });
    expect(ran).toEqual(['a', 'b']);
  });

  it('alarme que chega um pouco antes do horário ainda roda o timer (o bug da produção)', () => {
    const { clock, advance } = setup();
    let ran = false;
    clock.setTimeout(() => (ran = true), 1000);
    advance(1000 - FIRE_EARLY_MS + 1);
    expect(clock.fire().ran).toBe(true);
    expect(ran).toBe(true);
  });

  it('alarme muito adiantado não roda e reagenda o mesmo horário', () => {
    const { clock, alarms, advance, at } = setup();
    clock.setTimeout(() => {}, 10_000);
    const due = at() + 10_000;
    advance(1000);
    const r = clock.fire();
    expect(r.ran).toBe(false);
    expect(r.nextIn).toBe(9000);
    expect(alarms.at(-1)).toBe(due);
  });

  it('cancelar o último timer apaga o alarme', () => {
    const { clock, alarms } = setup();
    const id = clock.setTimeout(() => {}, 1000);
    clock.clearTimeout(id);
    expect(alarms.at(-1)).toBeNull();
    expect(clock.pending).toBe(0);
  });

  it('erro num timer não derruba o relógio', () => {
    let now = 0;
    const errors: unknown[] = [];
    const clock = new AlarmClock({ setAlarm: async () => {}, deleteAlarm: async () => {} }, () => now, (e) => errors.push(e));
    let second = false;
    clock.setTimeout(() => {
      throw new Error('boom');
    }, 10);
    clock.setTimeout(() => (second = true), 20);
    now = 100;
    clock.fire();
    clock.fire();
    expect(errors).toHaveLength(1);
    expect(second).toBe(true);
  });
});
