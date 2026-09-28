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
  /**
   * Identidade da partida em curso: muda a cada partida nova (inclusive revanche online, em que a
   * conexão é a mesma e o `seq` recomeça do zero). A mesa remonta por ela.
   */
  gameKey: number;
  /** Aviso curto (ex.: o tempo acabou e o servidor jogou por ti). */
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
let counter = 0;

/** Partida nova: o `seq` voltou para trás ou a primeira rodada recomeçou. */
function isNewGame(prev: PlayerView | null, next: PlayerView): boolean {
  return prev !== null && (next.seq < prev.seq || (next.roundNumber === 1 && prev.roundNumber > 1));
}

export const useGame = create<GameState>((set, get) => ({
  conn: null,
  gameKey: 0,
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
    set({ conn, gameKey: ++counter, update: conn.current(), prev: null, seats: conn.seats(), reactions: [] });
    unsubscribe = [
      conn.subscribe((u) => {
        const prev = get().update?.view ?? null;
        const fresh = isNewGame(prev, u.view);
        set({
          prev: fresh ? null : prev,
          update: u,
          seats: conn.seats(),
          ...(fresh ? { gameKey: ++counter } : {}),
        });
        if (u.reason === 'timeout' && u.actorId === conn.youId) {
          set({ notice: { key: ++counter, text: 'Acabou o tempo, jogamos por ti.' } });
        }
      }),
      conn.onReaction((r) => {
        const key = ++counter;
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
