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
  type CardId,
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
  /**
   * Cena animada: arma a mão (cartas de cada um, na ordem da mesa, primeiro quem puxa) e joga uma a
   * cada 1,4 s depois de abrir, para ver os efeitos (manilhas, "queimou").
   */
  roteiro?: { vira?: CardId; maos: CardId[][] };
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
  palpite8: {
    players: 8,
    seed: 3,
    until: (s) => s.phase === 'bidding' && s.round.cards >= 4 && currentActor(s)?.playerId === YOU,
  },
  cega: {
    players: 6,
    seed: 1,
    until: (s) => s.phase === 'bidding' && s.round.blind && currentActor(s)?.playerId === YOU && s.round.bidTurn >= 2,
  },
  cega8: {
    players: 8,
    seed: 2,
    until: (s) => s.phase === 'bidding' && s.round.blind && currentActor(s)?.playerId === YOU && s.round.bidTurn >= 3,
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
  muitas: {
    players: 2,
    seed: 4,
    rules: { startingLives: 12 },
    until: (s) => s.phase === 'playing' && s.round.cards >= 10 && currentActor(s)?.playerId === YOU,
  },
  vira: {
    players: 4,
    seed: 6,
    rules: { hierarchy: 'vira' },
    until: (s) => s.phase === 'playing' && s.round.cards >= 3 && currentActor(s)?.playerId === YOU,
  },
  // As quatro manilhas gaúchas na mesma mão: sete belo, bastião, sete de espadas e o espadão por último.
  manilhas: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['O7', 'C4'], ['P1', 'C5'], ['E7', 'C6'], ['E1', 'O4']] },
  },
  // Com vira (6 de ouros: manilha é o 7): a de copas pega fogo.
  manilhasvira: {
    players: 4,
    seed: 5,
    rules: { hierarchy: 'vira' },
    until: () => true,
    roteiro: { vira: 'O6', maos: [['C7', 'C4'], ['O7', 'C5'], ['E7', 'C6'], ['P7', 'O4']] },
  },
};

/** Arma a primeira mão da cena: quem puxa é o primeiro da ordem, você joga por último. */
function armar(state: GameState, roteiro: NonNullable<Scene['roteiro']>): GameState {
  const s = structuredClone(state);
  const order = s.round.order;
  const eu = order.indexOf(YOU);
  // Você fica por último na ordem (o carteador), para ver as outras cartas chegando.
  const ordem = [...order.slice(eu + 1), ...order.slice(0, eu + 1)];
  s.round.order = ordem;
  s.round.dealerId = YOU;
  s.round.cards = roteiro.maos[0]!.length;
  s.round.vira = roteiro.vira ?? null;
  s.round.blind = false;
  s.round.hands = Object.fromEntries(ordem.map((id, i) => [id, roteiro.maos[i] ?? []]));
  s.round.bids = Object.fromEntries(ordem.map((id) => [id, 1]));
  s.round.tricksWon = Object.fromEntries(ordem.map((id) => [id, 0]));
  s.round.bidTurn = ordem.length;
  s.round.trick = { leaderId: ordem[0]!, plays: [] };
  s.round.completedTricks = [];
  s.phase = 'playing';
  return s;
}

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

/** Conexão parada num estado (não avança), ou jogando o roteiro da cena. */
export function sceneConnection(name: string): GameConnection | null {
  const scene = SCENES[name];
  if (!scene) return null;
  const simulado = simulate(scene);
  const seats = simulado.seats;
  let state = scene.roteiro ? armar(simulado.state, scene.roteiro) : simulado.state;
  const viewOf = (st: GameState): ViewUpdate => ({
    view: getPlayerView(st, YOU, { revealAll: scene.revealAll }),
    auto: false,
    reason: null,
    actorId: null,
  });
  let update = viewOf(state);
  return {
    kind: 'local',
    youId: YOU,
    current: () => update,
    seats: () => seats,
    subscribe: (listener) => {
      if (!scene.roteiro) return () => undefined;
      const timers = state.round.order.map((_, i) =>
        window.setTimeout(() => {
          const actor = currentActor(state);
          const cardId = actor ? state.round.hands[actor.playerId]?.[0] : undefined;
          if (!actor || !cardId) return;
          const r = applyAction(state, { type: 'play', playerId: actor.playerId, cardId });
          if (!r.ok) return;
          state = r.state;
          update = viewOf(state);
          listener(update);
        }, 1200 + i * 1400),
      );
      return () => timers.forEach((t) => window.clearTimeout(t));
    },
    onReaction: () => () => undefined,
    act: async (_a: ClientAction) => null,
    react: (_r: ReactionId) => undefined,
    dispose: () => undefined,
  };
}
