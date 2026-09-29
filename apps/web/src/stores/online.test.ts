import type { Ack, JoinResult, PlayerView, RoomState, ViewMessage } from '@fodinha/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O store roda no navegador: aqui ganha um `window` mínimo e uma conexão de sala falsa que o
// teste controla.
const h = vi.hoisted(() => {
  type Handler = (...data: unknown[]) => void;
  class FakeSocket {
    connected = true;
    closed = false;
    readonly handlers = new Map<string, Set<Handler>>();
    readonly sent: { event: string; payload: unknown; reply?: (r: unknown) => void }[] = [];
    constructor(public url: string) {}
    retarget(url: string) {
      this.url = url;
    }
    on(event: string, fn: Handler) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event)!.add(fn);
    }
    off(event: string, fn: Handler) {
      this.handlers.get(event)?.delete(fn);
    }
    emit(event: string, payload?: unknown) {
      this.sent.push({ event, payload });
    }
    request(event: string, payload?: unknown) {
      return new Promise((resolve) => this.sent.push({ event, payload, reply: resolve }));
    }
    removeAllListeners() {
      this.handlers.clear();
    }
    close() {
      this.closed = true;
      this.connected = false;
    }
    /** Evento vindo do servidor ou da própria conexão (`connect`, `disconnect`). */
    fire(event: string, ...data: unknown[]) {
      for (const fn of [...(this.handlers.get(event) ?? [])]) fn(...data);
    }
    count(event: string) {
      return this.sent.filter((s) => s.event === event).length;
    }
    /** Responde ao último pedido de `event` que esperava resposta. */
    ackLast(event: string, reply: unknown) {
      const sent = [...this.sent].reverse().find((s) => s.event === event && s.reply);
      sent?.reply?.(reply);
    }
  }
  const store = new Map<string, string>();
  const tab = new Map<string, string>();
  const fetches: { url: string; init: RequestInit }[] = [];
  (globalThis as unknown as { fetch: unknown }).fetch = (url: string, init: RequestInit) => {
    fetches.push({ url, init });
    return Promise.resolve(new Response('{"ok":true}'));
  };
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    sessionStorage: {
      getItem: (k: string) => tab.get(k) ?? null,
      setItem: (k: string, v: string) => void tab.set(k, v),
      removeItem: (k: string) => void tab.delete(k),
    },
    setTimeout: (fn: () => void, ms?: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(id),
    location: { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost' },
  };
  return { FakeSocket, sockets: [] as InstanceType<typeof FakeSocket>[], store, tab, fetches };
});

vi.mock('../lib/sala-socket', () => ({
  SalaSocket: class {
    constructor(url: string) {
      const s = new h.FakeSocket(url);
      h.sockets.push(s);
      return s;
    }
  },
}));
vi.mock('../lib/platform', () => ({ serverUrl: () => 'http://servidor' }));

const { abaSubstituida, savedSession, useOnline } = await import('./online');
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

/** A conexão cai e volta (o mesmo `SalaSocket` reconecta sozinho); devolve o socket. */
async function dropAndReconnect() {
  const s = socket();
  s.fire('disconnect', 'network');
  s.fire('connect');
  await flush();
  return s;
}

beforeEach(() => {
  vi.useFakeTimers();
  useOnline.getState().leave();
  h.store.clear();
  h.tab.clear();
  h.fetches.length = 0;
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
    s.fire('disconnect', 'replaced');
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

  it('a room with a password asks for it and retries on the same connection', async () => {
    const first = useOnline.getState().join('ABCD');
    await flush();
    const s = socket();
    expect(s.url).toBe('ws://servidor/api/salas/ABCD');
    s.ackLast('room:join', { ok: false, error: { code: 'PASSWORD_REQUIRED', message: 'Essa sala tem senha.' } });
    expect(await first).toBe(false);
    expect(useOnline.getState().passwordFor).toBe('ABCD');
    expect(useOnline.getState().error).toBeNull();
    expect(s.closed).toBe(false);

    const wrong = useOnline.getState().join('ABCD', { password: 'errada' });
    await flush();
    expect(socket()).toBe(s); // mesma conexão: o servidor conta as tentativas
    s.ackLast('room:join', { ok: false, error: { code: 'WRONG_PASSWORD', message: 'Senha errada.' } });
    expect(await wrong).toBe(false);
    expect(useOnline.getState().error).toBe('Senha errada.');

    const right = useOnline.getState().join('ABCD', { password: 'galpão' });
    await flush();
    expect((s.sent.at(-1)?.payload as { password?: string }).password).toBe('galpão');
    s.ackLast('room:join', joined('tok-1'));
    expect(await right).toBe(true);
    expect(useOnline.getState().passwordFor).toBeNull();
  });

  it('creating retries with another code when the drawn one is taken', async () => {
    const creating = useOnline.getState().create({ bestOf: 3 });
    await flush();
    const first = socket();
    expect(first.url).toBe('ws://servidor/api/salas/nova');
    first.ackLast('room:create', { ok: false, error: { code: 'ROOM_TAKEN', message: 'Esse código acabou de ser usado.' } });
    await flush();
    const second = socket();
    expect(second).not.toBe(first);
    expect(first.closed).toBe(true);
    expect((second.sent.at(-1)?.payload as { settings: { bestOf: number } }).settings.bestOf).toBe(3);
    second.ackLast('room:create', joined('tok-1'));
    expect(await creating).toBe(true);
    expect(savedSession()?.token).toBe('tok-1');
  });

  it('after creating, reconnecting goes back to the created room, not to a new one', async () => {
    const creating = useOnline.getState().create();
    await flush();
    const s = socket();
    expect(s.url).toBe('ws://servidor/api/salas/nova');
    s.ackLast('room:create', joined('tok-1'));
    expect(await creating).toBe(true);
    // Bug de 28/09/2026: quem criou a sala reconectava em /nova e ouvia "sala não encontrada".
    expect(s.url).toBe(`ws://servidor/api/salas/${savedSession()?.code}`);
  });

  it('being kicked drops to the online screen with the reason', async () => {
    await enterRoom();
    socket().fire('disconnect', 'kicked');
    expect(useOnline.getState().room).toBeNull();
    expect(useOnline.getState().kicked).toBe(true);
    expect(useOnline.getState().error).toMatch(/anfitrião te tirou/);
    expect(savedSession()).toBeNull();
  });

  // Rodada de QA de 29/09/2026 ------------------------------------------------

  it('the automatic return goes as auto, so the server never seats it as a newcomer', async () => {
    await enterRoom();
    const s = await dropAndReconnect();
    const pedido = [...s.sent].reverse().find((x) => x.event === 'room:join');
    expect(pedido?.payload).toMatchObject({ code: 'ABCD', token: 'tok-1', auto: true });
  });

  it('the seat in use on another device: steps aside, keeps the session, and this tab does not take it back by itself', async () => {
    await enterRoom();
    const s = await dropAndReconnect();
    s.ackLast('room:join', { ok: false, error: { code: 'SEAT_TAKEN', message: 'Tu estás nessa sala em outro aparelho ou aba.' } });
    await flush();
    expect(useOnline.getState().room).toBeNull();
    expect(useOnline.getState().error).toMatch(/outro aparelho/);
    expect(savedSession()?.token).toBe('tok-1');
    expect(abaSubstituida('ABCD')).toBe(true);
    // Entrar de propósito devolve o lugar a esta aba.
    void useOnline.getState().join('ABCD');
    await flush();
    expect(abaSubstituida('ABCD')).toBe(false);
  });

  it('kicked while offline: the automatic return says so and forgets the room', async () => {
    await enterRoom();
    const s = await dropAndReconnect();
    s.ackLast('room:join', { ok: false, error: { code: 'KICKED', message: 'O anfitrião te tirou da sala.' } });
    await flush();
    expect(useOnline.getState().error).toBe('O anfitrião te tirou da sala.');
    expect(useOnline.getState().kicked).toBe(true);
    expect(savedSession()).toBeNull();
  });

  it('leaving also leaves over plain HTTP with the token (survives a dead socket and closing the tab)', async () => {
    await enterRoom();
    useOnline.getState().leave();
    const saida = h.fetches.find((f) => f.url === 'http://servidor/api/salas/ABCD/sair');
    expect(saida?.init).toMatchObject({ method: 'POST', keepalive: true });
    expect(JSON.parse(String(saida?.init.body))).toEqual({ token: 'tok-1' });
  });

  it('the token also lives in memory: storage wiped by another tab does not lose the seat', async () => {
    await enterRoom();
    h.store.clear();
    const s = await dropAndReconnect();
    const pedido = [...s.sent].reverse().find((x) => x.event === 'room:join');
    expect(pedido?.payload).toMatchObject({ token: 'tok-1' });
  });

  it('a refused create (maintenance) does not erase a room saved by another tab', async () => {
    h.store.set(SESSION_KEY, JSON.stringify({ code: 'WXYZ', token: 't9', playerId: 'p9' }));
    void useOnline.getState().create();
    await flush();
    socket().fire('disconnect', 'maintenance', 'Volto às 22h.');
    await flush();
    expect(useOnline.getState().error).toBe('Volto às 22h.');
    expect(savedSession()?.code).toBe('WXYZ');
  });

  it('while reconnecting, a request waits for the return to the seat instead of hearing "not in a room"', async () => {
    await enterRoom();
    const s = await dropAndReconnect();
    const comecar = useOnline.getState().start();
    await flush();
    expect(s.count('room:start')).toBe(0);
    s.ackLast('room:join', joined('tok-1'));
    await flush();
    expect(s.count('room:start')).toBe(1);
    s.ackLast('room:start', { ok: true });
    await expect(comecar).resolves.toBeNull();
  });
});
