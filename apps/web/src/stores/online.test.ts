import type { Ack, JoinResult, PlayerView, RoomState, ViewMessage } from '@fodinha/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O store roda no navegador: aqui ganha um `window` mínimo e um socket falso que o teste controla.
const h = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  class FakeSocket {
    connected = true;
    readonly handlers = new Map<string, Set<Handler>>();
    readonly sent: { event: string; args: unknown[] }[] = [];
    on(event: string, fn: Handler) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event)!.add(fn);
      return this;
    }
    off(event: string, fn: Handler) {
      this.handlers.get(event)?.delete(fn);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      this.sent.push({ event, args });
      return this;
    }
    removeAllListeners() {
      this.handlers.clear();
      return this;
    }
    disconnect() {
      this.connected = false;
      return this;
    }
    /** Evento vindo do servidor ou do próprio socket.io (`connect`, `disconnect`). */
    fire(event: string, ...args: unknown[]) {
      for (const fn of [...(this.handlers.get(event) ?? [])]) fn(...args);
    }
    count(event: string) {
      return this.sent.filter((s) => s.event === event).length;
    }
    /** Responde ao último envio de `event` que esperava confirmação. */
    ackLast(event: string, reply: unknown) {
      const sent = [...this.sent].reverse().find((s) => s.event === event);
      (sent?.args.at(-1) as (r: unknown) => void)(reply);
    }
  }
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    setTimeout: (fn: () => void, ms?: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id),
    location: { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost' },
  };
  return { FakeSocket, sockets: [] as InstanceType<typeof FakeSocket>[], store };
});

vi.mock('socket.io-client', () => ({
  io: () => {
    const s = new h.FakeSocket();
    h.sockets.push(s);
    return s;
  },
}));
vi.mock('../lib/platform', () => ({ serverUrl: () => 'http://servidor' }));

const { savedSession, useOnline } = await import('./online');
const { useApp } = await import('./app');
const { useGame } = await import('./game');

const SESSION_KEY = 'fodinha:sala';
const socket = () => h.sockets.at(-1)!;
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function room(status: RoomState['status'] = 'playing'): RoomState {
  return { code: 'ABCD', youId: 'p1', hostId: 'p1', status, seats: [] } as unknown as RoomState;
}

function viewMessage(view: Partial<PlayerView>, extra: Partial<ViewMessage> = {}): ViewMessage {
  return {
    view: { seq: 1, roundNumber: 1, turnDeadline: null, players: [], ...view } as PlayerView,
    auto: false,
    reason: null,
    actorId: null,
    serverNow: Date.now(),
    ...extra,
  };
}

const joined = (token: string): Ack<JoinResult> => ({ ok: true, code: 'ABCD', token, playerId: 'p1' });

/** Entra na sala ABCD (já com partida rolando) e vai para a mesa. */
async function enterRoom() {
  const joining = useOnline.getState().join('ABCD');
  await flush();
  socket().ackLast('room:join', joined('tok-1'));
  await joining;
  socket().fire('room:state', room());
  useApp.setState({ screen: 'lobby', stack: [] });
  socket().fire('game:view', viewMessage({}));
}

/** A conexão cai e volta; devolve o socket. */
async function dropAndReconnect() {
  const s = socket();
  s.fire('disconnect', 'transport close');
  s.fire('connect');
  await flush();
  return s;
}

beforeEach(() => {
  vi.useFakeTimers();
  useOnline.getState().leave();
  h.store.clear();
  useApp.setState({ screen: 'home', stack: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('online store', () => {
  it('enters the table when the room is mid-game', async () => {
    await enterRoom();
    expect(useApp.getState().screen).toBe('game');
    expect(useGame.getState().conn?.kind).toBe('online');
    expect(savedSession()?.token).toBe('tok-1');
  });

  it('a tab replaced by another keeps the shared session token', async () => {
    await enterRoom();
    // A outra aba já salvou o token dela no mesmo localStorage.
    h.store.set(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 'tok-2', playerId: 'p1' }));
    const s = socket();
    s.connected = false;
    s.fire('disconnect', 'io server disconnect');
    expect(savedSession()?.token).toBe('tok-2');
    expect(useOnline.getState().room).toBeNull();
    expect(useOnline.getState().error).toMatch(/outro aparelho ou aba/);
    expect(useApp.getState().screen).toBe('online');
    // O próximo uso abre um socket novo.
    void useOnline.getState().join('ABCD');
    await flush();
    expect(socket()).not.toBe(s);
  });

  it('an older rejoin that times out does not undo a newer one', async () => {
    await enterRoom();
    const s = await dropAndReconnect(); // tentativa 1: o ack se perde com a queda
    expect(useOnline.getState().status).toBe('reconnecting');
    await dropAndReconnect(); // tentativa 2
    s.ackLast('room:join', joined('tok-1'));
    await flush();
    s.fire('room:state', room());
    expect(useOnline.getState().status).toBe('online');

    await vi.advanceTimersByTimeAsync(9000); // a tentativa 1 estoura o prazo
    expect(useOnline.getState().status).toBe('online');
    expect(useOnline.getState().room?.code).toBe('ABCD');
    expect(savedSession()?.token).toBe('tok-1');
    expect(useApp.getState().screen).toBe('game');
    expect(useGame.getState().conn?.kind).toBe('online');
  });

  it('a passing failure keeps the seat and tries again', async () => {
    await enterRoom();
    const s = await dropAndReconnect();
    const tries = s.count('room:join');
    s.ackLast('room:join', { ok: false, error: { code: 'RATE_LIMITED', message: 'Muitas ações seguidas.' } });
    await flush();
    expect(useOnline.getState().status).toBe('reconnecting');
    expect(useOnline.getState().room?.code).toBe('ABCD');
    expect(savedSession()?.token).toBe('tok-1');
    expect(useApp.getState().screen).toBe('game');

    await vi.advanceTimersByTimeAsync(3000);
    await flush();
    expect(s.count('room:join')).toBe(tries + 1);
  });

  it('a room that is gone drops to the online screen and is forgotten', async () => {
    await enterRoom();
    const s = await dropAndReconnect();
    s.ackLast('room:join', { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'Sala não encontrada. Confere o código.' } });
    await flush();
    expect(useOnline.getState().room).toBeNull();
    expect(useOnline.getState().status).toBe('idle');
    expect(useOnline.getState().error).toBe('Sala não encontrada. Confere o código.');
    expect(savedSession()).toBeNull();
    expect(useApp.getState().screen).toBe('online');
    expect(useGame.getState().conn).toBeNull();
  });

  it('leaving during a pending rejoin is final', async () => {
    await enterRoom();
    const s = await dropAndReconnect();
    useOnline.getState().leave();
    s.ackLast('room:join', joined('tok-9'));
    await flush();
    expect(savedSession()).toBeNull();
    expect(useOnline.getState().status).toBe('idle');
    expect(useOnline.getState().room).toBeNull();
  });

  it('a failed join by code keeps the saved room only when the network is to blame', async () => {
    h.store.set(SESSION_KEY, JSON.stringify({ code: 'ABCD', token: 'tok-1', playerId: 'p1' }));
    const first = useOnline.getState().join('ABCD');
    await flush();
    socket().ackLast('room:join', { ok: false, error: { code: 'TIMEOUT', message: 'O servidor não respondeu.' } });
    expect(await first).toBe(false);
    expect(savedSession()?.token).toBe('tok-1');

    const second = useOnline.getState().join('ABCD');
    await flush();
    socket().ackLast('room:join', { ok: false, error: { code: 'GAME_IN_PROGRESS', message: 'Essa sala tá no meio de uma partida.' } });
    expect(await second).toBe(false);
    expect(savedSession()).toBeNull();
  });

  it('back to the lobby while reading the rules leads back to the room', async () => {
    await enterRoom();
    useApp.getState().go('rules');
    socket().fire('room:state', room('lobby'));
    expect(useGame.getState().conn).toBeNull();
    expect(useApp.getState().screen).toBe('rules');
    expect(useApp.getState().stack).toEqual(['lobby']);

    // O anfitrião começa outra antes de a pessoa voltar: o "voltar" leva para a mesa nova.
    socket().fire('room:state', room('playing'));
    socket().fire('game:view', viewMessage({ seq: 0 }));
    expect(useGame.getState().conn?.kind).toBe('online');
    expect(useApp.getState().stack).toEqual(['game']);
    useApp.getState().back();
    expect(useApp.getState().screen).toBe('game');
  });

  it('converts the turn deadline to this device clock, and tolerates servers without serverNow', async () => {
    await enterRoom();
    const now = Date.now();
    socket().fire('game:view', viewMessage({ seq: 2, turnDeadline: now + 20_000 }, { serverNow: now + 5000 }));
    expect(useGame.getState().update?.view.turnDeadline).toBe(now + 15_000);

    const old = viewMessage({ seq: 3, turnDeadline: now + 20_000 });
    delete (old as Partial<ViewMessage>).serverNow;
    socket().fire('game:view', old);
    expect(useGame.getState().update?.view.turnDeadline).toBe(now + 20_000);
  });
});
