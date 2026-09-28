/**
 * Cenas de desenvolvimento (`?cena=nome`): simula uma partida com semente fixa até um estado
 * interessante e mostra a mesa parada nele. Só para revisão visual — não entra no build.
 */
import {
  applyAction,
  createGame,
  createRng,
  currentActor,
  decideBot,
  getPlayerView,
  normalizeRules,
  pickBotNames,
  type ClientAction,
  type GameState,
  type ReactionId,
  type Rules,
} from '@fodinha/engine';
import type { GameConnection, SeatInfo, ViewUpdate } from '../lib/connection';

interface Scene {
  players: number;
  rules?: Partial<Rules>;
  seed: number;
  until: (s: GameState) => boolean;
  revealAll?: boolean;
  lives?: number;
}

const YOU = 'eu';

export const SCENES: Record<string, Scene> = {
  mesa8: {
    players: 8,
    seed: 3,
    until: (s) => s.phase === 'playing' && s.round.cards >= 3 && (s.round.trick?.plays.length ?? 0) >= 5 && currentActor(s)?.playerId === YOU,
  },
  palpite: {
    players: 4,
    seed: 11,
    until: (s) => s.phase === 'bidding' && s.round.cards >= 4 && currentActor(s)?.playerId === YOU,
  },
  cega: {
    players: 6,
    seed: 1,
    until: (s) => s.phase === 'bidding' && s.round.blind && currentActor(s)?.playerId === YOU && s.round.bidTurn >= 2,
  },
  mao: {
    players: 5,
    seed: 8,
    until: (s) => s.phase === 'playing' && s.round.cards >= 4 && (s.round.trick?.plays.length ?? 0) >= 3 && currentActor(s)?.playerId === YOU,
  },
  empardou: {
    players: 5,
    seed: 21,
    until: (s) => s.phase === 'trickEnd' && (s.round.completedTricks.at(-1)?.cancelled.length ?? 0) >= 2 && s.round.completedTricks.at(-1)?.winnerId !== null,
  },
  fimrodada: {
    players: 4,
    seed: 4,
    until: (s) => s.phase === 'roundEnd' && s.round.number >= 3 && Object.values(s.history.at(-1)?.livesBefore ?? {}).some((v, i) => v !== Object.values(s.history.at(-1)!.livesAfter)[i]),
  },
  fimjogo: {
    players: 5,
    seed: 2,
    rules: { startingLives: 2 },
    until: (s) => s.phase === 'gameOver',
  },
  espectador: {
    players: 6,
    seed: 9,
    rules: { startingLives: 2 },
    revealAll: true,
    until: (s) =>
      (s.phase === 'playing' || s.phase === 'bidding') && s.players.find((p) => p.id === YOU)!.eliminatedRound !== null,
  },
  vira: {
    players: 4,
    seed: 6,
    rules: { hierarchy: 'vira' },
    until: (s) => s.phase === 'playing' && s.round.cards >= 3 && currentActor(s)?.playerId === YOU,
  },
};

function simulate(scene: Scene): { state: GameState; seats: SeatInfo[] } {
  const rng = createRng(scene.seed);
  const names = pickBotNames(scene.players - 1, ['Thomas'], rng);
  const players = [{ id: YOU, name: 'Thomas' }, ...names.map((name, i) => ({ id: `bot${i + 1}`, name }))];
  let state = createGame({ players, rules: normalizeRules(scene.rules ?? {}), seed: scene.seed });
  for (let i = 0; i < 20_000 && !scene.until(state); i++) {
    if (state.phase === 'gameOver') break;
    const actor = currentActor(state);
    const action = actor
      ? (decideBot(getPlayerView(state, actor.playerId), 'medio', rng) ?? {
          type: 'play' as const,
          playerId: actor.playerId,
          cardId: state.round.hands[actor.playerId]![0]!,
        })
      : { type: 'continue' as const };
    const r = applyAction(state, action);
    if (!r.ok) break;
    state = r.state;
  }
  const seats: SeatInfo[] = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    avatar: i === 0 ? 'thomas' : `${p.name.toLowerCase()}-${scene.seed}`,
    kind: i === 0 ? 'human' : 'bot',
    difficulty: 'medio',
    connected: true,
  }));
  return { state, seats };
}

/** Conexão parada num estado (não avança). */
export function sceneConnection(name: string): GameConnection | null {
  const scene = SCENES[name];
  if (!scene) return null;
  const { state, seats } = simulate(scene);
  const update: ViewUpdate = {
    view: getPlayerView(state, YOU, { revealAll: scene.revealAll }),
    auto: false,
    reason: null,
    actorId: null,
  };
  return {
    kind: 'local',
    youId: YOU,
    current: () => update,
    seats: () => seats,
    subscribe: () => () => undefined,
    onReaction: () => () => undefined,
    act: async (_a: ClientAction) => null,
    react: (_r: ReactionId) => undefined,
    dispose: () => undefined,
  };
}
