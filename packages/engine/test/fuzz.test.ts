import { describe, expect, it } from 'vitest';
import { decideBot, type BotDifficulty } from '../src/bots';
import { fullDeck, type CardId } from '../src/cards';
import { applyAction, createGame, currentActor } from '../src/game';
import { GameHost } from '../src/host';
import { createRng, type Rng } from '../src/rng';
import { normalizeRules, type Rules } from '../src/rules';
import type { GameState } from '../src/types';
import { getPlayerView } from '../src/view';
import { FakeClock } from './fake-clock';
import { players } from './helpers';

const GAMES = Number((globalThis as { process?: { env: Record<string, string> } }).process?.env
  .FUZZ_GAMES ?? 150);
const DECK = new Set<CardId>(fullDeck().map((c) => c.id));
const DIFFS: BotDifficulty[] = ['facil', 'medio', 'dificil'];

function randomRules(rng: Rng): Rules {
  return normalizeRules({
    hierarchy: (['vira', 'gaucha', 'mineira'] as const)[rng.int(3)],
    startingLives: 1 + rng.int(4),
    penalty: rng.next() < 0.7 ? 'difference' : 'fixed',
    tieRule: (['cancel', 'nobody', 'suit'] as const)[rng.int(3)],
    blindRound: (['all', 'first', 'off'] as const)[rng.int(3)],
    dealerRestriction: rng.next() < 0.85,
    dealerRestrictionInBlind: rng.next() < 0.5,
    progression: rng.next() < 0.6 ? 'up' : 'upDown',
    restartOnElimination: rng.next() < 0.7,
    maxCards: [null, 3, 5, 7, 9][rng.int(5)],
  });
}

function checkInvariants(s: GameState, prev: GameState | null): void {
  const { round } = s;
  const inPlay = s.phase === 'bidding' || s.phase === 'playing' || s.phase === 'trickEnd';
  // ordem e carteador
  expect(round.order.at(-1)).toBe(round.dealerId);
  for (const id of round.order) {
    const p = s.players.find((x) => x.id === id)!;
    if (s.phase !== 'roundEnd' && s.phase !== 'gameOver') expect(p.eliminatedRound).toBeNull();
  }
  // conservação de cartas
  if (inPlay) {
    const played = round.completedTricks.flatMap((t) => t.plays.map((p) => p.cardId));
    if (round.trick) played.push(...round.trick.plays.map((p) => p.cardId));
    const inHands = round.order.flatMap((id) => round.hands[id] ?? []);
    const all = [...played, ...inHands, ...(round.vira ? [round.vira] : [])];
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((id) => DECK.has(id))).toBe(true);
    expect(played.length + inHands.length).toBe(round.cards * round.order.length);
    const doneTricks = round.completedTricks.length;
    for (const id of round.order) {
      const playedNow = round.trick?.plays.some((p) => p.playerId === id) ? 1 : 0;
      expect(round.hands[id]!.length).toBe(round.cards - doneTricks - playedNow);
    }
    const won = Object.values(round.tricksWon).reduce((a, b) => a + b, 0);
    expect(won).toBe(round.completedTricks.filter((t) => t.winnerId !== null).length);
  }
  // apostas
  for (const id of round.order) {
    const b = round.bids[id];
    if (b !== null && b !== undefined) expect(b >= 0 && b <= round.cards).toBe(true);
  }
  const allBid = round.order.every((id) => round.bids[id] !== null);
  const restricted = s.rules.dealerRestriction && (!round.blind || s.rules.dealerRestrictionInBlind);
  if (allBid && restricted && s.phase !== 'roundEnd' && s.phase !== 'gameOver') {
    const sum = round.order.reduce((a, id) => a + (round.bids[id] ?? 0), 0);
    expect(sum).not.toBe(round.cards);
  }
  // vidas nunca sobem; eliminado não volta
  if (prev) {
    for (const p of s.players) {
      const before = prev.players.find((x) => x.id === p.id)!;
      expect(p.lives).toBeLessThanOrEqual(before.lives);
      if (before.eliminatedRound !== null) expect(p.eliminatedRound).toBe(before.eliminatedRound);
    }
  }
  for (const p of s.players) expect(p.eliminatedRound !== null).toBe(p.lives <= 0);
  // visões não vazam
  if (s.phase === 'bidding' || s.phase === 'playing') {
    for (const viewer of round.order) {
      // O histórico traz viras de rodadas passadas (públicas), que podem coincidir com cartas
      // da rodada atual — por isso fica fora da checagem de vazamento.
      const json = JSON.stringify({ ...getPlayerView(s, viewer), history: [] });
      expect(json).not.toContain('rngState');
      for (const other of round.order) {
        const hidden = other === viewer ? (round.blind ? round.hands[other]! : []) : round.blind ? [] : round.hands[other]!;
        for (const id of hidden) expect(json).not.toContain(`"${id}"`);
      }
    }
  }
}

describe('fuzz', () => {
  it(`keeps every invariant across ${GAMES} random games`, () => {
    const meta = createRng(20260927);
    let maxRounds = 0;
    for (let g = 0; g < GAMES; g++) {
      const n = 2 + meta.int(7);
      const rules = randomRules(meta);
      const diffs = Array.from({ length: n }, () =>
        meta.next() < 0.15 ? DIFFS[2]! : DIFFS[meta.int(2)]!,
      );
      const rng = createRng(meta.int(2 ** 31));
      let state = createGame({ players: players(n), rules, seed: meta.int(2 ** 31) });
      let prev: GameState | null = null;
      let steps = 0;
      while (state.phase !== 'gameOver') {
        if (++steps > 50_000) throw new Error(`jogo ${g} não terminou`);
        checkInvariants(state, prev);
        prev = state;
        const actor = currentActor(state);
        const action = actor
          ? (decideBot(getPlayerView(state, actor.playerId), diffs[Number(actor.playerId.slice(1))]!, rng) ?? {
              type: 'play' as const,
              playerId: actor.playerId,
              cardId: state.round.hands[actor.playerId]![0]!,
            })
          : { type: 'continue' as const };
        const r = applyAction(state, action);
        if (!r.ok) throw new Error(`jogo ${g}: ${r.error.code} (${JSON.stringify(action)})`);
        state = r.state;
      }
      checkInvariants(state, prev);
      expect(state.result!.winners.length).toBeGreaterThan(0);
      expect([...state.result!.ranking].sort()).toEqual(state.players.map((p) => p.id).sort());
      maxRounds = Math.max(maxRounds, state.round.number);
    }
    expect(maxRounds).toBeLessThan(500);
  }, 600_000);

  it('runs random games through the host with the fake clock', () => {
    const meta = createRng(7);
    for (let g = 0; g < 30; g++) {
      const n = 2 + meta.int(7);
      const clock = new FakeClock();
      const host = new GameHost({
        seats: Array.from({ length: n }, (_, i) => ({
          id: `p${i}`,
          name: `Bot ${i}`,
          kind: 'bot' as const,
          difficulty: DIFFS[meta.int(3)],
        })),
        rules: { ...randomRules(meta), startingLives: 2 },
        seed: meta.int(2 ** 31),
        clock,
      });
      let prev: GameState | null = null;
      host.subscribe(({ state }) => {
        checkInvariants(state, prev);
        prev = state;
      });
      host.start();
      clock.runAll();
      expect(host.state.phase).toBe('gameOver');
    }
  }, 600_000);
});
