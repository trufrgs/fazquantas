import type { PlayerView } from '@fodinha/engine';
import { create } from 'zustand';
import type { GameConnection, ReactionEvent, SeatInfo, ViewUpdate } from '../lib/connection';

export interface LiveReaction extends ReactionEvent {
  key: number;
}

export interface Notice {
  key: number;
  text: string;
}

interface GameState {
  conn: GameConnection | null;
  /** Aviso curto (ex.: o tempo acabou e o servidor jogou por você). */
  notice: Notice | null;
  clearNotice: (key: number) => void;
  update: ViewUpdate | null;
  prev: PlayerView | null;
  seats: SeatInfo[];
  reactions: LiveReaction[];
  attach: (conn: GameConnection) => void;
  detach: () => void;
}

let unsubscribe: (() => void)[] = [];
let reactionKey = 0;

export const useGame = create<GameState>((set, get) => ({
  conn: null,
  notice: null,
  clearNotice: (key) => {
    if (get().notice?.key === key) set({ notice: null });
  },
  update: null,
  prev: null,
  seats: [],
  reactions: [],
  attach: (conn) => {
    get().detach();
    set({ conn, update: conn.current(), prev: null, seats: conn.seats(), reactions: [] });
    unsubscribe = [
      conn.subscribe((u) => {
        set({ prev: get().update?.view ?? null, update: u, seats: conn.seats() });
        if (conn.kind === 'online' && u.auto && u.actorId === conn.youId) {
          set({ notice: { key: ++reactionKey, text: 'Tempo esgotado: jogamos por você.' } });
        }
      }),
      conn.onReaction((r) => {
        const key = ++reactionKey;
        set({ reactions: [...get().reactions, { ...r, key }] });
        window.setTimeout(() => set({ reactions: get().reactions.filter((x) => x.key !== key) }), 2600);
      }),
    ];
  },
  detach: () => {
    for (const u of unsubscribe) u();
    unsubscribe = [];
    get().conn?.dispose();
    set({ conn: null, update: null, prev: null, seats: [], reactions: [], notice: null });
  },
}));
