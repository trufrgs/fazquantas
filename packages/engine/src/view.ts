import { card, type CardId, type Rank } from './cards';
import { currentActor, forbiddenBid, isAlive, legalBids, legalCards } from './game';
import { manilhaRank } from './hierarchy';
import type { Rules } from './rules';
import type {
  Actor,
  GameResult,
  GameState,
  Phase,
  Play,
  RoundRecord,
  TrickRecord,
} from './types';

export interface PublicPlayer {
  id: string;
  name: string;
  lives: number;
  eliminated: boolean;
  eliminatedRound: number | null;
  /** Participa da rodada atual (estava vivo quando as cartas foram dadas). */
  inRound: boolean;
  isDealer: boolean;
  bid: number | null;
  tricks: number;
  handCount: number;
  /** Cartas da mão deste jogador que quem vê pode enxergar (rodada às cegas, modo revelado). */
  visibleCards: CardId[] | null;
}

export interface PlayerView {
  seq: number;
  /** Quem está vendo; `null` para espectador. */
  you: string | null;
  rules: Rules;
  phase: Phase;
  roundNumber: number;
  cardsThisRound: number;
  direction: 'up' | 'down';
  dealerId: string;
  /** Ordem da rodada (apostas), terminando no pé. */
  order: string[];
  vira: CardId | null;
  manilhaRank: Rank | null;
  blind: boolean;
  /** Na ordem dos assentos. */
  players: PublicPlayer[];
  hand: CardId[] | null;
  /** Rodada às cegas: você tem carta, mas não pode vê-la. */
  handHidden: boolean;
  trick: { leaderId: string; plays: Play[] } | null;
  completedTricks: TrickRecord[];
  lastTrick: TrickRecord | null;
  actor: Actor | null;
  legalBids: number[];
  legalCards: CardId[];
  forbiddenBid: number | null;
  bidsSum: number;
  history: RoundRecord[];
  result: GameResult | null;
  /** Epoch ms em que a vez atual expira (fornecido pelo host). */
  turnDeadline: number | null;
}

export interface ViewOptions {
  /** Mostra todas as mãos (espectador no modo local). */
  revealAll?: boolean;
  turnDeadline?: number | null;
}

export function getPlayerView(
  state: GameState,
  viewerId: string | null,
  opts: ViewOptions = {},
): PlayerView {
  const { round } = state;
  const viewer = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  const viewerPlaying = viewer !== undefined && isAlive(viewer) && round.order.includes(viewer.id);
  const actor = currentActor(state);

  const players: PublicPlayer[] = state.players.map((p) => {
    const inRound = round.order.includes(p.id);
    const hand = round.hands[p.id] ?? [];
    const canSee = opts.revealAll === true || (round.blind && p.id !== viewerId);
    const visibleCards = inRound && canSee ? hand.slice() : null;
    return {
      id: p.id,
      name: p.name,
      lives: p.lives,
      eliminated: !isAlive(p),
      eliminatedRound: p.eliminatedRound,
      inRound,
      isDealer: p.id === round.dealerId,
      bid: round.bids[p.id] ?? null,
      tricks: round.tricksWon[p.id] ?? 0,
      handCount: hand.length,
      visibleCards,
    };
  });

  const ownHand = viewerPlaying ? (round.hands[viewer.id] ?? []) : null;
  const handHidden = viewerPlaying && round.blind && (ownHand?.length ?? 0) > 0;
  const lastTrick = round.completedTricks.at(-1) ?? null;
  const dealerForbidden =
    actor?.kind === 'bid' && actor.playerId === round.dealerId
      ? forbiddenBid(state, round.dealerId)
      : null;

  return {
    seq: state.seq,
    you: viewerId,
    rules: { ...state.rules },
    phase: state.phase,
    roundNumber: round.number,
    cardsThisRound: round.cards,
    direction: state.direction,
    dealerId: round.dealerId,
    order: round.order.slice(),
    vira: round.vira,
    manilhaRank:
      state.rules.hierarchy === 'vira' && round.vira ? manilhaRank(card(round.vira)) : null,
    blind: round.blind,
    players,
    hand: handHidden ? null : (ownHand?.slice() ?? null),
    handHidden,
    trick: round.trick ? structuredClone(round.trick) : null,
    completedTricks: structuredClone(round.completedTricks),
    lastTrick: lastTrick ? structuredClone(lastTrick) : null,
    actor,
    legalBids: viewerId ? legalBids(state, viewerId) : [],
    legalCards: viewerId && !round.blind ? legalCards(state, viewerId) : [],
    forbiddenBid: dealerForbidden,
    bidsSum: round.order.reduce((sum, id) => sum + (round.bids[id] ?? 0), 0),
    history: structuredClone(state.history),
    result: state.result ? structuredClone(state.result) : null,
    turnDeadline: opts.turnDeadline ?? null,
  };
}
