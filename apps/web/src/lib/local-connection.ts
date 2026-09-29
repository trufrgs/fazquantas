import {
  createRng,
  GameHost,
  pickBotNames,
  randomSeed,
  REACTIONS,
  type BotDifficulty,
  type ClientAction,
  type HostEvent,
  type HostSnapshot,
  type ReactionId,
  type Rules,
  type SeatConfig,
} from '@fodinha/engine';
import { randomAvatarSeed } from './avatar';
import type { GameConnection, ReactionEvent, SeatInfo, ViewUpdate } from './connection';
import { storage } from './storage';

export const LOCAL_SAVE_KEY = 'fodinha:partida-local';
export const YOU = 'eu';

interface SavedGame {
  v: 1;
  snapshot: HostSnapshot;
  savedAt: number;
}

export interface LocalGameOptions {
  name: string;
  avatar: string;
  players: number;
  difficulty: BotDifficulty;
  rules: Rules;
  speed: number;
}

export function hasSavedGame(): boolean {
  const saved = storage.get<SavedGame>(LOCAL_SAVE_KEY);
  return saved?.v === 1 && saved.snapshot.state.phase !== 'gameOver';
}

export function clearSavedGame(): void {
  storage.remove(LOCAL_SAVE_KEY);
}

/** Resumo da partida salva para botões e avisos ("Rodada 4 · 3 na mesa"). */
export function savedGameSummary(): string | null {
  const s = storage.get<SavedGame>(LOCAL_SAVE_KEY)?.snapshot?.state;
  if (!s) return null;
  const alive = s.players.filter((p) => p.eliminatedRound === null).length;
  return `Rodada ${s.round.number} · ${alive} na mesa`;
}

/** Partida contra bots rodando inteira no navegador, salva a cada jogada. */
export class LocalConnection implements GameConnection {
  readonly kind = 'local' as const;
  readonly youId = YOU;
  private readonly host: GameHost;
  private readonly listeners = new Set<(u: ViewUpdate) => void>();
  private readonly reactionListeners = new Set<(r: ReactionEvent) => void>();
  private last: ViewUpdate | null = null;
  private lastBanter = 0;
  private timers: number[] = [];
  /** O ritmo do jogo (o `GameHost` guarda o dele sem mostrar). */
  private multiplier = 1;
  private readonly rng = createRng(randomSeed(Math.random));
  /** Assentos não mudam numa partida local: calculados uma vez (o `memo` da mesa agradece). */
  private readonly seatInfo: SeatInfo[];

  private constructor(host: GameHost) {
    this.host = host;
    this.seatInfo = host.seats.map((s) => ({
      id: s.id,
      name: s.name,
      avatar: s.avatar ?? s.id,
      kind: s.kind,
      difficulty: s.difficulty,
      connected: true,
    }));
    host.subscribe((e) => this.onHostEvent(e));
  }

  static create(opts: LocalGameOptions): LocalConnection {
    const rng = createRng(randomSeed(Math.random));
    const botNames = pickBotNames(opts.players - 1, [opts.name], rng);
    const seats: SeatConfig[] = [
      { id: YOU, name: opts.name, kind: 'human', avatar: opts.avatar },
      ...botNames.map((name, i) => ({
        id: `bot${i + 1}`,
        name,
        kind: 'bot' as const,
        difficulty: opts.difficulty,
        avatar: randomAvatarSeed(),
      })),
    ];
    const host = new GameHost({
      seats,
      rules: opts.rules,
      seed: randomSeed(Math.random),
      revealToEliminated: true,
    });
    const conn = new LocalConnection(host);
    conn.setSpeed(opts.speed);
    host.start();
    return conn;
  }

  static resume(speed: number): LocalConnection | null {
    const saved = storage.get<SavedGame>(LOCAL_SAVE_KEY);
    if (saved?.v !== 1) return null;
    try {
      const host = GameHost.restore(saved.snapshot);
      const conn = new LocalConnection(host);
      conn.setSpeed(speed);
      host.start();
      return conn;
    } catch {
      clearSavedGame();
      return null;
    }
  }

  current(): ViewUpdate | null {
    return this.last ?? { view: this.host.view(YOU), auto: false, reason: null, actorId: null };
  }

  seats(): SeatInfo[] {
    return this.seatInfo;
  }

  subscribe(listener: (u: ViewUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onReaction(listener: (r: ReactionEvent) => void): () => void {
    this.reactionListeners.add(listener);
    return () => this.reactionListeners.delete(listener);
  }

  async act(action: ClientAction): Promise<string | null> {
    const res = this.host.act(YOU, { ...action, playerId: YOU });
    return res.ok ? null : res.error.message;
  }

  react(reaction: ReactionId): void {
    this.emitReaction({ playerId: YOU, reaction });
  }

  pause(): void {
    this.host.pause();
  }

  resume(): void {
    this.host.resume();
  }

  skipPause(): void {
    this.host.skipPause();
  }

  setSpeed(multiplier: number): void {
    this.multiplier = multiplier;
    this.host.setSpeed(multiplier);
  }

  speed(): number {
    return this.multiplier;
  }

  dispose(): void {
    this.host.dispose();
    for (const t of this.timers) window.clearTimeout(t);
    this.listeners.clear();
    this.reactionListeners.clear();
  }

  private onHostEvent(e: HostEvent): void {
    const actorId = e.action && 'playerId' in e.action ? e.action.playerId : null;
    this.last = { view: this.host.view(YOU), auto: e.auto, reason: e.reason, actorId };
    if (e.state.phase === 'gameOver') clearSavedGame();
    else storage.set(LOCAL_SAVE_KEY, { v: 1, snapshot: this.host.snapshot(), savedAt: Date.now() });
    for (const l of [...this.listeners]) l(this.last);
    this.banter(e);
  }

  private emitReaction(r: ReactionEvent): void {
    for (const l of [...this.reactionListeners]) l(r);
  }

  /** Bots comentam a partida de vez em quando, para a mesa não ficar muda. */
  private banter(e: HostEvent): void {
    const now = Date.now();
    if (now - this.lastBanter < 3500) return;
    const state = e.state;
    const bots = this.host.seats.filter((s) => s.kind === 'bot');
    const aliveBots = bots.filter((b) => state.players.find((p) => p.id === b.id)?.eliminatedRound === null);
    const pick = <T,>(xs: T[]) => xs[this.rng.int(xs.length)];
    let reaction: ReactionEvent | null = null;

    if (e.action?.type === 'continue' && state.phase === 'roundEnd') {
      const rec = state.history.at(-1);
      if (rec) {
        const out = rec.eliminated.find((id) => id !== YOU && bots.some((b) => b.id === id));
        const bigMiss = Object.keys(rec.bids).find((id) => (rec.livesBefore[id] ?? 0) - (rec.livesAfter[id] ?? 0) >= 2);
        if (out && this.rng.next() < 0.6) {
          // Quem saiu lamenta, ou alguém tira sarro.
          const teaser = pick(aliveBots.filter((b) => b.id !== out));
          reaction =
            teaser && this.rng.next() < 0.5
              ? { playerId: teaser.id, reaction: 'deuprati' }
              : { playerId: out, reaction: 'barbaridade' };
        } else if (bigMiss && this.rng.next() < 0.45) {
          const teaser = pick(aliveBots.filter((b) => b.id !== bigMiss));
          if (teaser) reaction = { playerId: teaser.id, reaction: pick(['masbah', 'teacalma'] as ReactionId[])! };
        } else if (rec.cards >= 4 && this.rng.next() < 0.2) {
          const exact = aliveBots.find((b) => rec.bids[b.id] === rec.tricks[b.id]);
          if (exact) reaction = { playerId: exact.id, reaction: pick(['barbada', 'tri'] as ReactionId[])! };
        }
      }
    } else if (state.phase === 'trickEnd' && e.action?.type === 'play') {
      const t = state.round.completedTricks.at(-1);
      if (t && t.cancelled.length > 0 && this.rng.next() < 0.25) {
        const who = pick(aliveBots);
        if (who) reaction = { playerId: who.id, reaction: 'masbah' };
      }
    } else if (state.phase === 'gameOver' && e.action?.type === 'continue') {
      if (state.result?.winners.includes(YOU)) {
        const who = pick(bots);
        if (who) reaction = { playerId: who.id, reaction: pick(['tri', 'bemcapaz'] as ReactionId[])! };
      } else {
        const winner = state.result?.winners[0];
        if (winner && winner !== YOU) reaction = { playerId: winner, reaction: 'barbada' };
      }
    }

    if (reaction && REACTIONS.some((r) => r.id === reaction.reaction)) {
      this.lastBanter = now;
      const r = reaction;
      this.timers.push(window.setTimeout(() => this.emitReaction(r), 500 + this.rng.int(900)));
    }
  }
}
