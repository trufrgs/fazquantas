import type { ClientToServerEvents, ServerToClientEvents } from '@fodinha/engine';
import type { Server, Socket } from 'socket.io';

/** Uma instância só, sem adapter de cluster: nenhum evento entre servidores. */
export type InterServerEvents = Record<string, never>;

export interface SocketData {
  /** Código da sala em que este socket está sentado, ou `null`. */
  roomCode: string | null;
  playerId: string | null;
}

export type FodinhaIO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type FodinhaSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
