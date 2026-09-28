import { decideBot, type BotDifficulty } from './bots';
import { applyAction, createGame, currentActor, legalBids } from './game';
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
  /** Pausa no resumo do fim da rodada. */
  roundPauseMs: number;
  /** Jogada forçada (uma carta só) feita automaticamente. */
  forcedPlayMs: number;
  /** Espera extra no começo de cada rodada (animação de distribuir). */
  dealMs: number;
  /** Jogada automática de quem está desconectado. */
  awayActMs: number;
}

export const DEFAULT_TIMING: Readonly<HostTiming> = Object.freeze({
  botThinkMs: [650, 1250] as [number, number],
  trickPauseMs: 1300,
  roundPauseMs: 4500,
  forcedPlayMs: 650,
  dealMs: 900,
  awayActMs: 1200,
});

export const INSTANT_TIMING: Readonly<HostTiming> = Object.freeze({
  botThinkMs: [0, 0] as [number, number],
  trickPauseMs: 0,
  roundPauseMs: 0,
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
}

export interface HostEvent {
  state: GameState;
  /** Ação que gerou a mudança (`null` no início ou em mudanças de assento). */
  action: Action | null;
  /** Feita automaticamente (bot, tempo esgotado, desconectado, jogada forçada, pausa). */
  auto: boolean;
}

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
  private speed = 1;
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
    return new GameHost(
      {
        ...opts,
        seats: snapshot.seats,
        seed: 0,
        turnTimeoutMs: snapshot.turnTimeoutMs,
        revealToEliminated: snapshot.revealToEliminated,
      },
      { state: structuredClone(snapshot.state), rngState: snapshot.rngState },
    );
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

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.scheduleNext(this.newRoundJustDealt() ? this.timing.dealMs : 0);
    this.emit(null, false);
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
    return this.apply({ ...action, playerId } as PlayerAction, false);
  }

  subscribe(listener: (e: HostEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Marca um humano como desconectado (o host joga por ele) ou de volta. */
  setAway(playerId: string, away: boolean): void {
    const seat = this.seatMap.get(playerId);
    if (!seat || seat.away === away) return;
    seat.away = away;
    if (currentActor(this.current)?.playerId === playerId) {
      this.scheduleNext();
      this.emit(null, false);
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
      this.emit(null, false);
    }
  }

  setSpeed(multiplier: number): void {
    this.speed = Math.max(0.05, multiplier);
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.clearTimer();
    this.deadlineAt = null;
    this.emit(null, false);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.scheduleNext();
    this.emit(null, false);
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
    };
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  // -------------------------------------------------------------------------

  private apply(action: Action, auto: boolean): ApplyResult {
    const before = this.current.phase;
    const result = applyAction(this.current, action);
    if (!result.ok) return result;
    this.current = result.state;
    const newRound = before === 'roundEnd' && this.current.phase === 'bidding';
    this.scheduleNext(newRound ? this.timing.dealMs : 0);
    this.emit(action, auto);
    return result;
  }

  private advance(): void {
    this.apply({ type: 'continue' }, true);
  }

  private autoAct(playerId: string, difficulty: BotDifficulty): void {
    const state = this.current;
    const actor = currentActor(state);
    if (!actor || actor.playerId !== playerId) return;
    let action = decideBot(getPlayerView(state, playerId), difficulty, this.rng);
    if (!action) {
      // Rodada às cegas: o dono não vê a carta, mas a jogada é forçada.
      action =
        actor.kind === 'play'
          ? { type: 'play', playerId, cardId: state.round.hands[playerId]![0]! }
          : { type: 'bid', playerId, value: legalBids(state, playerId)[0] ?? 0 };
    }
    this.apply(action, true);
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
      this.after(this.scaled(this.timing.trickPauseMs + extraMs), () => this.advance());
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
    const act = (difficulty: BotDifficulty) => () => this.autoAct(actor.playerId, difficulty);

    if (seat.kind === 'bot') {
      const [lo, hi] = this.timing.botThinkMs;
      const think = forced ? this.timing.forcedPlayMs : lo + this.rng.next() * (hi - lo);
      this.after(this.scaled(think + extraMs), act(seat.difficulty ?? 'medio'));
      return;
    }
    if (forced) {
      this.after(this.scaled(this.timing.forcedPlayMs + extraMs), act('medio'));
      return;
    }
    if (seat.away) {
      this.after(this.scaled(this.timing.awayActMs + extraMs), act('medio'));
      return;
    }
    if (this.turnTimeoutMs !== null) {
      const ms = this.turnTimeoutMs + this.scaled(extraMs);
      this.deadlineAt = this.clock.now() + ms;
      this.after(ms, act('medio'));
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

  private emit(action: Action | null, auto: boolean): void {
    const event: HostEvent = { state: this.current, action, auto };
    for (const listener of [...this.listeners]) listener(event);
  }
}
