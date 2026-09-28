import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_RULES,
  DEFAULT_TURN_TIMEOUT_SEC,
  GameHost,
  ROOM_CAPACITY,
  createRng,
  normalizeRules,
  pickBotNames,
  randomSeed,
  type BotDifficulty,
  type ClientAction,
  type Clock,
  type HostEvent,
  type HostTiming,
  type JoinResult,
  type ReactionId,
  type RoomState,
  type RoomStatus,
  type Rules,
  type SeatConfig,
  type SeatPublic,
  type ViewMessage,
} from '@fodinha/engine';
import { fail, MESSAGES } from './errors';
import type { Logger } from './logger';
import type { FodinhaIO, FodinhaSocket } from './types';

/** No máximo uma reação por jogador a cada 1,5 s. */
export const REACTION_INTERVAL_MS = 1500;
const AVATAR_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export interface RoomDeps {
  io: FodinhaIO;
  now(): number;
  random(): number;
  clock: Clock;
  timing?: Partial<HostTiming>;
  lobbyGraceMs: number;
  logger: Logger;
  /** Não sobrou nenhum humano: a sala deve sumir. */
  onEmpty(room: Room): void;
}

export interface Profile {
  name: string;
  /** Vazio = o servidor sorteia um. */
  avatar: string;
}

export interface RoomUpdate {
  rules?: Partial<Rules>;
  turnTimeoutSec?: number | null;
}

interface HumanSeat {
  kind: 'human';
  playerId: string;
  name: string;
  avatar: string;
  /** Segredo para reconectar no mesmo assento. */
  token: string;
  /** Socket ativo; `null` = desconectado. */
  socket: FodinhaSocket | null;
  /** Prazo para voltar antes de perder o assento (fora da partida). */
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface BotSeat {
  kind: 'bot';
  playerId: string;
  name: string;
  avatar: string;
  difficulty: BotDifficulty;
}

type Seat = HumanSeat | BotSeat;

function newToken(): string {
  return randomBytes(16).toString('base64url');
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Uma sala: assentos na ordem de jogo, anfitrião, regras e a partida (`GameHost`).
 *
 * Mudanças de lobby/conexão marcam o estado como sujo; o envio (`room:state` para cada membro e
 * as visões pendentes) sai num microtask, depois do ack de quem pediu a mudança.
 */
export class Room {
  private readonly seats: Seat[] = [];
  private hostPlayerId = '';
  private currentStatus: RoomStatus = 'lobby';
  private rules: Rules = normalizeRules(DEFAULT_RULES);
  private turnTimeoutSec: number | null = DEFAULT_TURN_TIMEOUT_SEC;
  private gameHost: GameHost | null = null;
  private unsubscribeGame: (() => void) | null = null;
  private idleSinceMs: number | null = null;
  private readonly lastReactionAt = new Map<string, number>();
  private stateDirty = false;
  private outbox: { playerId: string; message: ViewMessage }[] = [];
  private flushQueued = false;
  private disposed = false;

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
  ) {}

  // ---------------------------------------------------------------------------
  // Consultas

  get status(): RoomStatus {
    return this.currentStatus;
  }

  get hostId(): string {
    return this.hostPlayerId;
  }

  /** Partida atual (ou a última, depois do fim); `null` no lobby. */
  get game(): GameHost | null {
    return this.gameHost;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get seatCount(): number {
    return this.seats.length;
  }

  /** Desde quando não há nenhum humano conectado (`null` se há alguém). */
  get idleSince(): number | null {
    return this.idleSinceMs;
  }

  publicSeats(): SeatPublic[] {
    return this.seats.map((seat) =>
      seat.kind === 'human'
        ? {
            kind: 'human',
            playerId: seat.playerId,
            name: seat.name,
            avatar: seat.avatar,
            connected: seat.socket !== null,
          }
        : {
            kind: 'bot',
            playerId: seat.playerId,
            name: seat.name,
            avatar: seat.avatar,
            difficulty: seat.difficulty,
          },
    );
  }

  stateFor(youId: string): RoomState {
    return {
      code: this.code,
      status: this.currentStatus,
      seats: this.publicSeats(),
      hostId: this.hostPlayerId,
      youId,
      rules: { ...this.rules },
      turnTimeoutSec: this.turnTimeoutSec,
      capacity: ROOM_CAPACITY,
    };
  }

  /** O socket está sentado neste assento humano. */
  isBound(playerId: string, socket: FodinhaSocket): boolean {
    return this.human(playerId)?.socket === socket;
  }

  hasHuman(playerId: string): boolean {
    return this.human(playerId) !== undefined;
  }

  playerIdForToken(token: string): string | null {
    return this.humans().find((seat) => sameSecret(seat.token, token))?.playerId ?? null;
  }

  // ---------------------------------------------------------------------------
  // Entrar, reconectar, sair

  /** Lança se não dá para entrar num assento novo agora. */
  assertCanJoin(): void {
    if (this.currentStatus !== 'lobby') throw fail('GAME_IN_PROGRESS', MESSAGES.joinInProgress);
    if (this.seats.length >= ROOM_CAPACITY) throw fail('ROOM_FULL', MESSAGES.roomFull);
  }

  addHuman(socket: FodinhaSocket, profile: Profile): JoinResult {
    this.assertCanJoin();
    const seat: HumanSeat = {
      kind: 'human',
      playerId: this.newPlayerId(),
      name: profile.name,
      avatar: profile.avatar || this.randomAvatar(),
      token: newToken(),
      socket: null,
      graceTimer: null,
    };
    this.seats.push(seat);
    this.bind(seat, socket);
    if (!this.hostPlayerId) this.hostPlayerId = seat.playerId;
    this.touch();
    return { code: this.code, playerId: seat.playerId, token: seat.token };
  }

  /** Volta ao mesmo assento (token válido). Derruba o socket antigo, se ainda existir. */
  reconnect(playerId: string, socket: FodinhaSocket, profile: Profile): JoinResult {
    const seat = this.human(playerId);
    if (!seat) throw fail('NOT_IN_ROOM', MESSAGES.notInRoom);
    const old = seat.socket;
    if (old && old !== socket) {
      this.unbind(seat);
      // Desconexão de namespace ("io server disconnect"): o socket.io-client não tenta
      // reconectar sozinho, então duas abas não ficam roubando o assento uma da outra.
      old.disconnect();
    }
    this.clearGrace(seat);
    // Durante a partida o nome já está no estado do jogo; só muda fora dela.
    if (this.currentStatus !== 'playing') {
      seat.name = profile.name;
      if (profile.avatar) seat.avatar = profile.avatar;
    }
    this.bind(seat, socket);
    if (this.currentStatus === 'playing') this.gameHost?.setAway(playerId, false);
    this.touch();
    this.queueView(playerId);
    return { code: this.code, playerId: seat.playerId, token: seat.token };
  }

  /** O socket caiu (não é saída explícita). */
  handleDisconnect(socket: FodinhaSocket): void {
    const playerId = socket.data.playerId;
    const seat = playerId ? this.human(playerId) : undefined;
    if (!seat || seat.socket !== socket) return;
    seat.socket = null;
    if (this.currentStatus === 'playing') this.gameHost?.setAway(seat.playerId, true);
    else this.startGrace(seat);
    this.touch();
  }

  /** Saída explícita: no lobby libera o assento; na partida vira bot médio; depois do fim, sai. */
  leave(playerId: string): void {
    const index = this.indexOf(playerId);
    const seat = this.seats[index];
    if (!seat || seat.kind !== 'human') return;
    if (this.currentStatus === 'playing') this.replaceWithBot(index, seat);
    else this.removeAt(index);
  }

  // ---------------------------------------------------------------------------
  // Ações do anfitrião

  update(requesterId: string, patch: RoomUpdate): void {
    this.assertHost(requesterId);
    this.assertEditable();
    if (patch.rules) this.rules = normalizeRules({ ...this.rules, ...patch.rules });
    if (patch.turnTimeoutSec !== undefined) this.turnTimeoutSec = patch.turnTimeoutSec;
    this.touch();
  }

  addBot(requesterId: string, difficulty: BotDifficulty): void {
    this.assertHost(requesterId);
    this.assertEditable();
    if (this.seats.length >= ROOM_CAPACITY) throw fail('ROOM_FULL', MESSAGES.roomFull);
    const rng = createRng(randomSeed(this.deps.random));
    const [name] = pickBotNames(
      1,
      this.seats.map((seat) => seat.name),
      rng,
    );
    this.seats.push({
      kind: 'bot',
      playerId: this.newPlayerId(),
      name: name ?? 'Bot',
      avatar: this.randomAvatar(),
      difficulty,
    });
    this.touch();
  }

  setBot(requesterId: string, playerId: string, difficulty: BotDifficulty): void {
    this.assertHost(requesterId);
    const seat = this.seats[this.indexOf(playerId)];
    if (!seat) throw fail('INVALID_PAYLOAD', MESSAGES.seatGone);
    if (seat.kind !== 'bot') throw fail('INVALID_PAYLOAD', MESSAGES.notBot);
    seat.difficulty = difficulty;
    if (this.currentStatus === 'playing') this.gameHost?.setSeatKind(playerId, 'bot', difficulty);
    this.touch();
  }

  /** Remove um bot ou expulsa um humano (na partida, o assento dele vira bot médio). */
  removeSeat(requesterId: string, playerId: string): void {
    this.assertHost(requesterId);
    if (playerId === requesterId) throw fail('INVALID_PAYLOAD', MESSAGES.kickSelf);
    const index = this.indexOf(playerId);
    const seat = this.seats[index];
    if (!seat) throw fail('INVALID_PAYLOAD', MESSAGES.seatGone);
    if (seat.kind === 'bot') {
      if (this.currentStatus === 'playing') throw fail('GAME_IN_PROGRESS', MESSAGES.botInGame);
      this.removeAt(index);
      return;
    }
    const socket = seat.socket;
    if (this.currentStatus === 'playing') this.replaceWithBot(index, seat);
    else this.removeAt(index);
    socket?.emit('room:kicked');
  }

  start(requesterId: string): void {
    this.assertHost(requesterId);
    if (this.currentStatus === 'playing') throw fail('GAME_IN_PROGRESS', MESSAGES.alreadyPlaying);
    if (this.seats.length < 2) throw fail('NOT_ENOUGH_PLAYERS', MESSAGES.notEnoughPlayers);
    this.startGame();
  }

  /** Nova partida imediata com os mesmos assentos (no lobby, equivale a começar). */
  rematch(requesterId: string): void {
    this.start(requesterId);
  }

  /** Depois do fim de jogo, volta para o lobby: dá para trocar assentos, regras e chamar gente. */
  backToLobby(requesterId: string): void {
    this.assertHost(requesterId);
    if (this.currentStatus === 'playing') throw fail('GAME_IN_PROGRESS', MESSAGES.alreadyPlaying);
    if (this.currentStatus === 'lobby') return;
    this.disposeGame();
    this.currentStatus = 'lobby';
    this.touch();
  }

  // ---------------------------------------------------------------------------
  // Partida

  act(playerId: string, action: ClientAction): void {
    const game = this.gameHost;
    if (!game || this.currentStatus === 'lobby') throw fail('GAME_ERROR', MESSAGES.noGame);
    const result = game.act(playerId, { ...action, playerId });
    if (!result.ok) throw fail('GAME_ERROR', result.error.message);
  }

  react(playerId: string, reaction: ReactionId): void {
    const at = this.deps.now();
    const last = this.lastReactionAt.get(playerId);
    if (last !== undefined && at - last < REACTION_INTERVAL_MS) return; // excesso: ignora em silêncio
    this.lastReactionAt.set(playerId, at);
    this.deps.io.to(this.code).emit('game:reaction', { playerId, reaction, at });
  }

  // ---------------------------------------------------------------------------
  // Ciclo de vida

  isIdleFor(ms: number, now: number): boolean {
    return this.idleSinceMs !== null && now - this.idleSinceMs >= ms;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeGame();
    for (const seat of this.humans()) {
      this.clearGrace(seat);
      this.unbind(seat);
    }
    this.outbox = [];
  }

  // ---------------------------------------------------------------------------
  // Internos

  private humans(): HumanSeat[] {
    return this.seats.filter((seat): seat is HumanSeat => seat.kind === 'human');
  }

  private human(playerId: string): HumanSeat | undefined {
    const seat = this.seats.find((s) => s.playerId === playerId);
    return seat?.kind === 'human' ? seat : undefined;
  }

  private indexOf(playerId: string): number {
    return this.seats.findIndex((seat) => seat.playerId === playerId);
  }

  private assertHost(playerId: string): void {
    if (playerId !== this.hostPlayerId) throw fail('NOT_HOST', MESSAGES.notHost);
  }

  private assertEditable(): void {
    if (this.currentStatus === 'playing') throw fail('GAME_IN_PROGRESS', MESSAGES.locked);
  }

  private newPlayerId(): string {
    for (;;) {
      const id = randomBytes(6).toString('base64url');
      if (this.indexOf(id) === -1) return id;
    }
  }

  private randomAvatar(): string {
    let seed = '';
    for (let i = 0; i < 10; i++) {
      seed += AVATAR_ALPHABET[Math.floor(this.deps.random() * AVATAR_ALPHABET.length)] ?? 'a';
    }
    return seed;
  }

  private bind(seat: HumanSeat, socket: FodinhaSocket): void {
    seat.socket = socket;
    socket.data.roomCode = this.code;
    socket.data.playerId = seat.playerId;
    void socket.join(this.code);
  }

  private unbind(seat: HumanSeat): void {
    const socket = seat.socket;
    if (!socket) return;
    seat.socket = null;
    if (socket.data.roomCode === this.code && socket.data.playerId === seat.playerId) {
      socket.data.roomCode = null;
      socket.data.playerId = null;
    }
    void socket.leave(this.code);
  }

  private startGrace(seat: HumanSeat): void {
    this.clearGrace(seat);
    const timer = setTimeout(() => {
      seat.graceTimer = null;
      this.onGraceExpired(seat.playerId);
    }, this.deps.lobbyGraceMs);
    timer.unref();
    seat.graceTimer = timer;
  }

  private clearGrace(seat: HumanSeat): void {
    if (seat.graceTimer === null) return;
    clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
  }

  private onGraceExpired(playerId: string): void {
    if (this.disposed || this.currentStatus === 'playing') return; // na partida o assento fica
    const index = this.indexOf(playerId);
    const seat = this.seats[index];
    if (seat?.kind !== 'human' || seat.socket) return;
    this.deps.logger.info(`[${this.code}] ${seat.name} não voltou a tempo e perdeu o assento.`);
    this.removeAt(index);
  }

  private removeAt(index: number): void {
    const [seat] = this.seats.splice(index, 1);
    if (!seat) return;
    this.lastReactionAt.delete(seat.playerId);
    if (seat.kind === 'human') {
      this.clearGrace(seat);
      this.unbind(seat);
    }
    if (seat.playerId === this.hostPlayerId) this.passCrown(index);
    this.afterSeatChange();
  }

  private replaceWithBot(index: number, seat: HumanSeat): void {
    this.clearGrace(seat);
    this.unbind(seat);
    this.seats[index] = {
      kind: 'bot',
      playerId: seat.playerId,
      name: seat.name,
      avatar: seat.avatar,
      difficulty: 'medio',
    };
    this.gameHost?.setSeatKind(seat.playerId, 'bot', 'medio');
    if (seat.playerId === this.hostPlayerId) this.passCrown(index + 1);
    this.afterSeatChange();
  }

  /** Coroa para o próximo humano na ordem dos assentos, de preferência conectado. */
  private passCrown(fromIndex: number): void {
    const n = this.seats.length;
    let fallback: HumanSeat | undefined;
    for (let k = 0; k < n; k++) {
      const seat = this.seats[(fromIndex + k) % n];
      if (seat?.kind !== 'human') continue;
      if (seat.socket) {
        this.hostPlayerId = seat.playerId;
        return;
      }
      fallback ??= seat;
    }
    if (fallback) this.hostPlayerId = fallback.playerId;
  }

  private afterSeatChange(): void {
    this.markDirty();
    if (this.humans().length === 0) {
      this.deps.onEmpty(this);
      return;
    }
    this.refreshIdle();
  }

  private startGame(): void {
    const seats: SeatConfig[] = this.seats.map((seat) =>
      seat.kind === 'human'
        ? { id: seat.playerId, name: seat.name, kind: 'human', avatar: seat.avatar }
        : {
            id: seat.playerId,
            name: seat.name,
            kind: 'bot',
            difficulty: seat.difficulty,
            avatar: seat.avatar,
          },
    );
    let game: GameHost;
    try {
      game = new GameHost({
        seats,
        rules: this.rules,
        seed: randomSeed(this.deps.random),
        clock: this.deps.clock,
        timing: this.deps.timing,
        turnTimeoutMs: this.turnTimeoutSec === null ? null : this.turnTimeoutSec * 1000,
      });
    } catch (error) {
      throw fail('GAME_ERROR', error instanceof Error ? error.message : MESSAGES.internal);
    }
    this.disposeGame();
    for (const seat of this.humans()) {
      this.clearGrace(seat); // na partida, quem caiu fica com o assento (o host joga por ele)
      if (!seat.socket) game.setAway(seat.playerId, true);
    }
    this.gameHost = game;
    this.currentStatus = 'playing';
    this.unsubscribeGame = game.subscribe((event) => this.onGameEvent(game, event));
    game.start();
    this.touch();
  }

  private onGameEvent(game: GameHost, event: HostEvent): void {
    // Roda dentro do GameHost (inclusive em timers): nunca pode lançar.
    try {
      if (game !== this.gameHost || this.disposed) return;
      const action = event.action;
      const actorId = action && 'playerId' in action ? action.playerId : null;
      for (const seat of this.humans()) {
        if (!seat.socket) continue;
        this.outbox.push({
          playerId: seat.playerId,
          message: { view: game.view(seat.playerId), auto: event.auto, actorId },
        });
      }
      if (event.state.phase === 'gameOver' && this.currentStatus === 'playing') this.finishGame();
      this.queueFlush();
    } catch (error) {
      this.deps.logger.error(`[${this.code}] erro ao repassar evento da partida`, error);
    }
  }

  private finishGame(): void {
    this.currentStatus = 'finished';
    // Fora da partida, quem continua desconectado volta a ter prazo para voltar.
    for (const seat of this.humans()) if (!seat.socket) this.startGrace(seat);
    this.markDirty();
  }

  private disposeGame(): void {
    this.unsubscribeGame?.();
    this.unsubscribeGame = null;
    this.gameHost?.dispose();
    this.gameHost = null;
  }

  /** Sem humano conectado, a partida pausa (ninguém assiste) e a contagem de ociosidade começa. */
  private refreshIdle(): void {
    if (this.disposed) return;
    const game = this.currentStatus === 'playing' ? this.gameHost : null;
    if (this.humans().some((seat) => seat.socket !== null)) {
      this.idleSinceMs = null;
      if (game?.isPaused) game.resume();
    } else {
      this.idleSinceMs ??= this.deps.now();
      if (game && !game.isPaused) game.pause();
    }
  }

  private touch(): void {
    this.markDirty();
    this.refreshIdle();
  }

  private queueView(playerId: string): void {
    const game = this.gameHost;
    if (!game) return;
    this.outbox.push({
      playerId,
      message: { view: game.view(playerId), auto: false, actorId: null },
    });
    this.queueFlush();
  }

  private markDirty(): void {
    this.stateDirty = true;
    this.queueFlush();
  }

  private queueFlush(): void {
    if (this.flushQueued || this.disposed) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      try {
        this.flush();
      } catch (error) {
        this.deps.logger.error(`[${this.code}] erro ao enviar estado da sala`, error);
      }
    });
  }

  private flush(): void {
    this.flushQueued = false;
    if (this.disposed) return;
    if (this.stateDirty) {
      this.stateDirty = false;
      for (const seat of this.humans())
        seat.socket?.emit('room:state', this.stateFor(seat.playerId));
    }
    const pending = this.outbox;
    this.outbox = [];
    for (const { playerId, message } of pending) {
      this.human(playerId)?.socket?.emit('game:view', message);
    }
  }
}
