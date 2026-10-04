import type { PlayerView, ZoeiraNaMesa } from '@fodinha/engine';
import { create } from 'zustand';
import type { GameConnection, ReactionEvent, SeatInfo, ViewUpdate } from '../lib/connection';

export interface LiveReaction extends ReactionEvent {
  key: number;
  /** Grito (segurou a frase): o balão cresce e a vogal estica. */
  forca?: 1 | 2 | 3;
}

/** Zoeira na mesa (tiro, cutucão, carimbo, pancada, virada), por alguns segundos. */
export interface LiveZoeira {
  key: number;
  z: ZoeiraNaMesa;
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
  zoeiras: LiveZoeira[];
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
  zoeiras: [],
  attach: (conn) => {
    get().detach();
    set({ conn, gameKey: ++counter, update: conn.current(), prev: null, seats: conn.seats(), reactions: [], zoeiras: [] });
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
      conn.onZoeira?.((z) => {
        const key = ++counter;
        // O grito é uma frase mais forte: vai para os balões, maior.
        if (z.tipo === 'grito') {
          set({ reactions: [...get().reactions, { playerId: z.de, reaction: z.reaction, key, forca: z.forca }] });
          window.setTimeout(() => set({ reactions: get().reactions.filter((x) => x.key !== key) }), 2600 + z.forca * 400);
          return;
        }
        set({ zoeiras: [...get().zoeiras, { key, z }] });
        window.setTimeout(() => set({ zoeiras: get().zoeiras.filter((x) => x.key !== key) }), 4000);
      }) ?? (() => undefined),
    ];
  },
  detach: () => {
    for (const u of unsubscribe) u();
    unsubscribe = [];
    get().conn?.dispose();
    set({ conn: null, update: null, prev: null, seats: [], reactions: [], zoeiras: [], notice: null });
  },
}));
