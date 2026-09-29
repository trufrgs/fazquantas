import { describe, expect, it } from 'vitest';
import { card } from '../src/cards';
import { currentActor, strengthCtx } from '../src/game';
import { isManilha } from '../src/hierarchy';
import { DEFAULT_TIMING, GameHost, MANILHA_PAUSE_FACTOR, type HostEvent, type SeatConfig } from '../src/host';
import { FakeClock } from './fake-clock';

const bots = (n: number): SeatConfig[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    name: `Bot ${i}`,
    kind: 'bot' as const,
    difficulty: (['facil', 'medio', 'dificil'] as const)[i % 3],
  }));

const withHuman = (n: number): SeatConfig[] => [
  { id: 'eu', name: 'Eu', kind: 'human' },
  ...bots(n - 1),
];

describe('GameHost', () => {
  it('plays a bot-only game to the end on its own', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats: bots(4), seed: 7, clock, rules: { startingLives: 2 } });
    const events: HostEvent[] = [];
    host.subscribe((e) => events.push(e));
    host.start();
    clock.runAll();
    expect(host.state.phase).toBe('gameOver');
    expect(host.state.result?.winners.length).toBeGreaterThan(0);
    expect(events.some((e) => e.action?.type === 'bid' && e.auto)).toBe(true);
    expect(clock.pending).toBe(0);
  });

  it('waits for the human, and only accepts actions from humans on turn', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats: withHuman(3), seed: 3, clock, firstDealer: 2 });
    host.start();
    // ordem: eu (após o carteador b1)
    expect(currentActor(host.state)).toEqual({ playerId: 'eu', kind: 'bid' });
    clock.advance(60_000);
    expect(currentActor(host.state)).toEqual({ playerId: 'eu', kind: 'bid' });
    expect(host.view('eu').turnDeadline).toBeNull();

    const byBot = host.act('b0', { type: 'bid', playerId: 'b0', value: 0 });
    expect(byBot.ok).toBe(false);
    const ok = host.act('eu', { type: 'bid', playerId: 'eu', value: 0 });
    expect(ok.ok).toBe(true);
    expect(currentActor(host.state)?.playerId).toBe('b0');
    const outOfTurn = host.act('eu', { type: 'bid', playerId: 'eu', value: 0 });
    expect(!outOfTurn.ok && outOfTurn.error.code).toBe('NOT_YOUR_TURN');
  });

  it('plays for the human when the turn timer expires', () => {
    const clock = new FakeClock();
    const host = new GameHost({
      seats: withHuman(3),
      seed: 3,
      clock,
      firstDealer: 2,
      turnTimeoutMs: 10_000,
      timing: { dealMs: 500 },
    });
    const events: HostEvent[] = [];
    host.subscribe((e) => events.push(e));
    host.start();
    expect(host.view('eu').turnDeadline).toBe(10_500);
    clock.advance(10_499);
    expect(host.state.round.bids.eu).toBeNull();
    clock.advance(1);
    expect(host.state.round.bids.eu).not.toBeNull();
    expect(events.at(-1)?.auto).toBe(true);
  });

  it('plays for a disconnected human and gives the seat back', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats: withHuman(3), seed: 3, clock, firstDealer: 2 });
    host.start();
    host.setAway('eu', true);
    clock.advance(DEFAULT_WAIT);
    expect(host.state.round.bids.eu).not.toBeNull();
    host.setAway('eu', false);
    expect(host.isAway('eu')).toBe(false);
  });

  it('auto-plays the forced card in the blind round', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats: withHuman(2), seed: 3, clock, firstDealer: 1 });
    host.start();
    host.act('eu', { type: 'bid', playerId: 'eu', value: 0 });
    let guard = 0;
    while (host.state.phase === 'bidding' && guard++ < 1000) clock.advance(50);
    expect(host.state.phase).toBe('playing');
    expect(currentActor(host.state)?.playerId).toBe('eu');
    expect(host.view('eu').legalCards).toEqual([]);
    // Depois das cantadas a mesa respira (todo mundo vê as cantadas) e aí a carta sai sozinha.
    clock.advance(DEFAULT_TIMING.bidsRevealMs - 100);
    expect(host.state.round.hands.eu).toHaveLength(1);
    clock.advance(100 + DEFAULT_TIMING.forcedPlayMs + 50);
    expect(host.state.round.hands.eu).toHaveLength(0);
  });

  it('restores a snapshot and continues exactly like the original', () => {
    const clockA = new FakeClock();
    const original = new GameHost({ seats: bots(5), seed: 21, clock: clockA });
    original.start();
    clockA.advance(30_000);
    const snap = JSON.parse(JSON.stringify(original.snapshot()));
    const clockB = new FakeClock();
    const restored = GameHost.restore(snap, { clock: clockB });
    restored.start();
    clockA.runAll();
    clockB.runAll();
    expect(restored.state).toEqual(original.state);
  });

  it('freezes on pause and resumes', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats: bots(3), seed: 5, clock });
    host.start();
    host.pause();
    const seq = host.state.seq;
    clock.advance(120_000);
    expect(host.state.seq).toBe(seq);
    host.resume();
    clock.advance(120_000);
    expect(host.state.seq).toBeGreaterThan(seq);
  });

  it('skips the end-of-trick pause on demand', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats: bots(3), seed: 5, clock });
    host.start();
    let guard = 0;
    while (host.state.phase !== 'trickEnd' && guard++ < 1000) clock.advance(100);
    expect(host.state.phase).toBe('trickEnd');
    host.skipPause();
    expect(host.state.phase).not.toBe('trickEnd');
  });

  it('keeps a trick with a manilha longer on the table (the manilha attacks the cards it won)', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats: bots(4), seed: 11, clock, rules: { startingLives: 2 } });
    host.start();
    const ctx = strengthCtx(host.state);
    const pausas = { com: new Set<number>(), sem: new Set<number>() };
    let desde: number | null = null;
    for (let guard = 0; guard < 200_000 && host.state.phase !== 'gameOver'; guard++) {
      const fim = host.state.phase === 'trickEnd';
      if (fim && desde === null) desde = clock.now();
      if (!fim && desde !== null) {
        const ultima = host.state.round.completedTricks.at(-1);
        const comManilha = ultima?.plays.some((p) => isManilha(card(p.cardId), ctx)) ?? false;
        (comManilha ? pausas.com : pausas.sem).add(clock.now() - desde);
        desde = null;
      }
      clock.advance(10);
    }
    expect([...pausas.sem]).toEqual([DEFAULT_TIMING.trickPauseMs]);
    expect([...pausas.com]).toEqual([DEFAULT_TIMING.trickPauseMs * MANILHA_PAUSE_FACTOR]);
  });

  it('shows every hand to an eliminated human when asked to', () => {
    let checked = false;
    for (let seed = 1; seed <= 40 && !checked; seed++) {
      const clock = new FakeClock();
      const host = new GameHost({
        seats: withHuman(4),
        seed,
        clock,
        revealToEliminated: true,
        rules: { startingLives: 1 },
      });
      host.start();
      host.setAway('eu', true);
      const out = () => host.state.players.find((p) => p.id === 'eu')!.eliminatedRound !== null;
      let guard = 0;
      while (host.state.phase !== 'gameOver' && guard++ < 20_000) {
        if (out() && host.state.phase === 'bidding' && host.state.round.cards > 1) {
          const v = host.view('eu');
          expect(v.hand).toBeNull();
          const inRound = v.players.filter((p) => p.inRound);
          expect(inRound.every((p) => (p.visibleCards?.length ?? 0) === v.cardsThisRound)).toBe(
            true,
          );
          checked = true;
          break;
        }
        clock.advance(100);
      }
    }
    expect(checked).toBe(true);
  });

  it('tells why each automatic move happened', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats: withHuman(3), seed: 3, clock, firstDealer: 2, turnTimeoutMs: 5_000 });
    const events: HostEvent[] = [];
    host.subscribe((e) => events.push(e));
    host.start();
    clock.advance(6_000); // o humano estourou o tempo no palpite
    const timeout = events.find((e) => e.action?.type === 'bid' && 'playerId' in e.action && e.action.playerId === 'eu');
    expect(timeout?.reason).toBe('timeout');
    clock.runAll();
    const reasons = new Set(events.map((e) => e.reason));
    expect(reasons.has('bot')).toBe(true);
    expect(reasons.has('system')).toBe(true);
    expect(reasons.has('forced')).toBe(true);
    for (const e of events) expect(e.auto).toBe(e.reason !== null);
  });

  it('keeps the turn clock running when a player drops and comes back', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats: withHuman(3), seed: 3, clock, firstDealer: 2, turnTimeoutMs: 10_000, timing: { dealMs: 0 } });
    host.start();
    const deadline = host.deadline!;
    clock.advance(4_000);
    host.setAway('eu', true);
    host.setAway('eu', false);
    expect(host.deadline).toBe(deadline);
    clock.advance(6_000);
    expect(host.state.round.bids.eu).not.toBeNull();
  });

  it('turns a leaving human into a bot', () => {
    const clock = new FakeClock();
    const host = new GameHost({ seats: withHuman(3), seed: 3, clock, firstDealer: 2 });
    host.start();
    host.setSeatKind('eu', 'bot', 'medio');
    clock.runAll();
    expect(host.state.phase).toBe('gameOver');
  });
});

const DEFAULT_WAIT = 5_000;
