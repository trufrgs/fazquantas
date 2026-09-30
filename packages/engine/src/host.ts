import { decideBot, type BotDifficulty } from './bots';
import { card } from './cards';
import { applyAction, createGame, currentActor, legalBids, strengthCtx } from './game';
import { isManilha } from './hierarchy';
import { createRng, type Rng } from './rng';
import type { Rules } from './rules';
import type { Action, ApplyResult, GameState, PlayerAction } from './types';
import { getPlayerView, type PlayerView } from './view';

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Relógio real (navegador ou Node). */
export function systemClock(): Clock {
  const g = globalThis as unknown as {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
    Date: { now(): number };
  };
  return {
    now: () => g.Date.now(),
    setTimeout: (fn, ms) => g.setTimeout(fn, ms),
    clearTimeout: (h) => g.clearTimeout(h),
  };
}

export interface SeatConfig {
  id: string;
  name: string;
  kind: 'human' | 'bot';
  difficulty?: BotDifficulty;
  /** Semente do avatar (só a UI usa). */
  avatar?: string;
}

export interface HostTiming {
  /** Tempo de "pensar" do bot, sorteado no intervalo. */
  botThinkMs: [number, number];
  /** Pausa mostrando a vaza completa antes de recolher. */
  trickPauseMs: number;
  /** Pausa no resumo do fim da rodada (dá tempo de ler o placar). */
  roundPauseMs: number;
  /**
   * Pausa depois da última cantada, antes da primeira carta: a mesa inteira vê quanto cada um
   * cantou (o "pré-flop" da Fodinha).
   */
  bidsRevealMs: number;
  /** Jogada forçada (uma carta só) feita automaticamente. */
  forcedPlayMs: number;
  /** Espera extra no começo de cada rodada (animação de distribuir). */
  dealMs: number;
  /** Jogada automática de quem está desconectado. */
  awayActMs: number;
}

/**
 * A mão com manilha fica mais tempo na mesa (a pausa vezes este fator): é quando a manilha ataca as
 * cartas que ganhou ("Quem mata quem"), e o golpe precisa de tempo para ser visto.
 */
export const MANILHA_PAUSE_FACTOR = 1.7;

export const DEFAULT_TIMING: Readonly<HostTiming> = Object.freeze({
  botThinkMs: [650, 1250] as [number, number],
  trickPauseMs: 1300,
  roundPauseMs: 7500,
  bidsRevealMs: 2600,
  forcedPlayMs: 650,
  dealMs: 900,
  awayActMs: 1200,
});

export const INSTANT_TIMING: Readonly<HostTiming> = Object.freeze({
  botThinkMs: [0, 0] as [number, number],
  trickPauseMs: 0,
  roundPauseMs: 0,
  bidsRevealMs: 0,
  forcedPlayMs: 0,
  dealMs: 0,
  awayActMs: 0,
});

export interface HostOptions {
  seats: SeatConfig[];
  rules?: Partial<Rules>;
  seed: number;
  clock?: Clock;
  timing?: Partial<HostTiming>;
  /** Tempo máximo da vez de um humano; `null` = sem limite. */
  turnTimeoutMs?: number | null;
  /** Humano eliminado passa a ver todas as mãos (modo local). */
  revealToEliminated?: boolean;
  firstDealer?: number;
}

export interface HostSnapshot {
  v: 1;
  seats: SeatConfig[];
  state: GameState;
  rngState: number;
  turnTimeoutMs: number | null;
  revealToEliminated: boolean;
  /** Prazo da vez em curso: restaurar não dá tempo extra a quem estava pensando. */
  turnClock?: { seq: number; playerId: string; deadline: number } | null;
  /** Humanos que o host está jogando por eles (caíram ou estouraram o tempo seguidas vezes). */
  away?: string[];
  /** Tempos estourados seguidos, por jogador. */
  timeouts?: Record<string, number>;
}

/** Tempos estourados seguidos até o jogador ser dado como ausente (o host joga por ele). */
export const TIMEOUTS_UNTIL_AWAY = 2;

export interface HostEvent {
  state: GameState;
  /** Ação que gerou a mudança (`null` no início ou em mudanças de assento). */
  action: Action | null;
  /** Feita automaticamente (bot, tempo esgotado, desconectado, jogada forçada, pausa). */
  auto: boolean;
  /** Por que a jogada foi automática (`null` quando foi de um humano ou não houve jogada). */
  reason: AutoReason | null;
}

/**
 * - `bot`: decisão de um bot; `forced`: só havia uma carta; `timeout`: acabou o tempo do humano;
 * - `away`: o humano está desconectado; `system`: avanço de fim de vaza/rodada.
 */
export type AutoReason = 'bot' | 'forced' | 'timeout' | 'away' | 'system';

interface Seat extends SeatConfig {
  away: boolean;
}

export class GameHost {
  private current: GameState;
  private readonly seatMap = new Map<string, Seat>();
  private readonly listeners = new Set<(e: HostEvent) => void>();
  private readonly clock: Clock;
  private readonly timing: HostTiming;
  private readonly turnTimeoutMs: number | null;
  private readonly revealToEliminated: boolean;
  private rng: Rng;
  private timer: unknown = null;
  private deadlineAt: number | null = null;
  /** Relógio da vez atual; só reinicia quando a vez muda (cair e voltar não ganha tempo). */
  private turnClock: { seq: number; playerId: string; deadline: number } | null = null;
  private speed = 1;
  /** Tempos estourados seguidos, por jogador (zera quando ele joga). */
  private readonly timeouts = new Map<string, number>();
  private paused = false;
  private started = false;
  private disposed = false;

  constructor(opts: HostOptions, restored?: { state: GameState; rngState: number }) {
    this.clock = opts.clock ?? systemClock();
    this.timing = { ...DEFAULT_TIMING, ...opts.timing };
    this.turnTimeoutMs = opts.turnTimeoutMs ?? null;
    this.revealToEliminated = opts.revealToEliminated ?? false;
    for (const s of opts.seats) this.seatMap.set(s.id, { ...s, away: false });
    this.current =
      restored?.state ??
      createGame({
        players: opts.seats.map((s) => ({ id: s.id, name: s.name })),
        rules: opts.rules,
        seed: opts.seed,
        firstDealer: opts.firstDealer,
      });
    this.rng = createRng(restored?.rngState ?? (opts.seed ^ 0x5bd1e995) >>> 0);
  }

  static restore(snapshot: HostSnapshot, opts: Partial<HostOptions> = {}): GameHost {
    const host = new GameHost(
      {
        ...opts,
        seats: snapshot.seats,
        seed: 0,
        turnTimeoutMs: snapshot.turnTimeoutMs,
        revealToEliminated: snapshot.revealToEliminated,
      },
      { state: structuredClone(snapshot.state), rngState: snapshot.rngState },
    );
    host.turnClock = snapshot.turnClock ? { ...snapshot.turnClock } : null;
    for (const id of snapshot.away ?? []) {
      const seat = host.seatMap.get(id);
      if (seat) seat.away = true;
    }
    for (const [id, n] of Object.entries(snapshot.timeouts ?? {})) host.timeouts.set(id, n);
    return host;
  }

  get state(): GameState {
    return this.current;
  }

  get seats(): SeatConfig[] {
    return [...this.seatMap.values()].map(({ away: _away, ...seat }) => seat);
  }

  get deadline(): number | null {
    return this.deadlineAt;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  isAway(playerId: string): boolean {
    return this.seatMap.get(playerId)?.away ?? false;
  }

  /** Humanos que o host está jogando por eles agora. */
  awayPlayers(): string[] {
    return [...this.seatMap.values()].filter((s) => s.kind === 'human' && s.away).map((s) => s.id);
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.scheduleNext(this.newRoundJustDealt() ? this.timing.dealMs : 0);
    this.emit(null, null);
  }

  view(playerId: string | null): PlayerView {
    const player = playerId ? this.current.players.find((p) => p.id === playerId) : undefined;
    const revealAll =
      this.revealToEliminated && player !== undefined && player.eliminatedRound !== null;
    return getPlayerView(this.current, playerId, { revealAll, turnDeadline: this.deadlineAt });
  }

  /** Ação de um humano. Bots e ações de sistema não entram por aqui. */
  act(playerId: string, action: PlayerAction): ApplyResult {
    const seat = this.seatMap.get(playerId);
    if (!seat || seat.kind !== 'human' || this.disposed) {
      return { ok: false, error: { code: 'INVALID_ACTION', message: 'Ação inválida.' } };
    }
    // Quem age está presente: para de jogar por ele e zera os tempos estourados.
    const wasAway = seat.away;
    seat.away = false;
    this.timeouts.delete(playerId);
    const result = this.apply({ ...action, playerId } as PlayerAction, null);
    if (!result.ok && wasAway && currentActor(this.current)?.playerId === playerId) {
      // Voltou, mas a jogada não valeu: a vez segue com o relógio normal, não com o automático.
      this.scheduleNext();
      this.emit(null, null);
    }
    return result;
  }

  subscribe(listener: (e: HostEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Marca um humano como desconectado (o host joga por ele) ou de volta. */
  setAway(playerId: string, away: boolean): void {
    const seat = this.seatMap.get(playerId);
    if (!away) this.timeouts.delete(playerId);
    if (!seat || seat.away === away) return;
    seat.away = away;
    if (currentActor(this.current)?.playerId === playerId) {
      this.scheduleNext();
      this.emit(null, null);
    }
  }

  /** Troca um assento para bot (quem saiu de vez) ou de volta para humano. */
  setSeatKind(playerId: string, kind: 'human' | 'bot', difficulty: BotDifficulty = 'medio'): void {
    const seat = this.seatMap.get(playerId);
    if (!seat) return;
    seat.kind = kind;
    seat.difficulty = kind === 'bot' ? difficulty : seat.difficulty;
    if (currentActor(this.current)?.playerId === playerId) {
      this.scheduleNext();
      this.emit(null, null);
    }
  }

  setSpeed(multiplier: number): void {
    const antes = this.speed;
    this.speed = Math.max(0.05, multiplier);
    // Mudou o ritmo com uma espera em curso (bot pensando, pausa do fim da mão ou da rodada): ela
    // recomeça no ritmo novo, na hora ("acelerar até o fim" não espera o resumo da rodada acabar).
    if (this.speed !== antes && this.timer !== null) this.scheduleNext();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.clearTimer();
    this.deadlineAt = null;
    this.turnClock = null;
    this.emit(null, null);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.scheduleNext();
    this.emit(null, null);
  }

  /** Pula a pausa de fim de vaza/rodada. */
  skipPause(): void {
    if (this.paused || this.disposed) return;
    if (this.current.phase === 'trickEnd' || this.current.phase === 'roundEnd') this.advance();
  }

  snapshot(): HostSnapshot {
    return {
      v: 1,
      seats: this.seats,
      state: structuredClone(this.current),
      rngState: this.rng.state,
      turnTimeoutMs: this.turnTimeoutMs,
      revealToEliminated: this.revealToEliminated,
      turnClock: this.turnClock ? { ...this.turnClock } : null,
      away: this.awayPlayers(),
      timeouts: Object.fromEntries(this.timeouts),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  // -------------------------------------------------------------------------

  private apply(action: Action, reason: AutoReason | null): ApplyResult {
    const before = this.current.phase;
    const result = applyAction(this.current, action);
    if (!result.ok) return result;
    this.current = result.state;
    const newRound = before === 'roundEnd' && this.current.phase === 'bidding';
    // Todo mundo cantou: um respiro para a mesa ver as cantadas antes da primeira carta.
    const bidsDone = before === 'bidding' && this.current.phase === 'playing';
    this.scheduleNext(newRound ? this.timing.dealMs : bidsDone ? this.timing.bidsRevealMs : 0);
    this.emit(action, reason);
    return result;
  }

  private advance(): void {
    this.apply({ type: 'continue' }, 'system');
  }

  private autoAct(playerId: string, difficulty: BotDifficulty, reason: AutoReason): void {
    const state = this.current;
    const actor = currentActor(state);
    if (!actor || actor.playerId !== playerId) return;
    if (reason === 'timeout') {
      // Estourou o tempo de novo: dá como ausente e passa a jogar por ele sem esperar o prazo.
      const n = (this.timeouts.get(playerId) ?? 0) + 1;
      this.timeouts.set(playerId, n);
      const seat = this.seatMap.get(playerId);
      if (seat && n >= TIMEOUTS_UNTIL_AWAY) seat.away = true;
    }
    let action = decideBot(getPlayerView(state, playerId), difficulty, this.rng);
    if (!action) {
      // Rodada às cegas: o dono não vê a carta, mas a jogada é forçada.
      action =
        actor.kind === 'play'
          ? { type: 'play', playerId, cardId: state.round.hands[playerId]![0]! }
          : { type: 'bid', playerId, value: legalBids(state, playerId)[0] ?? 0 };
    }
    this.apply(action, reason);
  }

  private scaled(ms: number): number {
    return ms / this.speed;
  }

  private newRoundJustDealt(): boolean {
    const r = this.current.round;
    return this.current.phase === 'bidding' && r.bidTurn === 0;
  }

  private scheduleNext(extraMs = 0): void {
    this.clearTimer();
    this.deadlineAt = null;
    if (!this.started || this.paused || this.disposed) return;
    const s = this.current;
    if (s.phase === 'gameOver') return;
    if (s.phase === 'trickEnd') {
      const ctx = strengthCtx(s);
      const comManilha = s.round.completedTricks.at(-1)?.plays.some((p) => isManilha(card(p.cardId), ctx)) ?? false;
      this.after(this.scaled(this.timing.trickPauseMs * (comManilha ? MANILHA_PAUSE_FACTOR : 1) + extraMs), () => this.advance());
      return;
    }
    if (s.phase === 'roundEnd') {
      this.after(this.scaled(this.timing.roundPauseMs + extraMs), () => this.advance());
      return;
    }
    const actor = currentActor(s);
    if (!actor) return;
    const seat = this.seatMap.get(actor.playerId);
    if (!seat) return;
    const forced = actor.kind === 'play' && (s.round.hands[actor.playerId]?.length ?? 0) <= 1;
    const act = (difficulty: BotDifficulty, reason: AutoReason) => () =>
      this.autoAct(actor.playerId, difficulty, reason);

    if (seat.kind === 'bot') {
      const [lo, hi] = this.timing.botThinkMs;
      const think = forced ? this.timing.forcedPlayMs : lo + this.rng.next() * (hi - lo);
      this.after(this.scaled(think + extraMs), act(seat.difficulty ?? 'medio', forced ? 'forced' : 'bot'));
      return;
    }
    if (forced) {
      this.after(this.scaled(this.timing.forcedPlayMs + extraMs), act('medio', 'forced'));
      return;
    }
    if (seat.away) {
      this.after(this.scaled(this.timing.awayActMs + extraMs), act('medio', 'away'));
      return;
    }
    if (this.turnTimeoutMs !== null) {
      // Mesma vez de antes (ex.: o jogador caiu e voltou): o relógio continua de onde estava.
      const clock = this.turnClock;
      const sameTurn = clock !== null && clock.seq === s.seq && clock.playerId === actor.playerId;
      const deadline = sameTurn ? clock.deadline : this.clock.now() + this.turnTimeoutMs + this.scaled(extraMs);
      this.turnClock = { seq: s.seq, playerId: actor.playerId, deadline };
      this.deadlineAt = deadline;
      this.after(Math.max(0, deadline - this.clock.now()), act('medio', 'timeout'));
    }
  }

  private after(ms: number, fn: () => void): void {
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      if (!this.disposed && !this.paused) fn();
    }, Math.max(0, ms));
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(action: Action | null, reason: AutoReason | null): void {
    const event: HostEvent = { state: this.current, action, auto: reason !== null, reason };
    for (const listener of [...this.listeners]) listener(event);
  }
}
