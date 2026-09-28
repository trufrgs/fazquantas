import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@fodinha/engine';
import { fail, MESSAGES } from './errors';
import { Room, type RoomDeps } from './room';

export interface RoomManagerDeps extends Omit<RoomDeps, 'onEmpty'> {
  /** Sala sem humano conectado por mais que isso some na limpeza. */
  idleRoomMs: number;
  maxRooms: number;
}

const MAX_CODE_ATTEMPTS = 200;

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly deps: RoomManagerDeps) {}

  get size(): number {
    return this.rooms.size;
  }

  /** Aceita o código em minúsculas. */
  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }

  /** Sala nova e vazia, com código único entre as ativas. */
  create(): Room {
    if (this.rooms.size >= this.deps.maxRooms) throw fail('SERVER_FULL', MESSAGES.serverFull);
    const code = this.newCode();
    const room = new Room(code, { ...this.deps, onEmpty: (r) => this.remove(r, 'sem jogadores') });
    this.rooms.set(code, room);
    this.deps.logger.info(`[${code}] sala criada (${this.rooms.size} ativas)`);
    return room;
  }

  remove(room: Room, reason = 'removida'): void {
    if (this.rooms.get(room.code) === room) {
      this.rooms.delete(room.code);
      this.deps.logger.info(`[${room.code}] sala encerrada: ${reason} (${this.rooms.size} ativas)`);
    }
    room.dispose();
  }

  /** Remove salas sem nenhum humano conectado há mais de `idleRoomMs`. Devolve os códigos. */
  cleanup(now = this.deps.now()): string[] {
    const removed: string[] = [];
    for (const room of this.list()) {
      if (room.isIdleFor(this.deps.idleRoomMs, now)) {
        this.remove(room, 'ociosa');
        removed.push(room.code);
      }
    }
    return removed;
  }

  disposeAll(): void {
    for (const room of this.list()) this.remove(room, 'servidor desligando');
  }

  private newCode(): string {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        const index = Math.floor(this.deps.random() * ROOM_CODE_ALPHABET.length);
        code += ROOM_CODE_ALPHABET[Math.min(index, ROOM_CODE_ALPHABET.length - 1)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw fail('SERVER_FULL', MESSAGES.serverFull);
  }
}
