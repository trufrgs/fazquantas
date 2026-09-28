import http, { type IncomingHttpHeaders } from 'node:http';
import type {
  Ack,
  ClientAction,
  ClientToServerEvents,
  GameState,
  HostTiming,
  JoinResult,
  RoomState,
  SeatPublic,
  ServerToClientEvents,
  ViewMessage,
} from '@fodinha/engine';
import { io as connectClient, type Socket } from 'socket.io-client';
import { onTestFinished } from 'vitest';
import { silentLogger } from '../src/logger';
import { createFodinhaServer, type FodinhaServer, type FodinhaServerOptions } from '../src/server';

/** Pausas curtas: uma partida inteira roda em poucos segundos. */
export const FAST_TIMING: Partial<HostTiming> = {
  botThinkMs: [0, 5],
  trickPauseMs: 5,
  roundPauseMs: 5,
  forcedPlayMs: 5,
  dealMs: 0,
  awayActMs: 5,
};

export async function startServer(opts: FodinhaServerOptions = {}): Promise<FodinhaServer> {
  const server = await createFodinhaServer({
    port: 0,
    host: '127.0.0.1',
    timing: FAST_TIMING,
    logger: silentLogger,
    ...opts,
  });
  onTestFinished(() => server.close());
  return server;
}

export type Reaction = Parameters<ServerToClientEvents['game:reaction']>[0];
type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Cliente de teste: grava tudo o que chega e permite esperar por condições. */
export class TestClient {
  readonly socket: TypedSocket;
  readonly states: RoomState[] = [];
  readonly views: ViewMessage[] = [];
  readonly reactions: Reaction[] = [];
  /** Ordem de chegada (eventos e acks), para conferir a sequência. */
  readonly events: string[] = [];
  kicked = 0;
  disconnectReason: string | null = null;
  private readonly waiters = new Set<() => void>();

  constructor(url: string, transports: ('websocket' | 'polling')[] = ['websocket']) {
    this.socket = connectClient(url, {
      transports,
      forceNew: true,
      reconnection: false,
      autoConnect: false,
    });
    this.socket.on('room:state', (state) => this.record('room:state', this.states, state));
    this.socket.on('game:view', (message) => this.record('game:view', this.views, message));
    this.socket.on('game:reaction', (r) => this.record('game:reaction', this.reactions, r));
    this.socket.on('room:kicked', () => {
      this.kicked += 1;
      this.events.push('room:kicked');
      this.notify();
    });
    this.socket.on('disconnect', (reason) => {
      this.disconnectReason = reason;
      this.notify();
    });
  }

  get state(): RoomState | undefined {
    return this.states.at(-1);
  }

  get lastView(): ViewMessage | undefined {
    return this.views.at(-1);
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  seat(playerId: string): SeatPublic | undefined {
    return this.state?.seats.find((s) => s.playerId === playerId);
  }

  connect(): Promise<this> {
    return new Promise((resolve, reject) => {
      this.socket.once('connect', () => resolve(this));
      this.socket.once('connect_error', reject);
      this.socket.connect();
    });
  }

  close(): void {
    this.socket.disconnect();
  }

  /** Emite com ack (sem tipos: os testes também mandam lixo de propósito). */
  call<T extends object = object>(event: string, ...args: unknown[]): Promise<Ack<T>> {
    const raw = this.socket as unknown as Socket;
    return new Promise((resolve, reject) => {
      raw.timeout(4000).emit(event, ...args, (error: Error | null, response: Ack<T>) => {
        if (error) {
          reject(new Error(`sem resposta para ${event}`));
          return;
        }
        this.events.push(`ack:${event}`);
        resolve(response);
      });
    });
  }

  /** Emite sem ack. */
  send(event: string, ...args: unknown[]): void {
    (this.socket as unknown as Socket).emit(event, ...args);
  }

  waitFor<T>(
    check: () => T | undefined | null | false,
    label: string,
    timeoutMs = 5000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
      };
      const waiter = () => {
        try {
          const value = check();
          if (value !== undefined && value !== null && value !== false) {
            done();
            resolve(value);
          }
        } catch (error) {
          done();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`tempo esgotado esperando ${label}`));
      }, timeoutMs);
      this.waiters.add(waiter);
      waiter();
    });
  }

  waitForState(pred: (s: RoomState) => boolean, label = 'room:state', timeoutMs?: number) {
    return this.waitFor(
      () => (this.state && pred(this.state) ? this.state : undefined),
      label,
      timeoutMs,
    );
  }

  waitForView(pred: (m: ViewMessage) => boolean, label = 'game:view', timeoutMs?: number) {
    const last = () => this.lastView;
    return this.waitFor(() => (last() && pred(last()!) ? last() : undefined), label, timeoutMs);
  }

  private record<T>(name: string, list: T[], item: T): void {
    list.push(item);
    this.events.push(name);
    this.notify();
  }

  private notify(): void {
    for (const waiter of [...this.waiters]) waiter();
  }
}

export async function connect(
  server: FodinhaServer,
  transports?: ('websocket' | 'polling')[],
): Promise<TestClient> {
  const client = new TestClient(server.url, transports);
  onTestFinished(() => client.close());
  return client.connect();
}

/** Garante `ok: true` e devolve o resultado tipado. */
export function ok<T extends object>(response: Ack<T>): { ok: true } & T {
  if (!response.ok) {
    throw new Error(`esperava ok, veio ${response.error.code}: ${response.error.message}`);
  }
  return response;
}

export async function createRoom(client: TestClient, name = 'Ana'): Promise<JoinResult> {
  return ok(await client.call<JoinResult>('room:create', { name, avatar: name.toLowerCase() }));
}

export async function joinRoom(
  client: TestClient,
  code: string,
  name: string,
  token?: string,
): Promise<JoinResult> {
  return ok(
    await client.call<JoinResult>('room:join', { code, name, avatar: name.toLowerCase(), token }),
  );
}

/** Espera uma condição do lado do servidor (polling curto). */
export async function waitUntil(check: () => boolean, label: string, timeoutMs = 5000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`tempo esgotado esperando ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Joga sozinho: a cada visão em que é a vez dele, manda um palpite/carta legal. */
export function autoPlay(client: TestClient): { errors: string[]; stop(): void } {
  const errors: string[] = [];
  let lastSeq = -1;
  const onView = (message: ViewMessage) => {
    const v = message.view;
    if (!v.actor || v.actor.playerId !== v.you || v.seq === lastSeq) return;
    let action: ClientAction | null = null;
    if (v.actor.kind === 'bid' && v.legalBids.length > 0) {
      action = { type: 'bid', value: v.legalBids[v.seq % v.legalBids.length]! };
    } else if (v.actor.kind === 'play' && v.legalCards.length > 1) {
      action = { type: 'play', cardId: v.legalCards[v.seq % v.legalCards.length]! };
    }
    // Uma carta só (inclusive às cegas): o host joga sozinho.
    if (!action) return;
    lastSeq = v.seq;
    client.call('game:action', { action }).then(
      (response) => {
        if (!response.ok) errors.push(`${response.error.code}: ${response.error.message}`);
      },
      (error: unknown) => errors.push(String(error)),
    );
  };
  client.socket.on('game:view', onView);
  return { errors, stop: () => client.socket.off('game:view', onView) };
}

const CARD_ID = /"([OCEP](?:1[0-2]|[1-7]))"/g;

/**
 * Procura vazamento de informação numa visão: cartas da mão de outro jogador (fora da rodada às
 * cegas) ou a própria carta às cegas. Com o estado real do servidor na mesma `seq`, confere
 * também contra as mãos verdadeiras.
 */
export function privacyViolations(
  message: ViewMessage,
  youId: string,
  truth?: GameState | null,
): string[] {
  const v = message.view;
  const problems: string[] = [];
  if (v.you !== youId) problems.push(`visão de ${String(v.you)} entregue a ${youId}`);

  const publicCards = new Set<string>();
  if (v.vira) publicCards.add(v.vira);
  const tricks = [
    ...v.completedTricks,
    ...(v.lastTrick ? [v.lastTrick] : []),
    ...(v.trick ? [v.trick] : []),
  ];
  for (const trick of tricks) for (const play of trick.plays) publicCards.add(play.cardId);
  for (const round of v.history) if (round.vira) publicCards.add(round.vira);

  const allowed = new Set([...publicCards, ...(v.hand ?? [])]);
  for (const p of v.players) {
    if (p.id === youId) {
      if (p.visibleCards !== null) problems.push('a própria mão aparece em visibleCards');
      continue;
    }
    if (v.blind && p.inRound) {
      if (p.visibleCards?.length !== p.handCount)
        problems.push(`às cegas, cartas de ${p.name} erradas`);
      for (const c of p.visibleCards ?? []) allowed.add(c);
    } else if (p.visibleCards !== null) {
      problems.push(`cartas de ${p.name} visíveis fora da rodada às cegas`);
    }
  }
  const me = v.players.find((p) => p.id === youId);
  if (v.blind && me?.inRound && me.handCount > 0 && (v.hand !== null || !v.handHidden)) {
    problems.push('a própria carta aparece na rodada às cegas');
  }

  const json = JSON.stringify(v);
  for (const [, id] of json.matchAll(CARD_ID)) {
    if (!allowed.has(id!)) problems.push(`carta ${id} vazou para ${youId}`);
  }

  if (truth && truth.seq === v.seq) {
    const { round } = truth;
    for (const [playerId, hand] of Object.entries(round.hands)) {
      const hidden = playerId === youId ? round.blind : !round.blind; // o que quem vê não pode enxergar
      if (!hidden) continue;
      for (const c of hand) {
        if (json.includes(`"${c}"`))
          problems.push(`carta ${c} (mão de ${playerId}) vazou para ${youId}`);
      }
    }
    // Quem acabou de ser eliminado recebe `hand: null` (a mão real já está vazia).
    if (!round.blind && round.order.includes(youId) && me && !me.eliminated) {
      const own = round.hands[youId] ?? [];
      if (JSON.stringify(v.hand) !== JSON.stringify(own))
        problems.push('mão própria diferente da real');
    }
  }
  return problems;
}

export interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** Requisição HTTP crua (o caminho vai exatamente como escrito, sem normalizar `..`). */
export function rawRequest(
  baseUrl: string,
  path: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): Promise<RawResponse> {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname, port, path, method: init.method ?? 'GET', headers: init.headers, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}
