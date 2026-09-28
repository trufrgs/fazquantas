import type { CardId } from './cards';
import type { Rules } from './rules';

export interface PlayerInfo {
  id: string;
  name: string;
}

export interface PlayerState {
  id: string;
  name: string;
  /** Pode ficar negativo na rodada em que o jogador é eliminado (desempate). */
  lives: number;
  /** Rodada em que foi eliminado; `null` enquanto vivo. */
  eliminatedRound: number | null;
}

export interface Play {
  playerId: string;
  cardId: CardId;
}

export interface TrickRecord {
  leaderId: string;
  plays: Play[];
  /** `null` quando todas as cartas se anularam. */
  winnerId: string | null;
  /** Jogadores cujas cartas foram anuladas por empate (só as que importaram). */
  cancelled: string[];
}

export interface RoundState {
  number: number;
  /** Cartas por jogador nesta rodada. */
  cards: number;
  dealerId: string;
  /** Vivos na ordem de jogo, começando após o carteador; o carteador (pé) é o último. */
  order: string[];
  vira: CardId | null;
  hands: Record<string, CardId[]>;
  bids: Record<string, number | null>;
  /** Índice em `order` de quem aposta agora. */
  bidTurn: number;
  tricksWon: Record<string, number>;
  /** Vaza em andamento (fase `playing`). */
  trick: { leaderId: string; plays: Play[] } | null;
  completedTricks: TrickRecord[];
  /** Rodada de 1 carta às cegas. */
  blind: boolean;
}

export interface RoundRecord {
  number: number;
  cards: number;
  dealerId: string;
  vira: CardId | null;
  bids: Record<string, number>;
  tricks: Record<string, number>;
  livesBefore: Record<string, number>;
  livesAfter: Record<string, number>;
  eliminated: string[];
}

export interface GameResult {
  /** Um vencedor, ou mais de um em caso de empate. */
  winners: string[];
  /** Todos os jogadores, do melhor para o pior. */
  ranking: string[];
}

export type Phase = 'bidding' | 'playing' | 'trickEnd' | 'roundEnd' | 'gameOver';

export interface GameState {
  version: 1;
  rules: Rules;
  /** Na ordem de jogo (anti-horário). */
  players: PlayerState[];
  phase: Phase;
  round: RoundState;
  direction: 'up' | 'down';
  history: RoundRecord[];
  rngState: number;
  result: GameResult | null;
  /** Incrementa a cada ação aplicada. */
  seq: number;
}

export type Action =
  | { type: 'bid'; playerId: string; value: number }
  | { type: 'play'; playerId: string; cardId: CardId }
  | { type: 'continue' };

export type PlayerAction = Extract<Action, { playerId: string }>;

export type GameErrorCode =
  | 'GAME_OVER'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'UNKNOWN_PLAYER'
  | 'INVALID_BID'
  | 'FORBIDDEN_BID'
  | 'CARD_NOT_IN_HAND'
  | 'INVALID_ACTION';

export interface GameError {
  code: GameErrorCode;
  /** Mensagem pronta para mostrar ao jogador (pt-BR). */
  message: string;
}

export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: GameError };

export interface Actor {
  playerId: string;
  kind: 'bid' | 'play';
}
