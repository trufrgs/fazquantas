import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O socket roda no navegador: aqui ganha `window`, `document` e um WebSocket falso que o teste
// controla (abrir, responder, fechar ou ficar mudo, como uma conexão morta em silêncio).
const h = vi.hoisted(() => {
  type Listener = () => void;
  const listeners = new Map<string, Set<Listener>>();
  const on = (type: string, fn: Listener) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
  };
  const off = (type: string, fn: Listener) => listeners.get(type)?.delete(fn);
  const doc = { visibilityState: 'visible', addEventListener: on, removeEventListener: off };
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener: on,
    removeEventListener: off,
    setTimeout: (fn: () => void, ms?: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id),
    setInterval: (fn: () => void, ms?: number) => globalThis.setInterval(fn, ms),
    clearInterval: (id: ReturnType<typeof setInterval>) => globalThis.clearInterval(id),
  };
  (globalThis as unknown as { document: unknown }).document = doc;

  class FakeWs {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    static all: FakeWs[] = [];
    readyState = 0;
    readonly sent: string[] = [];
    closedWith: { code: number; reason: string } | null = null;
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onclose: ((ev: { code: number; reason: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly url: string) {
      FakeWs.all.push(this);
    }
    send(data: string) {
      if (this.readyState !== 1) throw new Error('fechada');
      this.sent.push(data);
    }
    /** Conexão morta não fecha de verdade: só marca (o onclose nunca chega). */
    close(code = 1000, reason = '') {
      this.closedWith ??= { code, reason };
      this.readyState = 3;
    }
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
    receive(data: string) {
      this.onmessage?.({ data });
    }
    get pings() {
      return this.sent.filter((d) => d === 'ping').length;
    }
  }
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWs;
  const fire = (type: string) => {
    for (const fn of [...(listeners.get(type) ?? [])]) fn();
  };
  return { FakeWs, fire, doc, listeners };
});

import { SalaSocket } from './sala-socket';

let sockets: SalaSocket[] = [];
function socket(): SalaSocket {
  const s = new SalaSocket('ws://teste/api/salas/ABCD');
  sockets.push(s);
  return s;
}
const last = () => h.FakeWs.all.at(-1)!;

beforeEach(() => {
  vi.useFakeTimers();
  h.FakeWs.all = [];
  h.doc.visibilityState = 'visible';
});

afterEach(() => {
  for (const s of sockets) s.close();
  sockets = [];
  vi.useRealTimers();
});

describe('prova de vida do socket da sala', () => {
  it('conexão morta em silêncio cai em até 16 s e reconecta sozinha', () => {
    const s = socket();
    const quedas: string[] = [];
    s.on('disconnect', (reason) => quedas.push(reason));
    const ws = last();
    ws.open();
    vi.advanceTimersByTime(10_500);
    expect(ws.pings).toBe(1);
    vi.advanceTimersByTime(5_500);
    expect(quedas).toEqual(['network']);
    expect(ws.closedWith?.code).toBe(4000);
    vi.advanceTimersByTime(1_000);
    expect(h.FakeWs.all).toHaveLength(2);
  });

  it('com o servidor respondendo, não derruba nunca', () => {
    const s = socket();
    const quedas: string[] = [];
    s.on('disconnect', (reason) => quedas.push(reason));
    const ws = last();
    ws.open();
    let respondidos = 0;
    for (let t = 0; t < 120; t++) {
      vi.advanceTimersByTime(1_000);
      while (respondidos < ws.pings) {
        ws.receive('pong');
        respondidos++;
      }
    }
    expect(respondidos).toBeGreaterThan(5);
    expect(quedas).toEqual([]);
    expect(h.FakeWs.all).toHaveLength(1);
  });

  it('a tela volta (celular acordou): prova na hora e, sem resposta em 3 s, reconecta', () => {
    const s = socket();
    const quedas: string[] = [];
    s.on('disconnect', (reason) => quedas.push(reason));
    const ws = last();
    ws.open();
    vi.advanceTimersByTime(2_000);
    h.fire('visibilitychange');
    expect(ws.pings).toBe(1);
    vi.advanceTimersByTime(4_100);
    expect(quedas).toEqual(['network']);
  });

  it('pedido que demora com a conexão morta volta "sem servidor" em poucos segundos, não em 8', async () => {
    const s = socket();
    last().open();
    const resposta = s.request('room:join', { code: 'ABCD' });
    let r: { ok: boolean; error?: { code: string } } | null = null;
    void resposta.then((x) => (r = x as typeof r));
    await vi.advanceTimersByTimeAsync(2_600);
    expect(last().pings).toBe(1);
    await vi.advanceTimersByTimeAsync(3_500);
    expect(r).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 'OFFLINE' }) }));
  });

  it('pedido respondido não dispara prova nenhuma', async () => {
    const s = socket();
    const ws = last();
    ws.open();
    const resposta = s.request('room:join', { code: 'ABCD' });
    await vi.advanceTimersByTimeAsync(0);
    const enviado = JSON.parse(ws.sent[0]!) as { id: number };
    ws.receive(JSON.stringify({ id: enviado.id, r: { ok: true } }));
    await expect(resposta).resolves.toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(ws.pings).toBe(0);
  });

  it('tentativa que não abre em 8 s é abandonada e outra sai', () => {
    socket();
    const primeira = last();
    vi.advanceTimersByTime(8_100);
    expect(primeira.closedWith).not.toBeNull();
    vi.advanceTimersByTime(6_000);
    expect(h.FakeWs.all.length).toBeGreaterThanOrEqual(2);
  });

  it('a rede volta com uma tentativa pendurada: recomeça na hora', () => {
    socket();
    const pendurada = last();
    vi.advanceTimersByTime(3_000);
    h.fire('online');
    expect(pendurada.closedWith).not.toBeNull();
    expect(h.FakeWs.all).toHaveLength(2);
    last().open();
    expect(h.FakeWs.all).toHaveLength(2);
  });

  it('depois de fechar (saiu da sala), nada reconecta nem pinga', () => {
    const s = socket();
    const ws = last();
    ws.open();
    s.close();
    h.fire('online');
    h.fire('visibilitychange');
    vi.advanceTimersByTime(60_000);
    expect(h.FakeWs.all).toHaveLength(1);
    expect(ws.pings).toBe(0);
  });

  it('vendo os outros jogarem (só recebendo), pinga a cada 10 s para o servidor saber que está aí', () => {
    socket();
    const ws = last();
    ws.open();
    for (let t = 0; t < 31; t++) {
      vi.advanceTimersByTime(1_000);
      ws.receive(JSON.stringify({ e: 'game:view', d: {} }));
      while (ws.sent.filter((d) => d === 'ping').length > 0 && ws.sent.at(-1) === 'ping') {
        ws.receive('pong');
        ws.sent.push('respondido');
      }
    }
    expect(ws.pings).toBeGreaterThanOrEqual(3);
  });
});
