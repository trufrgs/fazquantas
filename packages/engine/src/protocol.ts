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
import type { Zoeira, ZoeiraNaMesa } from './zoeira';

export const PROTOCOL_VERSION = 2;
export const ROOM_CAPACITY = 8;
/**
 * Quem entra com a mesa cheia ou com a partida rolando senta na plateia: assiste, conversa e abre a
 * câmera (que aparece em preto e branco), e pede para jogar a próxima (pedido do Thomas em 02/10/2026).
 */
export const PLATEIA_CAPACITY = 6;
export const ROOM_CODE_LENGTH = 4;
/** Sem I, O, 0 e 1 para não confundir ao ditar o código. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const NAME_MAX_LENGTH = 16;
/** Segundos por jogada; `null` = sem limite (sempre por último na lista). */
export const TURN_TIMEOUT_OPTIONS = [30, 60, 120, 180, 300, 3600, 21600, 43200, null] as const;
/**
 * A partir de 1 h por jogada (ou sem limite) a sala é assíncrona: quem fecha o jogo não perde a
 * vez nem vira bot; a vez espera o prazo e o aviso chega por push.
 */
export const ASYNC_TURN_SEC = 3600;

export function isAsyncTurn(turnTimeoutSec: number | null): boolean {
  return turnTimeoutSec === null || turnTimeoutSec >= ASYNC_TURN_SEC;
}
export const DEFAULT_TURN_TIMEOUT_SEC = 60;
export const PASSWORD_MAX_LENGTH = 24;

/** Ritmo da mesa: quanto os bots pensam e quanto a vaza e o resumo da rodada ficam na tela. */
export type Pace = 'calma' | 'normal' | 'rapida';
export const PACES: readonly { id: Pace; label: string; description: string; multiplier: number }[] = [
  { id: 'calma', label: 'Calma', description: 'Mais tempo para ver cada mão.', multiplier: 0.7 },
  { id: 'normal', label: 'Normal', description: 'O ritmo de sempre.', multiplier: 1 },
  { id: 'rapida', label: 'Ligeira', description: 'Para quem já conhece o jogo.', multiplier: 1.5 },
];
export const DEFAULT_PACE: Pace = 'normal';

export function paceMultiplier(pace: Pace): number {
  return PACES.find((p) => p.id === pace)?.multiplier ?? 1;
}

/**
 * "Acelerar até o fim": quando só sobram bots na mesa, o resto da partida corre este tanto mais rápido,
 * em câmera rápida, e o vencedor sai em poucos segundos (pedido do Thomas em 30/09/2026).
 */
export const ATE_O_FIM = 40;

/**
 * As cartas que podem "ser galo", da mais baixa para a mais alta: "2 é galo, hein!" combina com a mesa
 * de deixar essa carta passar (o Igor, 29/09/2026). `nome` é como se diz na mesa.
 */
export const GALOS = [
  { valor: '4', nome: '4' },
  { valor: '5', nome: '5' },
  { valor: '6', nome: '6' },
  { valor: '7', nome: '7' },
  { valor: '10', nome: '10' },
  { valor: '11', nome: '11' },
  { valor: '12', nome: '12' },
  { valor: '1', nome: 'Ás' },
  { valor: '2', nome: '2' },
  { valor: '3', nome: '3' },
] as const;
export type Galo = (typeof GALOS)[number]['valor'];

/**
 * Reações rápidas da mesa, na fala de quem joga. O quadro (`FRASES_DO_QUADRO`) traz as que a turma usa
 * de verdade (pedidos do Igor e do Thomas, 29 e 30/09/2026): o "é galo" para combinar de deixar uma
 * carta passar, o cagão para quem não arrisca, a cumadrera para quem emparda de propósito, o guloso para
 * quem faz mais do que cantou, e os desabafos. As outras continuam valendo (os bots ainda falam, e quem
 * está numa versão antiga do app também manda).
 */
export type ReactionId =
  | 'masbah'
  | 'barbaridade'
  | 'tri'
  | 'quesorte'
  | 'bemcapaz'
  | 'barbada'
  | 'teacalma'
  | 'deuprati'
  | 'cagao'
  | 'cumadrera'
  | 'chinelao'
  | 'chorao'
  | 'guloso'
  | 'fezTodas'
  | 'queMerda'
  | 'fdp'
  | 'galo'
  | `galo-${Galo}`;
export const REACTIONS: readonly { id: ReactionId; emoji: string; label: string }[] = [
  { id: 'galo', emoji: '🐓', label: 'É galo, hein!' },
  { id: 'cagao', emoji: '💩', label: 'Cagão!' },
  { id: 'cumadrera', emoji: '🤝', label: 'Cumadrera!' },
  { id: 'guloso', emoji: '🐷', label: 'Guloso!' },
  { id: 'fezTodas', emoji: '🏆', label: 'Parabéns, fez todas!' },
  { id: 'queMerda', emoji: '🤦', label: 'Mas que merda, tchê!' },
  { id: 'fdp', emoji: '🤬', label: 'Filha da puta!' },
  { id: 'masbah', emoji: '😮', label: 'Mas bah!' },
  { id: 'barbaridade', emoji: '😱', label: 'Barbaridade!' },
  { id: 'tri', emoji: '👏', label: 'Tri!' },
  { id: 'quesorte', emoji: '🍀', label: 'Bah, que sorte!' },
  { id: 'bemcapaz', emoji: '🙄', label: 'Bem capaz!' },
  { id: 'barbada', emoji: '😎', label: 'Que barbada!' },
  { id: 'teacalma', emoji: '🧉', label: 'Te acalma!' },
  { id: 'deuprati', emoji: '👋', label: 'Deu pra ti!' },
  { id: 'chinelao', emoji: '🩴', label: 'Chinelão!' },
  { id: 'chorao', emoji: '😭', label: 'Chorão!' },
  ...GALOS.map((g) => ({ id: `galo-${g.valor}` as const, emoji: '🐓', label: `${g.nome} é galo, hein!` })),
];

/**
 * O quadro de frases da mesa, três fileiras de quatro: as que a turma manda (e "Mas bah!" para fechar
 * a segunda fileira) e, na terceira, as que o Thomas trouxe de volta em 30/09/2026.
 */
export const FRASES_DO_QUADRO: readonly ReactionId[] = [
  'galo', 'cagao', 'cumadrera', 'guloso',
  'fezTodas', 'queMerda', 'fdp', 'masbah',
  'chinelao', 'chorao', 'deuprati', 'barbada',
];

/** As favoritas de quem nunca escolheu (ficam na mesa a um toque). */
export const FAVORITAS_PADRAO: readonly ReactionId[] = ['galo', 'cagao', 'masbah'];

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

/** Quem está na plateia: assiste sem jogar e pode pedir para entrar na próxima partida. */
export interface PlateiaPublic {
  playerId: string;
  name: string;
  avatar: string;
  connected: boolean;
  /** Pediu para jogar a próxima. */
  quer: boolean;
  /** Um patrão aceitou: senta na próxima partida (se tiver lugar). */
  aceito: boolean;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

/** Um servidor ICE (STUN/TURN) para ligar o áudio da conversa por voz, no formato do `RTCIceServer`. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** O que cada um abriu para a mesa: microfone e câmera (só aparece quem abriu alguma coisa). */
export interface MidiaNaSala {
  playerId: string;
  mic: boolean;
  camera: boolean;
}

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
  /** A senha, só para os patrões (para eles poderem passar adiante); `null` para os outros. */
  password: string | null;
  capacity: number;
  /** Série em andamento (ou a última, depois do fim); `null` no lobby antes da primeira partida. */
  series: SeriesState | null;
  /** Só sobraram bots e alguém pediu para acelerar até o fim (servidores de antes de 30/09/2026 não mandam). */
  acelerando?: boolean;
  /** Quem abriu microfone ou câmera para a mesa (servidores de antes de 30/09/2026 não mandam). */
  midias?: MidiaNaSala[];
  /**
   * Depois do fim da partida: quem já pediu a revanche (ou a próxima da série). Servidores de antes
   * de 29/09/2026 não mandam.
   */
  revanche?: string[];
  /**
   * Os patrões da mesa (quem manda nela): o anfitrião primeiro, depois quem ele fez patrão.
   * Servidores de antes de 02/10/2026 não mandam (o patrão é só o `hostId`).
   */
  patroes?: string[];
  /** Quem assiste sem jogar (servidores de antes de 02/10/2026 não mandam). */
  plateia?: PlateiaPublic[];
  plateiaCapacity?: number;
}

export interface JoinResult {
  code: string;
  playerId: string;
  token: string;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_GONE'
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
  | 'BLOCKED'
  | 'GAME_ERROR'
  /** Volta automática: o lugar está sendo usado agora por outra conexão viva (outro aparelho ou aba). */
  | 'SEAT_TAKEN'
  /** Volta automática com um token que não vale mais (saiu, demorou demais para voltar). */
  | 'SEAT_LOST'
  /** Volta automática de quem o anfitrião tirou da sala enquanto estava sem conexão. */
  | 'KICKED'
  /** Lugar novo com um apelido guardado por outra pessoa: entra com o PIN ou escolhe outro apelido. */
  | 'NICK_RESERVED';

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
  /**
   * Identidade desta aba (aleatória, guardada só nela). A volta automática da mesma aba sempre assume
   * o lugar (a conexão velha dela morreu); de outra aba ou aparelho, não toma de uma conexão viva.
   */
  aba?: string;
  /**
   * A página está à vista ao entrar (a volta automática também acontece com o app em segundo plano).
   * Sem o campo, conta como à vista. A coroa só volta para quem criou a sala quando ele olha a mesa.
   */
  visible?: boolean;
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
    /**
     * `auto`: a volta que o app faz sozinho (reconexão, abrir o app). Ela nunca senta como gente nova
     * e não toma o lugar de uma conexão viva; quem toca para entrar (sem `auto`) assume o lugar.
     */
    p: ProfilePayload & { code: string; token?: string; password?: string; auto?: boolean },
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
  /**
   * Depois do fim: o anfitrião puxa a revanche na hora; os outros pedem, e quando todo mundo que está
   * olhando a mesa pediu, ela começa sozinha.
   */
  'room:rematch': (ack?: (r: Ack) => void) => void;
  /** Anfitrião, depois do fim de jogo: volta a sala para o lobby (trocar assentos, regras). */
  'room:lobby': (ack?: (r: Ack) => void) => void;
  'game:action': (p: { action: ClientAction }, ack?: (r: Ack) => void) => void;
  'game:react': (p: { reaction: ReactionId }) => void;
  /** Só sobraram bots na mesa: o resto da partida corre em câmera rápida (`ATE_O_FIM`). */
  'game:acelerar': (ack?: (r: Ack) => void) => void;
  /**
   * Os servidores ICE (STUN e, quando houver, TURN) para o áudio e o vídeo se ligarem direto entre os
   * aparelhos (nada disso passa pelo servidor do jogo).
   */
  'midia:ice': (ack?: (r: Ack<{ iceServers: IceServer[] }>) => void) => void;
  /** O que este jogador abriu para a mesa agora (os dois desligados: não aparece mais). */
  'midia:estado': (p: { mic: boolean; camera: boolean }, ack?: (r: Ack) => void) => void;
  /** O sinal do WebRTC (oferta, resposta, renegociação) para outro jogador da sala: o servidor só repassa. */
  'midia:sinal': (p: { para: string; dados: unknown }) => void;
  /** "Voltei": para de jogar por mim. */
  'room:present': (ack?: (r: Ack) => void) => void;
  /** Zoar alguém (atirar, cutucar, carimbar, gritar, bater a carta, virar a mesa): só enfeite. */
  'game:zoar': (p: Zoeira, ack?: (r: Ack) => void) => void;
  /** Quem está na plateia pede (ou desiste de) jogar a próxima. */
  'room:querJogar': (p: { quer: boolean }, ack?: (r: Ack) => void) => void;
  /** Patrão: aceita (ou recusa) o pedido de quem está na plateia. */
  'room:aceitar': (p: { playerId: string; aceito: boolean }, ack?: (r: Ack) => void) => void;
  /** Patrão: faz alguém patrão, ou tira (a si mesmo também, se ficar outro patrão). */
  'room:patrao': (p: { playerId: string; patrao: boolean }, ack?: (r: Ack) => void) => void;
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
  /** A zoeira que alguém mandou para a mesa. */
  'game:zoeira': (z: ZoeiraNaMesa) => void;
  /** O sinal do WebRTC de outro jogador da sala (microfone e câmera). */
  'midia:sinal': (p: { de: string; dados: unknown }) => void;
  /** Recado da administração do jogo para quem está na sala (ex.: "reinício em 5 min"). */
  'room:notice': (n: { text: string; at: number }) => void;
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
  /** A administração do jogo encerrou a sala. */
  closedByAdmin: 4005,
  /** Criar sala recusado: muitas salas criadas deste endereço agora (o motivo vem no texto). */
  rateLimited: 4030,
  /** Criar sala recusado: jogo em manutenção (o recado vem no texto). */
  maintenance: 4031,
  tooManyAttempts: 4029,
  badOrigin: 4403,
} as const;

/** Pedido de "ping" que o servidor responde sem acordar a sala (mantém a conexão viva). */
export const WS_PING = 'ping';
export const WS_PONG = 'pong';
