import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  systemClock,
  type Ack,
  type ClientAction,
  type GameState,
  type HostTiming,
  type JoinResult,
  type RoomState,
  type SeatPublic,
  type ServerToClientEvents,
  type ViewMessage,
} from '@fodinha/engine';
import { onTestFinished } from 'vitest';
import { silentLogger } from '../src/logger';
import type { Aviso, Conexao, PartidaRanqueada, Sala, SalaSalva } from '../src/sala';
import { SalaServidor, type RateLimitOptions } from '../src/servidor';

/** Pausas curtas: uma partida inteira roda em poucos segundos. */
export const FAST_TIMING: Partial<HostTiming> = {
  botThinkMs: [0, 5],
  trickPauseMs: 5,
  bidsRevealMs: 5,
  roundPauseMs: 5,
  forcedPlayMs: 5,
  dealMs: 0,
  awayActMs: 5,
};

export interface MundoOpts {
  graceMs?: number;
  ociosaMs?: number;
  ociosaAssincronaMs?: number;
  conferirPerfil?: (profileId: string | null, name: string) => Promise<{ bloqueado: boolean; nome: string; avatar: string | null }>;
  timing?: Partial<HostTiming>;
  rateLimit?: RateLimitOptions;
  /** Tempo por jogada encolhido: 15 s viram 15 ms com 0,001. */
  turnScale?: number;
  aleatorio?: () => number;
  /** Relógio controlado (reações, limite de taxa); os timers continuam de verdade. */
  agora?: () => number;
}

/**
 * O que o Worker faz em produção: um `SalaServidor` (um Durable Object) por código de sala. Guarda
 * o que as salas salvam, o que mandam para o ranking e os avisos de vez.
 */
export class Mundo {
  readonly servidores = new Map<string, SalaServidor>();
  readonly encerradas: { code: string; motivo: string }[] = [];
  readonly ranqueadas: PartidaRanqueada[] = [];
  readonly avisos: Aviso[] = [];
  readonly salvas = new Map<string, SalaSalva | null>();

  constructor(readonly opts: MundoOpts = {}) {}

  /** O Durable Object da sala (cria vazio se ainda não existe, como o `idFromName`). */
  servidor(code: string): SalaServidor {
    let servidor = this.servidores.get(code);
    if (!servidor) {
      const s: SalaServidor = new SalaServidor(code, {
        relogio: this.opts.agora ? { ...systemClock(), now: this.opts.agora } : systemClock(),
        aleatorio: this.opts.aleatorio ?? Math.random,
        timing: this.opts.timing ?? FAST_TIMING,
        graceMs: this.opts.graceMs ?? 60_000,
        ociosaMs: this.opts.ociosaMs ?? 10 * 60_000,
        ociosaAssincronaMs: this.opts.ociosaAssincronaMs,
        conferirPerfil: this.opts.conferirPerfil,
        turnScale: this.opts.turnScale,
        logger: silentLogger,
        rateLimit: this.opts.rateLimit,
        aoMudar: () => this.salvas.set(code, s.serialize()),
        aoEncerrar: (motivo) => {
          this.encerradas.push({ code, motivo });
          this.salvas.delete(code);
        },
        aoTerminarRanqueada: (p) => this.ranqueadas.push(p),
        aoAvisar: (a) => this.avisos.push(a),
      });
      servidor = s;
      this.servidores.set(code, servidor);
    }
    return servidor;
  }

  /** Código novo, como o Worker sorteia para "criar sala". */
  novoCodigo(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.servidores.get(code)?.room) return code;
    }
  }

  /** Salas vivas, por código. */
  readonly rooms = {
    get: (code: string): Sala | undefined => {
      const sala = this.servidores.get(code.toUpperCase())?.room ?? undefined;
      return sala && !sala.isDisposed ? sala : undefined;
    },
    size: (): number => [...this.servidores.values()].filter((s) => s.room && !s.room.isDisposed).length,
  };

  /**
   * Simula a sala hibernando (ou o servidor reiniciando): descarta o objeto e volta do que foi
   * salvo, religando as conexões que continuam abertas.
   */
  hibernar(code: string, conexoes: readonly Conexao[]): SalaServidor {
    const saved = this.salvas.get(code);
    const old = this.servidores.get(code);
    // O objeto some sem avisar ninguém: o vínculo de cada conexão (o "attachment" do WebSocket)
    // sobrevive; só os timers da instância velha param.
    const bound = conexoes.map((c) => c.jogadorId);
    old?.room?.dispose();
    conexoes.forEach((c, i) => {
      c.jogadorId = bound[i] ?? null;
      c.vincular(bound[i] ?? null);
    });
    this.servidores.delete(code);
    const fresh = this.servidor(code);
    if (saved) fresh.restore(saved, conexoes);
    for (const c of conexoes) if (c instanceof ClienteTeste) c.reattach(fresh);
    return fresh;
  }
}

export function startWorld(opts?: MundoOpts): Mundo {
  const mundo = new Mundo(opts);
  onTestFinished(() => {
    for (const s of mundo.servidores.values()) s.room?.dispose();
  });
  return mundo;
}

export type Reaction = Parameters<ServerToClientEvents['game:reaction']>[0];

/** Cliente de teste: uma conexão (um WebSocket) que grava tudo e deixa esperar por condições. */
export class ClienteTeste implements Conexao {
  jogadorId: string | null = null;
  vinculo: string | null = null;
  readonly states: RoomState[] = [];
  readonly views: ViewMessage[] = [];
  readonly reactions: Reaction[] = [];
  /** Ordem de chegada (eventos e respostas), para conferir a sequência. */
  readonly events: string[] = [];
  kicked = 0;
  replaced = 0;
  closed: { code: number; reason: string } | null = null;
  private servidor: SalaServidor | null = null;
  private code: string | null = null;
  private readonly acks = new Map<number, (r: Ack<object>) => void>();
  private seq = 0;
  private readonly viewListeners = new Set<(m: ViewMessage) => void>();
  private readonly waiters = new Set<() => void>();

  constructor(private readonly mundo: Mundo) {}

  // Conexao ---------------------------------------------------------------

  enviar<E extends keyof ServerToClientEvents>(evento: E, ...dados: Parameters<ServerToClientEvents[E]>): void {
    if (this.closed) return;
    const d = dados[0] as unknown;
    if (evento === 'room:state') this.states.push(d as RoomState);
    else if (evento === 'game:view') {
      this.views.push(d as ViewMessage);
      for (const l of [...this.viewListeners]) l(d as ViewMessage);
    } else if (evento === 'game:reaction') this.reactions.push(d as Reaction);
    else if (evento === 'room:kicked') this.kicked += 1;
    else if (evento === 'room:replaced') this.replaced += 1;
    this.events.push(evento);
    this.notify();
  }

  responder(id: number, resposta: Ack<object>): void {
    const fn = this.acks.get(id);
    this.acks.delete(id);
    fn?.(resposta);
  }

  fechar(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = { code, reason };
    const servidor = this.servidor;
    // Como o WebSocket de verdade: o fechamento chega depois, como um evento.
    queueMicrotask(() => servidor?.disconnected(this));
    this.notify();
  }

  vincular(jogadorId: string | null): void {
    this.vinculo = jogadorId;
  }

  // Teste -------------------------------------------------------------------

  get state(): RoomState | undefined {
    return this.states.at(-1);
  }

  get lastView(): ViewMessage | undefined {
    return this.views.at(-1);
  }

  get connected(): boolean {
    return this.closed === null;
  }

  get roomCode(): string | null {
    return this.code;
  }

  seat(playerId: string): SeatPublic | undefined {
    return this.state?.seats.find((s) => s.playerId === playerId);
  }

  /** Depois de uma hibernação simulada: a mesma conexão agora fala com o objeto novo. */
  reattach(servidor: SalaServidor): void {
    this.servidor = servidor;
  }

  private attach(code: string): void {
    if (this.servidor && this.code !== code) {
      // Como o app: entrar em outra sala sai desta e fecha a conexão antiga.
      const old = this.servidor;
      void old.receive(this, JSON.stringify({ e: 'room:leave' }));
      old.disconnected(this);
      this.jogadorId = null;
    }
    this.code = code;
    this.servidor = this.mundo.servidor(code);
  }

  /** Emite com resposta (sem tipos: os testes também mandam lixo de propósito). */
  call<T extends object = object>(event: string, payload?: unknown, opts: { at?: string } = {}): Promise<Ack<T>> {
    if (this.closed) return Promise.reject(new Error(`conexão fechada antes de ${event}`));
    if (opts.at) this.attach(opts.at);
    else if (event === 'room:create') this.attach(this.mundo.novoCodigo());
    else if (event === 'room:join') {
      const raw = (payload as { code?: unknown } | undefined)?.code;
      const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
      if (code && code !== this.code) this.attach(code);
    }
    const servidor = this.servidor;
    if (!servidor) {
      return Promise.resolve({ ok: false, error: { code: 'NOT_IN_ROOM', message: 'Tu não está em nenhuma sala.' } });
    }
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`sem resposta para ${event}`)), 4000);
      this.acks.set(id, (r) => {
        clearTimeout(timer);
        this.events.push(`ack:${event}`);
        resolve(r as Ack<T>);
      });
      void servidor.receive(this, JSON.stringify({ e: event, d: payload, id }));
    });
  }

  /** Emite sem resposta. */
  send(event: string, payload?: unknown): void {
    void this.servidor?.receive(this, JSON.stringify({ e: event, d: payload }));
  }

  /** Texto cru no WebSocket. */
  raw(text: string): Promise<void> {
    return this.servidor?.receive(this, text) ?? Promise.resolve();
  }

  /** A rede caiu (ou a aba fechou). */
  close(): void {
    this.fechar(1006, 'cliente caiu');
  }

  onView(listener: (m: ViewMessage) => void): () => void {
    this.viewListeners.add(listener);
    return () => this.viewListeners.delete(listener);
  }

  waitFor<T>(check: () => T | undefined | null | false, label: string, timeoutMs = 5000): Promise<T> {
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
    return this.waitFor(() => (this.state && pred(this.state) ? this.state : undefined), label, timeoutMs);
  }

  waitForView(pred: (m: ViewMessage) => boolean, label = 'game:view', timeoutMs?: number) {
    const last = () => this.lastView;
    return this.waitFor(() => (last() && pred(last()!) ? last() : undefined), label, timeoutMs);
  }

  private notify(): void {
    for (const waiter of [...this.waiters]) waiter();
  }
}

export function connect(mundo: Mundo): ClienteTeste {
  const client = new ClienteTeste(mundo);
  onTestFinished(() => client.close());
  return client;
}

/** Garante `ok: true` e devolve o resultado tipado. */
export function ok<T extends object>(response: Ack<T>): { ok: true } & T {
  if (!response.ok) throw new Error(`esperava ok, veio ${response.error.code}: ${response.error.message}`);
  return response;
}

export async function createRoom(client: ClienteTeste, name = 'Ana', extra: object = {}): Promise<JoinResult> {
  return ok(await client.call<JoinResult>('room:create', { name, avatar: name.toLowerCase(), ...extra }));
}

export async function joinRoom(
  client: ClienteTeste,
  code: string,
  name: string,
  token?: string,
  extra: object = {},
): Promise<JoinResult> {
  return ok(await client.call<JoinResult>('room:join', { code, name, avatar: name.toLowerCase(), token, ...extra }));
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
export function autoPlay(client: ClienteTeste): { errors: string[]; stop(): void } {
  const errors: string[] = [];
  let lastSeq = -1;
  const stop = client.onView((message) => {
    const v = message.view;
    // Partida nova recomeça o seq (e pode repetir o último em que este jogador agiu).
    if (v.phase === 'gameOver' || v.seq < lastSeq) lastSeq = -1;
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
  });
  return { errors, stop };
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
