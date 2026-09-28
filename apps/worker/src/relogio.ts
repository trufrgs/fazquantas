import type { Clock } from '@fodinha/engine';

/** O pedaço do storage de um Durable Object que o relógio usa. */
export interface AlarmStorage {
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

/**
 * Alarme que chega um pouco antes do horário (o relógio do Worker só anda entre eventos de I/O,
 * e o horário do alarme não bate no milissegundo) ainda roda o timer.
 */
export const FIRE_EARLY_MS = 1500;

/**
 * Relógio de uma sala num Durable Object. Os timers ficam na memória e o mais próximo vira o
 * alarme do objeto: nada de `setTimeout` segurando a sala acordada, e cada disparo roda numa
 * invocação própria (um lance de bot por vez, com CPU curto).
 *
 * Se a sala hibernar ou reiniciar, os timers da memória somem; a sala, ao voltar, recalcula os
 * seus a partir do estado salvo, e o alarme pendente só acorda o objeto.
 */
export class AlarmClock implements Clock {
  private readonly timers = new Map<number, { due: number; fn: () => void }>();
  private seq = 0;
  /** Horário do alarme agendado (`null` = nenhum). */
  private armedAt: number | null = null;

  constructor(
    private readonly storage: AlarmStorage,
    private readonly clock: () => number = Date.now,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}

  now(): number {
    return this.clock();
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.timers.set(id, { due: this.clock() + Math.max(0, ms), fn });
    this.arm();
    return id;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === 'number' && this.timers.delete(handle)) this.arm();
  }

  /** Timers pendentes (para testes e diagnóstico). */
  get pending(): number {
    return this.timers.size;
  }

  /**
   * Chamado pelo `alarm()` do objeto: roda só o timer vencido mais antigo e reagenda o próximo.
   * Se outro já venceu, o alarme novo dispara em seguida, numa invocação nova.
   */
  fire(): { ran: boolean; pending: number; nextIn: number | null } {
    this.armedAt = null;
    const now = this.clock();
    let nextId: number | null = null;
    let nextDue = Number.POSITIVE_INFINITY;
    for (const [id, t] of this.timers) {
      if (t.due < nextDue || (t.due === nextDue && nextId !== null && id < nextId)) {
        nextId = id;
        nextDue = t.due;
      }
    }
    const ran = nextId !== null && nextDue <= now + FIRE_EARLY_MS;
    if (ran) {
      const timer = this.timers.get(nextId!)!;
      this.timers.delete(nextId!);
      try {
        timer.fn();
      } catch (error) {
        this.onError(error);
      }
    }
    this.arm();
    return { ran, pending: this.timers.size, nextIn: nextId === null ? null : nextDue - now };
  }

  /** Esquece tudo (a sala acabou). */
  clear(): void {
    this.timers.clear();
    if (this.armedAt !== null) {
      this.armedAt = null;
      void this.storage.deleteAlarm().catch(this.onError);
    }
  }

  private arm(): void {
    let next = Number.POSITIVE_INFINITY;
    for (const t of this.timers.values()) if (t.due < next) next = t.due;
    if (next === Number.POSITIVE_INFINITY) {
      if (this.armedAt !== null) {
        this.armedAt = null;
        void this.storage.deleteAlarm().catch(this.onError);
      }
      return;
    }
    if (this.armedAt === next) return;
    this.armedAt = next;
    void this.storage.setAlarm(next).catch(this.onError);
  }
}
