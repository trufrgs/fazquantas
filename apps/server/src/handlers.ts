import type { Ack, ClientToServerEvents, ProtocolError } from '@fodinha/engine';
import type { RateLimitOptions } from './config';
import { fail, MESSAGES, ProtocolFailure } from './errors';
import type { Logger } from './logger';
import { TokenBucket } from './rate-limit';
import type { Room } from './room';
import type { RoomManager } from './rooms';
import type { FodinhaSocket } from './types';
import {
  addBotSchema,
  createRoomSchema,
  gameActionSchema,
  joinRoomSchema,
  parsePayload,
  reactSchema,
  removeSeatSchema,
  setBotSchema,
  updateRoomSchema,
} from './validation';

export interface HandlerContext {
  rooms: RoomManager;
  logger: Logger;
  now(): number;
  rateLimit: RateLimitOptions;
}

type AckFn = (response: Ack) => void;
/** O que chega do cliente não é confiável: os argumentos entram como `unknown`. */
type RawListener = (...args: unknown[]) => void;

const RATE_LIMITED: Ack = {
  ok: false,
  error: { code: 'RATE_LIMITED', message: MESSAGES.rateLimited },
};

/** Separa payload e ack: quando o cliente pede resposta, o ack é sempre o último argumento. */
export function splitArgs(args: readonly unknown[]): { payload: unknown; ack: AckFn | null } {
  const last = args[args.length - 1];
  if (typeof last === 'function') {
    return { payload: args.length > 1 ? args[0] : undefined, ack: last as AckFn };
  }
  return { payload: args[0], ack: null };
}

function safeAck(ack: AckFn | null, response: Ack, logger: Logger): void {
  if (!ack) return;
  try {
    ack(response);
  } catch (error) {
    logger.warn('falha ao responder ack', error);
  }
}

export function registerHandlers(socket: FodinhaSocket, ctx: HandlerContext): void {
  const { rooms, logger } = ctx;
  socket.data.roomCode = null;
  socket.data.playerId = null;

  const currentRoom = (): Room | undefined => {
    const code = socket.data.roomCode;
    return code ? rooms.get(code) : undefined;
  };

  const membership = (): { room: Room; playerId: string } => {
    const room = currentRoom();
    const playerId = socket.data.playerId;
    if (!room || !playerId || !room.isBound(playerId, socket)) {
      throw fail('NOT_IN_ROOM', MESSAGES.notInRoom);
    }
    return { room, playerId };
  };

  /** Um socket fica em uma sala só: entrar em outra é sair desta (como `room:leave`). */
  const leaveCurrentRoom = (): void => {
    const room = currentRoom();
    const playerId = socket.data.playerId;
    if (room && playerId && room.isBound(playerId, socket)) room.leave(playerId);
    socket.data.roomCode = null;
    socket.data.playerId = null;
  };

  const toProtocolError = (error: unknown, event: string): ProtocolError => {
    if (error instanceof ProtocolFailure) return error.toProtocolError();
    logger.error(`erro inesperado em ${event}`, error);
    return { code: 'INTERNAL_ERROR', message: MESSAGES.internal };
  };

  /** Registra um evento: separa o ack, roda, e responde `{ ok: true, ... }` ou o erro. */
  const handle = (event: keyof ClientToServerEvents, run: (payload: unknown) => object | void) => {
    const listener: RawListener = (...args) => {
      const { payload, ack } = splitArgs(args);
      let response: Ack;
      try {
        response = { ok: true, ...(run(payload) ?? {}) };
      } catch (error) {
        response = { ok: false, error: toProtocolError(error, event) };
      }
      safeAck(ack, response, logger);
    };
    socket.on(event, listener);
  };

  // Limite de taxa por socket, antes de qualquer evento (inclusive os desconhecidos).
  const bucket = new TokenBucket(ctx.rateLimit.burst, ctx.rateLimit.perSecond, ctx.now);
  socket.use((packet, next) => {
    if (bucket.take()) {
      next();
      return;
    }
    const last: unknown = packet[packet.length - 1];
    if (typeof last === 'function') safeAck(last as AckFn, RATE_LIMITED, logger);
    // Sem next(): a mensagem é descartada.
  });

  // O socket.io já põe um ouvinte vazio (um "error" vindo do cliente não derruba nada); aqui só
  // registramos erros de verdade do lado do servidor. O que o cliente manda nunca é um `Error`.
  socket.on('error', (error: unknown) => {
    if (error instanceof Error) logger.warn(`socket ${socket.id}: ${error.message}`);
  });

  socket.on('disconnect', () => {
    currentRoom()?.handleDisconnect(socket);
  });

  handle('room:create', (payload) => {
    const profile = parsePayload(createRoomSchema, payload);
    // Cria antes de sair da sala atual: se o servidor estiver lotado, ninguém perde o assento.
    const room = rooms.create();
    try {
      leaveCurrentRoom();
      return room.addHuman(socket, profile);
    } catch (error) {
      rooms.remove(room, 'falha ao criar');
      throw error;
    }
  });

  handle('room:join', (payload) => {
    const { code, token, ...profile } = parsePayload(joinRoomSchema, payload);
    const room = rooms.get(code);
    if (!room) throw fail('ROOM_NOT_FOUND', MESSAGES.roomNotFound);
    const boundId = socket.data.playerId;
    const here =
      socket.data.roomCode === room.code && boundId && room.isBound(boundId, socket)
        ? boundId
        : null;
    // Token válido = mesmo assento (mesmo no meio da partida); já sentado aqui = idempotente.
    const seatId = (token ? room.playerIdForToken(token) : null) ?? here;
    if (seatId) {
      if (seatId !== here) leaveCurrentRoom();
      return room.reconnect(seatId, socket, profile);
    }
    room.assertCanJoin();
    leaveCurrentRoom();
    return room.addHuman(socket, profile);
  });

  handle('room:leave', () => {
    leaveCurrentRoom();
  });

  handle('room:update', (payload) => {
    const patch = parsePayload(updateRoomSchema, payload);
    const { room, playerId } = membership();
    room.update(playerId, patch);
  });

  handle('room:addBot', (payload) => {
    const { difficulty } = parsePayload(addBotSchema, payload);
    const { room, playerId } = membership();
    room.addBot(playerId, difficulty);
  });

  handle('room:setBot', (payload) => {
    const target = parsePayload(setBotSchema, payload);
    const { room, playerId } = membership();
    room.setBot(playerId, target.playerId, target.difficulty);
  });

  handle('room:removeSeat', (payload) => {
    const target = parsePayload(removeSeatSchema, payload);
    const { room, playerId } = membership();
    room.removeSeat(playerId, target.playerId);
  });

  handle('room:start', () => {
    const { room, playerId } = membership();
    room.start(playerId);
  });

  handle('room:rematch', () => {
    const { room, playerId } = membership();
    room.rematch(playerId);
  });

  handle('room:lobby', () => {
    const { room, playerId } = membership();
    room.backToLobby(playerId);
  });

  handle('game:action', (payload) => {
    const { action } = parsePayload(gameActionSchema, payload);
    const { room, playerId } = membership();
    room.act(playerId, action);
  });

  handle('game:react', (payload) => {
    const { reaction } = parsePayload(reactSchema, payload);
    const { room, playerId } = membership();
    room.react(playerId, reaction);
  });
}
