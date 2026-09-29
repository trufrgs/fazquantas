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
export type DisconnectReason =
  | 'network'
  | 'replaced'
  | 'kicked'
  | 'left'
  | 'gone'
  | 'closedByAdmin'
  | 'tooManyAttempts'
  | 'rateLimited'
  | 'maintenance'
  | 'refused'
  | 'closed';

type ServerEvent = keyof ServerToClientEvents;
type Payload<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>[0];

interface LocalEvents {
  connect: () => void;
  /** `detail`: o texto do servidor ao fechar (recado da manutenção, limite de salas). */
  disconnect: (reason: DisconnectReason, detail?: string) => void;
}

const ACK_TIMEOUT_MS = 8000;
/**
 * Prova de vida. Conexão morta em silêncio (túnel, troca de wi-fi para 4G, celular que dormiu) não
 * avisa: o navegador segue achando que está aberta. Então: sem ouvir nada (ou sem mandar nada, que o
 * servidor também precisa saber que a gente está aí) por `IDLE_PING_MS`, pinga;
 * ping sem resposta em `PONG_TIMEOUT_MS` derruba e reconecta. Ao voltar a tela ou a rede, e quando um
 * pedido demora, a prova é na hora e mais curta (`PROBE_TIMEOUT_MS`). O ping é respondido pelo
 * Cloudflare sem acordar a sala. Antes (20 s de ping, 45 s de prazo), levava até um minuto para
 * perceber, e o toque na carta sumia sem aviso.
 */
const IDLE_PING_MS = 10_000;
const PONG_TIMEOUT_MS = 5_000;
const PROBE_TIMEOUT_MS = 3_000;
/** Pedido sem resposta nesse tempo dispara a prova (a resposta normal chega em milissegundos). */
const SLOW_ACK_MS = 2_500;
/** Conexão que não abre nesse tempo é abandonada: sem rede, a tentativa ficaria pendurada. */
const CONNECT_TIMEOUT_MS = 8_000;
const CHECK_MS = 1_000;
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
    case WS_CLOSE.rateLimited:
      return 'rateLimited';
    case WS_CLOSE.maintenance:
      return 'maintenance';
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
  private readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  private readonly acks = new Map<number, { resolve: (r: Ack<object>) => void; timer: number }>();
  private seq = 0;
  private attempt = 0;
  private stopped = false;
  private lastHeard = 0;
  /** Última mensagem mandada: o servidor também precisa ouvir a gente (decide se o lugar está em uso). */
  private lastSent = 0;
  /** Quando o último ping saiu e até quando a resposta tem que chegar (`null` = nenhum esperando). */
  private pingSentAt = 0;
  private pingDeadline: number | null = null;
  /** Quando a conexão atual começou a abrir. */
  private openedAt = 0;
  private heartbeat: number | null = null;
  private retry: number | null = null;
  private readonly onOnline = () => this.reconnectNow();
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.reconnectNow();
  };
  connected = false;

  /** Endereço da sala (muda de `/nova` para o da sala criada: é para lá que a reconexão vai). */
  get url(): string {
    return this.target;
  }

  /**
   * A sala foi criada: dali em diante a reconexão vai para o endereço dela. Sem isso, quem criou a
   * sala reconectava em `/api/salas/nova`, caía numa sala nova e vazia e ouvia "sala não encontrada"
   * (bug de 28/09/2026: bastava o celular apagar a tela ou sair um deploy).
   */
  retarget(url: string): void {
    this.target = url;
  }

  constructor(private target: string) {
    window.addEventListener('online', this.onOnline);
    // `pageshow`: a página voltou do cache de navegação (Safari), com as conexões fechadas.
    window.addEventListener('pageshow', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisible);
    this.open();
  }

  on<E extends ServerEvent>(event: E, fn: (data: Payload<E>) => void): void;
  on<E extends keyof LocalEvents>(event: E, fn: LocalEvents[E]): void;
  on(event: string, fn: (data: never) => void): void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as (...args: unknown[]) => void);
  }

  off(event: string, fn: (data: never) => void): void {
    this.handlers.get(event)?.delete(fn as (...args: unknown[]) => void);
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }

  /** Manda sem esperar resposta (some se estiver sem conexão). */
  emit<E extends keyof ClientToServerEvents>(event: E, payload?: unknown): void {
    this.send({ e: event, d: payload });
  }

  /** Manda e espera a resposta. Sem conexão, espera ela voltar até o tempo acabar. */
  async request<T extends object = object>(
    event: keyof ClientToServerEvents,
    payload?: unknown,
    { timeoutMs = ACK_TIMEOUT_MS }: { timeoutMs?: number } = {},
  ): Promise<Ack<T>> {
    if (!(await this.whenConnected())) return NO_SERVER;
    const id = ++this.seq;
    return new Promise<Ack<T>>((resolve) => {
      // Demorou: prova de vida na hora. Conexão morta cai em segundos e o pedido volta sem servidor.
      const slow = window.setTimeout(() => this.probe(), SLOW_ACK_MS);
      const done = (r: Ack<object>) => {
        window.clearTimeout(slow);
        resolve(r as Ack<T>);
      };
      const timer = window.setTimeout(() => {
        this.acks.delete(id);
        done(NO_ANSWER);
      }, timeoutMs);
      this.acks.set(id, { resolve: done, timer });
      if (!this.send({ e: event, d: payload, id })) {
        window.clearTimeout(timer);
        this.acks.delete(id);
        done(NO_SERVER);
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

  /**
   * A conexão está viva? Pinga e, sem resposta em poucos segundos, derruba e reconecta. Sem conexão,
   * tenta abrir agora.
   */
  probe(): void {
    if (this.stopped) return;
    if (this.connected) this.ping(PROBE_TIMEOUT_MS);
    else this.reconnectNow();
  }

  /** Fecha de vez (saiu da sala): não reconecta mais. */
  close(): void {
    this.detach();
    if (this.stopped) return;
    this.stopped = true;
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
    this.openedAt = Date.now();
    const opening = window.setTimeout(() => {
      if (this.ws === ws && !this.connected) this.drop(ws, 'não abriu', { quick: false });
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      window.clearTimeout(opening);
      if (this.ws !== ws) return;
      this.connected = true;
      this.attempt = 0;
      this.lastHeard = Date.now();
      this.lastSent = Date.now();
      this.pingDeadline = null;
      this.startHeartbeat();
      this.fire('connect');
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return;
      this.lastHeard = Date.now();
      this.pingDeadline = null;
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
      window.clearTimeout(opening);
      if (this.ws !== ws) return;
      this.ws = null;
      const was = this.connected;
      this.connected = false;
      this.stopHeartbeat();
      const reason = this.stopped ? 'closed' : reasonFor(ev.code);
      // Recusa com recado (manutenção, limite de salas): quem esperava resposta recebe o recado.
      const detail = reason === 'rateLimited' || reason === 'maintenance' ? ev.reason : undefined;
      this.failAcks(detail);
      if (reason === 'network' && !this.stopped) this.scheduleRetry();
      else {
        this.stopped = true;
        this.detach();
      }
      // Tentativa que nem abriu não é "queda": só avisa de quem estava conectado ou de fim de vez.
      if (was || reason !== 'network') this.fire('disconnect', reason, detail);
    };
    ws.onerror = () => {
      // O onclose vem em seguida.
    };
  }

  /** Para de ouvir rede e tela (acabou de vez). */
  private detach(): void {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('pageshow', this.onOnline);
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  private send(msg: object): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      this.lastSent = Date.now();
      return true;
    } catch {
      return false;
    }
  }

  private fire(event: string, ...args: unknown[]): void {
    for (const fn of [...(this.handlers.get(event) ?? [])]) {
      try {
        fn(...args);
      } catch (error) {
        console.error(`[sala] erro tratando ${event}`, error);
      }
    }
  }

  private failAcks(detail?: string): void {
    const answer = detail ? { ok: false as const, error: { code: 'REFUSED', message: detail } } : NO_SERVER;
    for (const [id, ack] of this.acks) {
      window.clearTimeout(ack.timer);
      ack.resolve(answer);
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

  /**
   * Voltou a rede ou a tela: conectada, prova que está viva (pode ter morrido em silêncio enquanto o
   * celular dormia); abrindo há um tempo, recomeça (a tentativa da época sem rede fica pendurada);
   * esperando a próxima tentativa, tenta agora.
   */
  private reconnectNow(): void {
    if (this.stopped) return;
    if (this.connected) {
      this.ping(PROBE_TIMEOUT_MS);
      return;
    }
    if (this.ws) {
      if (Date.now() - this.openedAt < 1500) return;
      const stale = this.ws;
      this.ws = null;
      try {
        stale.close();
      } catch {
        // já fechada
      }
    }
    if (this.retry !== null) {
      window.clearTimeout(this.retry);
      this.retry = null;
    }
    this.open();
  }

  /** Manda um ping e marca até quando a resposta tem que chegar. */
  private ping(timeoutMs: number): void {
    const ws = this.ws;
    if (!ws || !this.connected) return;
    const now = Date.now();
    this.pingSentAt = now;
    this.lastSent = now;
    this.pingDeadline = Math.min(this.pingDeadline ?? Number.POSITIVE_INFINITY, now + timeoutMs);
    try {
      ws.send(WS_PING);
    } catch {
      // o onclose cuida
    }
  }

  /**
   * Derruba uma conexão que não responde (ou não abriu) e tenta de novo. `quick`: a próxima tentativa
   * sai logo (a rede pode estar boa; quem morreu foi só esta conexão).
   */
  private drop(ws: WebSocket, why: string, { quick = true } = {}): void {
    if (this.ws !== ws) return;
    this.ws = null;
    const was = this.connected;
    this.connected = false;
    this.pingDeadline = null;
    this.stopHeartbeat();
    this.failAcks();
    try {
      ws.close(4000, why);
    } catch {
      // já fechada
    }
    if (quick) this.attempt = 0;
    this.scheduleRetry();
    if (was) this.fire('disconnect', 'network');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = window.setInterval(() => {
      const ws = this.ws;
      if (!ws || !this.connected) return;
      const now = Date.now();
      // Ping sem resposta no prazo: morta em silêncio. Derruba e deixa a reconexão cuidar.
      if (this.pingDeadline !== null && this.lastHeard < this.pingSentAt && now > this.pingDeadline) {
        this.drop(ws, 'sem resposta');
        return;
      }
      // Pinga se ficou 10 s sem ouvir o servidor, ou sem ele ouvir a gente (vendo os outros jogarem).
      if (this.pingDeadline === null && (now - this.lastHeard >= IDLE_PING_MS || now - this.lastSent >= IDLE_PING_MS)) this.ping(PONG_TIMEOUT_MS);
    }, CHECK_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}
