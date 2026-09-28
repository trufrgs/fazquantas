/**
 * Contrato cliente ↔ servidor (socket.io). Só tipos — o engine não depende de socket.io.
 */
import type { BotDifficulty } from './bots';
import type { CardId } from './cards';
import type { Rules } from './rules';
import type { PlayerView } from './view';

export const PROTOCOL_VERSION = 1;
export const ROOM_CAPACITY = 8;
export const ROOM_CODE_LENGTH = 4;
/** Sem I, O, 0 e 1 para não confundir ao ditar o código. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const NAME_MAX_LENGTH = 16;
export const TURN_TIMEOUT_OPTIONS = [null, 15, 30, 60] as const;
export const DEFAULT_TURN_TIMEOUT_SEC = 30;

export type ReactionId = 'boa' | 'eita' | 'haha' | 'chora' | 'bravo' | 'tche' | 'sorte' | 'vamo';
export const REACTIONS: readonly { id: ReactionId; emoji: string; label: string }[] = [
  { id: 'boa', emoji: '👏', label: 'Boa!' },
  { id: 'haha', emoji: '😂', label: 'Haha' },
  { id: 'eita', emoji: '😱', label: 'Eita!' },
  { id: 'chora', emoji: '😭', label: 'Chora' },
  { id: 'bravo', emoji: '😤', label: 'Ah, não!' },
  { id: 'tche', emoji: '🧉', label: 'Bah, tchê!' },
  { id: 'sorte', emoji: '🍀', label: 'Sorte…' },
  { id: 'vamo', emoji: '🔥', label: 'Vamo!' },
];

export type SeatPublic =
  | {
      kind: 'human';
      playerId: string;
      name: string;
      avatar: string;
      connected: boolean;
    }
  | {
      kind: 'bot';
      playerId: string;
      name: string;
      avatar: string;
      difficulty: BotDifficulty;
    };

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomState {
  code: string;
  status: RoomStatus;
  /** Assentos ocupados, na ordem de jogo. */
  seats: SeatPublic[];
  hostId: string;
  youId: string;
  rules: Rules;
  turnTimeoutSec: number | null;
  capacity: number;
}

export interface JoinResult {
  code: string;
  playerId: string;
  token: string;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_PAYLOAD'
  | 'RATE_LIMITED'
  | 'GAME_ERROR';

export interface ProtocolError {
  code: ErrorCode | string;
  message: string;
}

export type Ack<T extends object = object> = ({ ok: true } & T) | { ok: false; error: ProtocolError };

export type ClientAction = { type: 'bid'; value: number } | { type: 'play'; cardId: CardId };

export interface ViewMessage {
  view: PlayerView;
  /** A mudança foi automática (bot, tempo esgotado, desconectado, jogada forçada). */
  auto: boolean;
  /** Quem agiu na mudança que gerou esta visão. */
  actorId: string | null;
}

export interface ClientToServerEvents {
  'room:create': (p: { name: string; avatar: string }, ack: (r: Ack<JoinResult>) => void) => void;
  'room:join': (
    p: { code: string; name: string; avatar: string; token?: string },
    ack: (r: Ack<JoinResult>) => void,
  ) => void;
  'room:leave': (ack?: (r: Ack) => void) => void;
  'room:update': (
    p: { rules?: Partial<Rules>; turnTimeoutSec?: number | null },
    ack?: (r: Ack) => void,
  ) => void;
  'room:addBot': (p: { difficulty: BotDifficulty }, ack?: (r: Ack) => void) => void;
  'room:setBot': (
    p: { playerId: string; difficulty: BotDifficulty },
    ack?: (r: Ack) => void,
  ) => void;
  'room:removeSeat': (p: { playerId: string }, ack?: (r: Ack) => void) => void;
  'room:start': (ack?: (r: Ack) => void) => void;
  'room:rematch': (ack?: (r: Ack) => void) => void;
  /** Anfitrião, depois do fim de jogo: volta a sala para o lobby (trocar assentos, regras). */
  'room:lobby': (ack?: (r: Ack) => void) => void;
  'game:action': (p: { action: ClientAction }, ack?: (r: Ack) => void) => void;
  'game:react': (p: { reaction: ReactionId }) => void;
}

export interface ServerToClientEvents {
  'room:state': (s: RoomState) => void;
  'room:kicked': () => void;
  'game:view': (m: ViewMessage) => void;
  'game:reaction': (r: { playerId: string; reaction: ReactionId; at: number }) => void;
}
