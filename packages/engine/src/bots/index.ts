import type { CardId } from '../cards';
import type { Rng } from '../rng';
import type { PlayerAction } from '../types';
import type { PlayerView } from '../view';
import { heuristicBid, monteCarloBid } from './bid';
import { blindBid, blindWinProbability } from './blind';
import { buildCtx } from './context';
import { monteCarloPlay, policyPlay, randomPlay } from './play';

export type BotDifficulty = 'facil' | 'medio' | 'dificil';

export const BOT_DIFFICULTIES: readonly { id: BotDifficulty; name: string; description: string }[] = [
  { id: 'facil', name: 'Fácil', description: 'Palpita no olho e às vezes joga qualquer carta.' },
  { id: 'medio', name: 'Médio', description: 'Conta as cartas e joga com critério.' },
  {
    id: 'dificil',
    name: 'Difícil',
    description: 'Simula a rodada centenas de vezes, lê os palpites e atrapalha quando pode.',
  },
];

const HARD = { samples: 90, spite: 0.15 };
const HINT = { samples: 48, spite: 0 };

/** Decide a jogada do bot a partir da própria visão. `null` quando não há o que decidir. */
export function decideBot(
  view: PlayerView,
  difficulty: BotDifficulty,
  rng: Rng,
): PlayerAction | null {
  const me = view.you;
  if (!me || view.actor?.playerId !== me) return null;

  if (view.actor.kind === 'bid') {
    if (view.legalBids.length === 0) return null;
    return { type: 'bid', playerId: me, value: chooseBid(view, difficulty, rng) };
  }
  if (view.legalCards.length === 0) return null; // rodada às cegas: o host joga a carta forçada
  return { type: 'play', playerId: me, cardId: choosePlay(view, difficulty, rng) };
}

function chooseBid(view: PlayerView, difficulty: BotDifficulty, rng: Rng): number {
  const b = buildCtx(view);
  if (view.blind) {
    const p = blindWinProbability(b, difficulty === 'dificil');
    const noisy = difficulty === 'facil' ? p + (rng.next() - 0.5) * 0.5 : p;
    return blindBid(b, noisy);
  }
  if (difficulty === 'facil') return heuristicBid(b, 1.1, rng);
  if (difficulty === 'medio') return heuristicBid(b);
  return monteCarloBid(b, rng, HARD);
}

function choosePlay(view: PlayerView, difficulty: BotDifficulty, rng: Rng): CardId {
  const b = buildCtx(view);
  if (view.legalCards.length === 1) return view.legalCards[0]!;
  if (difficulty === 'facil') return rng.next() < 0.35 ? randomPlay(b, rng) : policyPlay(b);
  if (difficulty === 'medio') return policyPlay(b);
  return monteCarloPlay(b, rng, HARD);
}

export interface Suggestion {
  bid?: number;
  cardId?: CardId;
}

/** Dica para o jogador humano (usa só a visão dele). */
export function suggest(view: PlayerView, rng: Rng): Suggestion {
  const me = view.you;
  if (!me || view.actor?.playerId !== me) return {};
  const b = buildCtx(view);
  if (view.actor.kind === 'bid') {
    if (view.legalBids.length === 0) return {};
    if (view.blind) return { bid: blindBid(b, blindWinProbability(b, true)) };
    return { bid: monteCarloBid(b, rng, HINT) };
  }
  if (view.legalCards.length === 0) return {};
  if (view.legalCards.length === 1) return { cardId: view.legalCards[0]! };
  return { cardId: monteCarloPlay(b, rng, HINT) };
}
