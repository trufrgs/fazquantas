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
   * cada 1,4 s depois de abrir, para ver os golpes das manilhas ("Quem mata quem").
   */
  /** `cega`: rodada da carta na testa; `cantadas`: quanto cada um cantou (na ordem da mesa; padrão 1). */
  roteiro?: { vira?: CardId; maos: CardId[][]; cega?: boolean; cantadas?: number[]; palitos?: number[] };
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
  // Quatro na mesa na rodada às cegas: cada carta na testa na frente de quem tem (30/09/2026).
  cega4: {
    players: 4,
    seed: 3,
    until: (s) => s.phase === 'bidding' && s.round.blind && currentActor(s)?.playerId === YOU,
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
  // Quem mata quem, o caso comum: o espadão cai no meio, corta as duas que estavam e, no fim, a última.
  espadao: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['C4', 'O4'], ['O5', 'C5'], ['E1', 'C6'], ['E3', 'O3']] },
  },
  // Mais fraca depois: o espadão manda e revida no bastião que chega depois.
  duelo: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['C4', 'O4'], ['E1', 'C5'], ['P1', 'C6'], ['E3', 'O3']] },
  },
  // A mais fraca por último: o bastião fecha a mão e apanha no golpe do fim, junto com a carta de antes.
  fraca: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['C4', 'O4'], ['E1', 'C5'], ['C6', 'O5'], ['P1', 'O3']] },
  },
  // O sete de espadas manda: fura a que estava e, no fim, as duas que chegaram depois.
  setespadas: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['C4', 'O4'], ['E7', 'C5'], ['C6', 'O5'], ['E3', 'O3']] },
  },
  // Rodada da carta na testa: quem joga em segundo cantou zero com o Espadão na testa (não via) e leva a mão.
  natesta: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { cega: true, cantadas: [0, 0, 1, 0], maos: [['C4'], ['E1'], ['O5'], ['C6']] },
  },
  // A mesma rodada, com o Espadão na tua testa: tu cantou zero e leva a mão.
  natestatu: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { cega: true, cantadas: [1, 0, 0, 0], maos: [['C4'], ['O5'], ['C6'], ['E1']] },
  },

  // O sete belo manda: brilha como ouro e apaga as outras.
  setebelo: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['C4', 'O4'], ['O7', 'C5'], ['C6', 'O5'], ['E3', 'O3']] },
  },
  // As quatro manilhas gaúchas na mesma mão: sete belo, bastião, sete de espadas e o espadão por último.
  manilhas: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['O7', 'C4'], ['P1', 'C5'], ['E7', 'C6'], ['E1', 'O4']] },
  },
  // Com vira (6 de ouros: manilha é o 7): a de copas derrama vinho.
  manilhasvira: {
    players: 4,
    seed: 5,
    rules: { hierarchy: 'vira' },
    until: () => true,
    roteiro: { vira: 'O6', maos: [['C7', 'C4'], ['O7', 'C5'], ['E7', 'C6'], ['P7', 'O4']] },
  },
  // A mão que decide (4ª leva): última mão da rodada, dois por um fio. Corte de novela e luz baixa.
  decide: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['C4'], ['O5'], ['E3'], ['P6']], cantadas: [1, 0, 0, 0], palitos: [1, 3, 1, 2] },
  },
  // A mão que decide com o espadão por último: o golpe espera o corte acabar.
  decidemanilha: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['C4'], ['O5'], ['C6'], ['E1']], cantadas: [1, 0, 0, 0], palitos: [1, 3, 2, 1] },
  },
  // A peleia do empate: as duas maiores iguais se chocam e ninguém leva.
  peleia: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['C3', 'O4'], ['O3', 'C5'], ['P5', 'C7'], ['C6', 'O5']] },
  },
  // A manilha no lixo: o sete belo perde para o espadão e queima quando a mão sai da mesa.
  lixo: {
    players: 4,
    seed: 5,
    until: () => true,
    roteiro: { maos: [['O7', 'O4'], ['E1', 'P4'], ['C5', 'C6'], ['P5', 'O5']] },
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
  s.round.blind = roteiro.cega ?? false;
  s.round.hands = Object.fromEntries(ordem.map((id, i) => [id, roteiro.maos[i] ?? []]));
  s.round.bids = Object.fromEntries(ordem.map((id, i) => [id, roteiro.cantadas?.[i] ?? 1]));
  s.round.tricksWon = Object.fromEntries(ordem.map((id) => [id, 0]));
  s.round.bidTurn = ordem.length;
  s.round.trick = { leaderId: ordem[0]!, plays: [] };
  s.round.completedTricks = [];
  s.phase = 'playing';
  if (roteiro.palitos) ordem.forEach((id, i) => (s.players.find((p) => p.id === id)!.lives = roteiro.palitos![i] ?? 3));
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
  // `&longe=1`: os dois primeiros adversários são gente que caiu (para ver o cusco no lugar deles).
  const longe = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('longe');
  const seats: SeatInfo[] = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    avatar: i === 0 ? 'thomas' : `${p.name.toLowerCase()}-${scene.seed}`,
    kind: i === 0 || (longe && i <= 2) ? 'human' : 'bot',
    difficulty: 'medio',
    connected: !(longe && i >= 1 && i <= 2),
    away: longe && i === 2,
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
      // Depois da mão, a mesa recolhe (para ver o que acontece quando as cartas saem).
      timers.push(
        window.setTimeout(() => {
          if (state.phase !== 'trickEnd') return;
          const r = applyAction(state, { type: 'continue' });
          if (!r.ok) return;
          state = r.state;
          update = viewOf(state);
          listener(update);
        }, 1200 + state.round.order.length * 1400 + 4200),
      );
      return () => timers.forEach((t) => window.clearTimeout(t));
    },
    onReaction: () => () => undefined,
    act: async (_a: ClientAction) => null,
    react: (_r: ReactionId) => undefined,
    dispose: () => undefined,
  };
}
