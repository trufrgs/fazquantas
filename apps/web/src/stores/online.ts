import type {
  Ack,
  BotDifficulty,
  ClientAction,
  ClientToServerEvents,
  JoinResult,
  ReactionId,
  RoomState,
  Rules,
  ServerToClientEvents,
} from '@fodinha/engine';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { GameConnection, ReactionEvent, SeatInfo, ViewUpdate } from '../lib/connection';
import { serverUrl } from '../lib/platform';
import { storage } from '../lib/storage';
import { useApp } from './app';
import { useGame } from './game';
import { displayName, useSettings } from './settings';

type FodinhaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SESSION_KEY = 'fodinha:sala';

interface Session {
  code: string;
  token: string;
  playerId: string;
}

export function savedSession(): Session | null {
  return storage.get<Session>(SESSION_KEY);
}

/** A mesa online vista como uma `GameConnection` (igual à local). */
class OnlineConnection implements GameConnection {
  readonly kind = 'online' as const;
  private last: ViewUpdate | null = null;
  private readonly listeners = new Set<(u: ViewUpdate) => void>();
  private readonly reactionListeners = new Set<(r: ReactionEvent) => void>();

  constructor(
    readonly youId: string,
    private readonly socket: FodinhaSocket,
    private readonly getRoom: () => RoomState | null,
  ) {}

  push(u: ViewUpdate) {
    this.last = u;
    for (const l of [...this.listeners]) l(u);
  }

  pushReaction(r: ReactionEvent) {
    for (const l of [...this.reactionListeners]) l(r);
  }

  current() {
    return this.last;
  }

  seats(): SeatInfo[] {
    return (this.getRoom()?.seats ?? []).map((s) => ({
      id: s.playerId,
      name: s.name,
      avatar: s.avatar,
      kind: s.kind,
      difficulty: s.kind === 'bot' ? s.difficulty : undefined,
      connected: s.kind === 'bot' ? true : s.connected,
    }));
  }

  subscribe(listener: (u: ViewUpdate) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onReaction(listener: (r: ReactionEvent) => void) {
    this.reactionListeners.add(listener);
    return () => this.reactionListeners.delete(listener);
  }

  act(action: ClientAction): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve('Sem resposta do servidor. Confira sua conexão.'), 8000);
      this.socket.emit('game:action', { action }, (r: Ack) => {
        window.clearTimeout(timer);
        resolve(r.ok ? null : r.error.message);
      });
    });
  }

  react(reaction: ReactionId) {
    this.socket.emit('game:react', { reaction });
  }

  dispose() {
    this.listeners.clear();
    this.reactionListeners.clear();
  }
}

export type OnlineStatus = 'idle' | 'connecting' | 'online' | 'reconnecting';

interface OnlineState {
  status: OnlineStatus;
  error: string | null;
  room: RoomState | null;
  kicked: boolean;
  create: () => Promise<boolean>;
  join: (code: string, useToken?: boolean) => Promise<boolean>;
  leave: () => void;
  update: (patch: { rules?: Partial<Rules>; turnTimeoutSec?: number | null }) => void;
  addBot: (difficulty: BotDifficulty) => void;
  setBot: (playerId: string, difficulty: BotDifficulty) => void;
  removeSeat: (playerId: string) => void;
  start: () => Promise<string | null>;
  rematch: () => void;
  clearError: () => void;
}

let socket: FodinhaSocket | null = null;
let connection: OnlineConnection | null = null;

function emitAck<T extends object>(fn: (ack: (r: Ack<T>) => void) => void, timeoutMs = 8000): Promise<Ack<T>> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(
      () => resolve({ ok: false, error: { code: 'TIMEOUT', message: 'O servidor não respondeu. Tente de novo.' } }),
      timeoutMs,
    );
    fn((r) => {
      window.clearTimeout(timer);
      resolve(r);
    });
  });
}

function ensureSocket(): FodinhaSocket {
  if (socket) return socket;
  const s: FodinhaSocket = io(serverUrl(), { transports: ['websocket', 'polling'], autoConnect: true, reconnectionDelayMax: 4000 });
  socket = s;

  s.on('connect', () => {
    const st = useOnline.getState();
    if (st.status === 'reconnecting' && st.room) {
      void st.join(st.room.code, true);
    } else if (st.status === 'connecting') {
      useOnline.setState({ status: 'online' });
    }
  });
  s.on('disconnect', () => {
    if (useOnline.getState().room) useOnline.setState({ status: 'reconnecting' });
  });
  s.on('connect_error', () => {
    const st = useOnline.getState();
    if (st.status === 'connecting') {
      useOnline.setState({ error: 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.' });
    }
  });
  s.on('room:state', (room) => {
    useOnline.setState({ room, status: 'online' });
    if (room.status !== 'lobby' && connection && useApp.getState().screen === 'lobby') {
      useApp.getState().reset('game');
    }
    if (room.status === 'lobby' && useApp.getState().screen === 'game' && useGame.getState().conn?.kind === 'online') {
      useApp.getState().reset('lobby');
    }
  });
  s.on('game:view', (msg) => {
    const room = useOnline.getState().room;
    if (!room) return;
    if (!connection || connection.youId !== room.youId) {
      connection = new OnlineConnection(room.youId, s, () => useOnline.getState().room);
      connection.push(msg);
      useGame.getState().attach(connection);
    } else {
      connection.push(msg);
    }
    if (useApp.getState().screen === 'lobby' || useApp.getState().screen === 'online') useApp.getState().reset('game');
  });
  s.on('game:reaction', (r) => connection?.pushReaction({ playerId: r.playerId, reaction: r.reaction }));
  s.on('room:kicked', () => {
    storage.remove(SESSION_KEY);
    resetOnline();
    useOnline.setState({ kicked: true, error: 'O anfitrião tirou você da sala.' });
    useApp.getState().reset('online');
  });
  return s;
}

function resetOnline() {
  if (useGame.getState().conn?.kind === 'online') useGame.getState().detach();
  connection = null;
  useOnline.setState({ room: null, status: 'idle' });
}

function profile() {
  const s = useSettings.getState();
  return { name: displayName(s.name).slice(0, 16), avatar: s.avatar };
}

export const useOnline = create<OnlineState>((set, get) => ({
  status: 'idle',
  error: null,
  room: null,
  kicked: false,

  create: async () => {
    set({ status: 'connecting', error: null, kicked: false });
    const s = ensureSocket();
    const r = await emitAck<JoinResult>((ack) => s.emit('room:create', profile(), ack));
    if (!r.ok) {
      set({ status: 'idle', error: r.error.message });
      return false;
    }
    storage.set(SESSION_KEY, { code: r.code, token: r.token, playerId: r.playerId });
    const settings = useSettings.getState();
    s.emit('room:update', { rules: settings.rules });
    set({ status: 'online' });
    return true;
  },

  join: async (rawCode, useToken = true) => {
    const code = rawCode.trim().toUpperCase();
    set({ status: get().status === 'reconnecting' ? 'reconnecting' : 'connecting', error: null, kicked: false });
    const s = ensureSocket();
    const session = savedSession();
    const token = useToken && session?.code === code ? session.token : undefined;
    const r = await emitAck<JoinResult>((ack) => s.emit('room:join', { code, ...profile(), token }, ack));
    if (!r.ok) {
      if (session?.code === code) storage.remove(SESSION_KEY);
      set({ status: 'idle', error: r.error.message });
      return false;
    }
    storage.set(SESSION_KEY, { code: r.code, token: r.token, playerId: r.playerId });
    set({ status: 'online' });
    return true;
  },

  leave: () => {
    socket?.emit('room:leave');
    storage.remove(SESSION_KEY);
    resetOnline();
  },

  update: (patch) => socket?.emit('room:update', patch),
  addBot: (difficulty) => socket?.emit('room:addBot', { difficulty }),
  setBot: (playerId, difficulty) => socket?.emit('room:setBot', { playerId, difficulty }),
  removeSeat: (playerId) => socket?.emit('room:removeSeat', { playerId }),
  start: async () => {
    if (!socket) return 'Sem conexão.';
    const r = await emitAck<object>((ack) => socket!.emit('room:start', ack));
    return r.ok ? null : r.error.message;
  },
  rematch: () => socket?.emit('room:rematch'),
  clearError: () => set({ error: null, kicked: false }),
}));

export function isHost(): boolean {
  const room = useOnline.getState().room;
  return !!room && room.hostId === room.youId;
}
