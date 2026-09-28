import {
  WS_CLOSE,
  WS_PING,
  WS_PONG,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type WireToClient,
} from '@fodinha/engine';

/** Por que a conexão caiu: só `network` tenta de novo sozinha. */
export type DisconnectReason = 'network' | 'replaced' | 'kicked' | 'left' | 'gone' | 'closedByAdmin' | 'tooManyAttempts' | 'refused' | 'closed';

type ServerEvent = keyof ServerToClientEvents;
type Payload<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>[0];

interface LocalEvents {
  connect: () => void;
  disconnect: (reason: DisconnectReason) => void;
}

const ACK_TIMEOUT_MS = 8000;
/** Ping a cada 20 s; sem nada chegando em 45 s, a conexão está morta (rede trocou, celular dormiu). */
const HEARTBEAT_MS = 20_000;
const DEAD_AFTER_MS = 45_000;
const RETRY_MAX_MS = 5000;

export const NO_ANSWER = { ok: false as const, error: { code: 'TIMEOUT', message: 'O servidor não respondeu. Tenta de novo.' } };
export const NO_SERVER = {
  ok: false as const,
  error: { code: 'OFFLINE', message: 'Não deu pra falar com o servidor. Confere a conexão e tenta de novo.' },
};

function reasonFor(code: number): DisconnectReason {
  switch (code) {
    case WS_CLOSE.replaced:
      return 'replaced';
    case WS_CLOSE.kicked:
      return 'kicked';
    case WS_CLOSE.left:
      return 'left';
    case WS_CLOSE.gone:
      return 'gone';
    case WS_CLOSE.closedByAdmin:
      return 'closedByAdmin';
    case WS_CLOSE.tooManyAttempts:
      return 'tooManyAttempts';
    case WS_CLOSE.badOrigin:
      return 'refused';
    default:
      return 'network';
  }
}

/**
 * Uma conexão com uma sala (um WebSocket para o Durable Object dela), com a cara do socket.io
 * que o resto do app já usava: `on`, `emit`, `request` com resposta, reconexão sozinha.
 */
export class SalaSocket {
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, Set<(data: unknown) => void>>();
  private readonly acks = new Map<number, { resolve: (r: Ack<object>) => void; timer: number }>();
  private seq = 0;
  private attempt = 0;
  private stopped = false;
  private lastHeard = 0;
  private heartbeat: number | null = null;
  private retry: number | null = null;
  private readonly onOnline = () => this.reconnectNow();
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.reconnectNow();
  };
  connected = false;

  constructor(readonly url: string) {
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisible);
    this.open();
  }

  on<E extends ServerEvent>(event: E, fn: (data: Payload<E>) => void): void;
  on<E extends keyof LocalEvents>(event: E, fn: LocalEvents[E]): void;
  on(event: string, fn: (data: never) => void): void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as (data: unknown) => void);
  }

  off(event: string, fn: (data: never) => void): void {
    this.handlers.get(event)?.delete(fn as (data: unknown) => void);
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }

  /** Manda sem esperar resposta (some se estiver sem conexão). */
  emit<E extends keyof ClientToServerEvents>(event: E, payload?: unknown): void {
    this.send({ e: event, d: payload });
  }

  /** Manda e espera a resposta. Sem conexão, espera ela voltar até o tempo acabar. */
  async request<T extends object = object>(event: keyof ClientToServerEvents, payload?: unknown): Promise<Ack<T>> {
    if (!(await this.whenConnected())) return NO_SERVER;
    const id = ++this.seq;
    return new Promise<Ack<T>>((resolve) => {
      const timer = window.setTimeout(() => {
        this.acks.delete(id);
        resolve(NO_ANSWER);
      }, ACK_TIMEOUT_MS);
      this.acks.set(id, { resolve: resolve as (r: Ack<object>) => void, timer });
      if (!this.send({ e: event, d: payload, id })) {
        window.clearTimeout(timer);
        this.acks.delete(id);
        resolve(NO_SERVER);
      }
    });
  }

  /** Espera a conexão abrir (sem enfileirar mensagens que chegariam atrasadas). */
  whenConnected(timeoutMs = ACK_TIMEOUT_MS): Promise<boolean> {
    if (this.connected) return Promise.resolve(true);
    if (this.stopped) return Promise.resolve(false);
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        window.clearTimeout(timer);
        this.off('connect', onConnect);
        resolve(ok);
      };
      const onConnect = () => done(true);
      const timer = window.setTimeout(() => done(false), timeoutMs);
      this.on('connect', onConnect);
    });
  }

  /** Fecha de vez (saiu da sala): não reconecta mais. */
  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    window.removeEventListener('online', this.onOnline);
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.retry !== null) window.clearTimeout(this.retry);
    this.stopHeartbeat();
    this.failAcks();
    try {
      this.ws?.close(1000, 'saiu');
    } catch {
      // já fechada
    }
    this.ws = null;
    this.connected = false;
  }

  // ---------------------------------------------------------------------------

  private open(): void {
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.connected = true;
      this.attempt = 0;
      this.lastHeard = Date.now();
      this.startHeartbeat();
      this.fire('connect');
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return;
      this.lastHeard = Date.now();
      if (ev.data === WS_PONG || typeof ev.data !== 'string') return;
      let msg: WireToClient;
      try {
        msg = JSON.parse(ev.data) as WireToClient;
      } catch {
        return;
      }
      if ('id' in msg) {
        const ack = this.acks.get(msg.id);
        if (!ack) return;
        this.acks.delete(msg.id);
        window.clearTimeout(ack.timer);
        ack.resolve(msg.r);
        return;
      }
      this.fire(msg.e, msg.d);
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      const was = this.connected;
      this.connected = false;
      this.stopHeartbeat();
      this.failAcks();
      const reason = this.stopped ? 'closed' : reasonFor(ev.code);
      if (reason === 'network' && !this.stopped) this.scheduleRetry();
      else this.stopped = true;
      // Tentativa que nem abriu não é "queda": só avisa de quem estava conectado ou de fim de vez.
      if (was || reason !== 'network') this.fire('disconnect', reason);
    };
    ws.onerror = () => {
      // O onclose vem em seguida.
    };
  }

  private send(msg: object): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private fire(event: string, data?: unknown): void {
    for (const fn of [...(this.handlers.get(event) ?? [])]) {
      try {
        fn(data);
      } catch (error) {
        console.error(`[sala] erro tratando ${event}`, error);
      }
    }
  }

  private failAcks(): void {
    for (const [id, ack] of this.acks) {
      window.clearTimeout(ack.timer);
      ack.resolve(NO_SERVER);
      this.acks.delete(id);
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retry !== null) return;
    const base = Math.min(RETRY_MAX_MS, 400 * 2 ** this.attempt);
    this.attempt += 1;
    this.retry = window.setTimeout(() => {
      this.retry = null;
      this.open();
    }, base * (0.75 + Math.random() * 0.5));
  }

  /** Voltou a rede ou a tela: tenta agora em vez de esperar o próximo intervalo. */
  private reconnectNow(): void {
    if (this.stopped || this.connected || this.ws) return;
    if (this.retry !== null) {
      window.clearTimeout(this.retry);
      this.retry = null;
    }
    this.open();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = window.setInterval(() => {
      const ws = this.ws;
      if (!ws) return;
      if (Date.now() - this.lastHeard > DEAD_AFTER_MS) {
        // Ninguém responde: derruba e deixa a reconexão cuidar.
        try {
          ws.close(4000, 'sem resposta');
        } catch {
          // já fechada
        }
        return;
      }
      try {
        ws.send(WS_PING);
      } catch {
        // o onclose cuida
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}
