/**
 * Contrato cliente ↔ servidor. Os eventos viajam num WebSocket por sala, em JSON (ver `Wire*`):
 * o engine só define os tipos, não depende de rede.
 */
import type { BotDifficulty } from './bots';
import type { CardId } from './cards';
import type { AutoReason } from './host';
import type { Rules } from './rules';
import type { BestOf, SeriesState } from './series';
import type { PlayerView } from './view';

export const PROTOCOL_VERSION = 2;
export const ROOM_CAPACITY = 8;
export const ROOM_CODE_LENGTH = 4;
/** Sem I, O, 0 e 1 para não confundir ao ditar o código. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const NAME_MAX_LENGTH = 16;
export const TURN_TIMEOUT_OPTIONS = [null, 15, 30, 60, 120] as const;
export const DEFAULT_TURN_TIMEOUT_SEC = 30;
export const PASSWORD_MAX_LENGTH = 24;

/** Ritmo da mesa: quanto os bots pensam e quanto a vaza e o resumo da rodada ficam na tela. */
export type Pace = 'calma' | 'normal' | 'rapida';
export const PACES: readonly { id: Pace; label: string; description: string; multiplier: number }[] = [
  { id: 'calma', label: 'Calma', description: 'Mais tempo para ver cada vaza.', multiplier: 0.7 },
  { id: 'normal', label: 'Normal', description: 'O ritmo de sempre.', multiplier: 1 },
  { id: 'rapida', label: 'Ligeira', description: 'Para quem já conhece o jogo.', multiplier: 1.5 },
];
export const DEFAULT_PACE: Pace = 'normal';

export function paceMultiplier(pace: Pace): number {
  return PACES.find((p) => p.id === pace)?.multiplier ?? 1;
}

/**
 * Reações rápidas da mesa, em expressões gaúchas de uso corrente (validadas em pesquisa):
 * quatro de surpresa/aprovação e quatro de provocação amigável.
 */
export type ReactionId =
  | 'masbah'
  | 'barbaridade'
  | 'bemcapaz'
  | 'tri'
  | 'barbada'
  | 'deuprati'
  | 'teacalma'
  | 'quesorte';
export const REACTIONS: readonly { id: ReactionId; emoji: string; label: string }[] = [
  { id: 'masbah', emoji: '😮', label: 'Mas bah!' },
  { id: 'barbaridade', emoji: '😱', label: 'Barbaridade!' },
  { id: 'bemcapaz', emoji: '🙄', label: 'Bem capaz!' },
  { id: 'tri', emoji: '👏', label: 'Tri!' },
  { id: 'barbada', emoji: '😎', label: 'Que barbada!' },
  { id: 'deuprati', emoji: '👋', label: 'Deu pra ti!' },
  { id: 'teacalma', emoji: '🧉', label: 'Te acalma!' },
  { id: 'quesorte', emoji: '🍀', label: 'Bah, que sorte!' },
];

export type SeatPublic =
  | {
      kind: 'human';
      playerId: string;
      name: string;
      avatar: string;
      connected: boolean;
      /** A mesa está jogando por ele (caiu ou estourou o tempo seguidas vezes). */
      away: boolean;
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
  pace: Pace;
  /** Partida avulsa (1) ou série "melhor de X". */
  bestOf: BestOf;
  /** As partidas desta sala contam para o ranking. */
  ranked: boolean;
  hasPassword: boolean;
  /** A senha, só para o anfitrião (para ele poder passar adiante); `null` para os outros. */
  password: string | null;
  capacity: number;
  /** Série em andamento (ou a última, depois do fim); `null` no lobby antes da primeira partida. */
  series: SeriesState | null;
}

export interface JoinResult {
  code: string;
  playerId: string;
  token: string;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_TAKEN'
  | 'GAME_IN_PROGRESS'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_RANKABLE'
  | 'PASSWORD_REQUIRED'
  | 'WRONG_PASSWORD'
  | 'TOO_MANY_ATTEMPTS'
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
  /** Motivo da jogada automática — só `timeout` merece aviso ao jogador. */
  reason: AutoReason | null;
  /** Quem agiu na mudança que gerou esta visão. */
  actorId: string | null;
  /** `Date.now()` do servidor no envio: o cliente corrige o prazo pelo próprio relógio. */
  serverNow: number;
}

/** Quem senta: apelido, avatar e a chave do perfil (dá a identidade estável do ranking). */
export interface ProfilePayload {
  name: string;
  avatar: string;
  profileKey?: string;
}

export interface RoomUpdatePayload {
  rules?: Partial<Rules>;
  turnTimeoutSec?: number | null;
  pace?: Pace;
  bestOf?: BestOf;
  ranked?: boolean;
  /** Texto define a senha; `null` tira. */
  password?: string | null;
}

export interface ClientToServerEvents {
  'room:create': (
    p: ProfilePayload & { settings?: RoomUpdatePayload },
    ack: (r: Ack<JoinResult>) => void,
  ) => void;
  'room:join': (
    p: ProfilePayload & { code: string; token?: string; password?: string },
    ack: (r: Ack<JoinResult>) => void,
  ) => void;
  'room:leave': (ack?: (r: Ack) => void) => void;
  'room:update': (p: RoomUpdatePayload, ack?: (r: Ack) => void) => void;
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
  /** "Voltei": para de jogar por mim. */
  'room:present': (ack?: (r: Ack) => void) => void;
  /** A página ficou visível ou escondida (decide quando mandar notificação). */
  presence: (p: { visible: boolean }) => void;
}

export interface ServerToClientEvents {
  'room:state': (s: RoomState) => void;
  'room:kicked': () => void;
  /** O mesmo jogador entrou por outra aba ou aparelho: esta conexão sai. */
  'room:replaced': () => void;
  'game:view': (m: ViewMessage) => void;
  'game:reaction': (r: { playerId: string; reaction: ReactionId; at: number }) => void;
}

/** Mensagem do cliente no WebSocket: evento, dados e, se quer resposta, um id. */
export interface WireToServer {
  e: keyof ClientToServerEvents;
  d?: unknown;
  id?: number;
}

/** Mensagem do servidor: um evento, ou a resposta a um pedido com id. */
export type WireToClient = { e: keyof ServerToClientEvents; d?: unknown } | { id: number; r: Ack<object> };

/** Códigos de fechamento do WebSocket (4000–4999 são da aplicação). */
export const WS_CLOSE = {
  /** Outra aba ou aparelho assumiu o assento: não reconectar. */
  replaced: 4001,
  kicked: 4002,
  left: 4003,
  /** A sala acabou (ociosa, sem ninguém). */
  gone: 4004,
  tooManyAttempts: 4029,
  badOrigin: 4403,
} as const;

/** Pedido de "ping" que o servidor responde sem acordar a sala (mantém a conexão viva). */
export const WS_PING = 'ping';
export const WS_PONG = 'pong';
