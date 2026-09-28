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
  ViewMessage,
} from '@fodinha/engine';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { GameConnection, ReactionEvent, SeatInfo, ViewUpdate } from '../lib/connection';
import { serverUrl } from '../lib/platform';
import { storage } from '../lib/storage';
import { useApp } from './app';
import { useGame } from './game';
import { useSettings } from './settings';

type FodinhaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SESSION_KEY = 'fodinha:sala';
const ACK_TIMEOUT_MS = 8000;

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
  private seatsFor: RoomState | null = null;
  private seatsCache: SeatInfo[] = [];

  constructor(
    readonly youId: string,
    private readonly socket: FodinhaSocket,
    private readonly getRoom: () => RoomState | null,
  ) {}

  push(msg: ViewMessage) {
    // O prazo vem no relógio do servidor: converte para o relógio deste aparelho.
    const skew = msg.serverNow - Date.now();
    const deadline = msg.view.turnDeadline;
    const view = deadline === null ? msg.view : { ...msg.view, turnDeadline: deadline - skew };
    const u: ViewUpdate = { view, auto: msg.auto, reason: msg.reason ?? null, actorId: msg.actorId };
    this.last = u;
    for (const l of [...this.listeners]) l(u);
  }

  pushReaction(r: ReactionEvent) {
    for (const l of [...this.reactionListeners]) l(r);
  }

  current() {
    return this.last;
  }

  /** Recalcula só quando a sala muda (o `memo` dos assentos depende disso). */
  seats(): SeatInfo[] {
    const room = this.getRoom();
    if (room !== this.seatsFor) {
      this.seatsFor = room;
      this.seatsCache = (room?.seats ?? []).map((s) => ({
        id: s.playerId,
        name: s.name,
        avatar: s.avatar,
        kind: s.kind,
        difficulty: s.kind === 'bot' ? s.difficulty : undefined,
        connected: s.kind === 'bot' ? true : s.connected,
      }));
    }
    return this.seatsCache;
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
    if (!this.socket.connected) return Promise.resolve('Sem conexão com o servidor. Espera reconectar.');
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve('Sem resposta do servidor. Confere a tua conexão.'), ACK_TIMEOUT_MS);
      this.socket.emit('game:action', { action }, (r: Ack) => {
        window.clearTimeout(timer);
        resolve(r.ok ? null : r.error.message);
      });
    });
  }

  react(reaction: ReactionId) {
    if (this.socket.connected) this.socket.emit('game:react', { reaction });
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
  backToLobby: () => void;
  clearError: () => void;
}

let socket: FodinhaSocket | null = null;
let connection: OnlineConnection | null = null;

const NO_ANSWER = { ok: false as const, error: { code: 'TIMEOUT', message: 'O servidor não respondeu. Tenta de novo.' } };
const NO_SERVER = {
  ok: false as const,
  error: { code: 'OFFLINE', message: 'Não deu pra falar com o servidor. Confere a conexão e tenta de novo.' },
};

/** Espera o socket conectar (sem enfileirar mensagens que chegariam atrasadas). */
function whenConnected(s: FodinhaSocket, timeoutMs = ACK_TIMEOUT_MS): Promise<boolean> {
  if (s.connected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      s.off('connect', onConnect);
      resolve(ok);
    };
    const onConnect = () => done(true);
    const timer = window.setTimeout(() => done(false), timeoutMs);
    s.on('connect', onConnect);
  });
}

async function emitAck<T extends object>(fn: (s: FodinhaSocket, ack: (r: Ack<T>) => void) => void): Promise<Ack<T>> {
  const s = ensureSocket();
  if (!(await whenConnected(s))) return NO_SERVER;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(NO_ANSWER), ACK_TIMEOUT_MS);
    fn(s, (r) => {
      window.clearTimeout(timer);
      resolve(r);
    });
  });
}

/** Sai da sala localmente e mostra o motivo na tela "Jogar com a gurizada". */
function dropToOnlineScreen(error: string) {
  storage.remove(SESSION_KEY);
  resetOnline();
  useOnline.setState({ error });
  if (useApp.getState().screen !== 'home') useApp.getState().reset('online');
}

function ensureSocket(): FodinhaSocket {
  if (socket) return socket;
  const s: FodinhaSocket = io(serverUrl(), {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnectionDelayMax: 4000,
  });
  socket = s;

  s.on('connect', () => {
    const st = useOnline.getState();
    if (st.status === 'reconnecting' && st.room) {
      const code = st.room.code;
      void st.join(code, true).then((ok) => {
        // A sala sumiu (servidor reiniciou, ficou ociosa…) ou o lugar foi perdido.
        if (!ok) dropToOnlineScreen(useOnline.getState().error ?? `A sala ${code} não existe mais.`);
      });
    }
  });
  s.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      // O servidor derrubou este socket: o mesmo jogador entrou por outro aparelho ou aba.
      // Esse socket não reconecta sozinho — descarta para o próximo uso abrir outro.
      s.removeAllListeners();
      socket = null;
      dropToOnlineScreen('Tu abriu essa sala em outro aparelho ou aba. Segue por lá.');
      return;
    }
    if (useOnline.getState().room) useOnline.setState({ status: 'reconnecting' });
  });
  s.on('room:state', (room) => {
    useOnline.setState({ room, status: 'online' });
    const app = useApp.getState();
    if (room.status !== 'lobby' && connection && app.screen === 'lobby') app.reset('game');
    if (room.status === 'lobby' && useGame.getState().conn?.kind === 'online') {
      // Voltou para a sala: a partida anterior sai da mesa (a próxima chega do zero).
      useGame.getState().detach();
      connection = null;
      if (app.screen === 'game') app.reset('lobby');
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
    const screen = useApp.getState().screen;
    if (screen === 'lobby' || screen === 'online') useApp.getState().reset('game');
  });
  s.on('game:reaction', (r) => connection?.pushReaction({ playerId: r.playerId, reaction: r.reaction }));
  s.on('room:kicked', () => {
    dropToOnlineScreen('O anfitrião te tirou da sala.');
    useOnline.setState({ kicked: true });
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
  // Online, sem apelido, o nome é "Jogador" (o servidor numera se repetir).
  return { name: (s.name.trim() || 'Jogador').slice(0, 16), avatar: s.avatar };
}

export const useOnline = create<OnlineState>((set, get) => ({
  status: 'idle',
  error: null,
  room: null,
  kicked: false,

  create: async () => {
    set({ status: 'connecting', error: null, kicked: false });
    const r = await emitAck<JoinResult>((s, ack) => s.emit('room:create', profile(), ack));
    if (!r.ok) {
      set({ status: 'idle', error: r.error.message });
      return false;
    }
    storage.set(SESSION_KEY, { code: r.code, token: r.token, playerId: r.playerId });
    socket?.emit('room:update', { rules: useSettings.getState().rules });
    set({ status: 'online' });
    return true;
  },

  join: async (rawCode, useToken = true) => {
    const code = rawCode.trim().toUpperCase();
    set({ status: get().status === 'reconnecting' ? 'reconnecting' : 'connecting', error: null, kicked: false });
    const session = savedSession();
    const token = useToken && session?.code === code ? session.token : undefined;
    const r = await emitAck<JoinResult>((s, ack) => s.emit('room:join', { code, ...profile(), token }, ack));
    if (!r.ok) {
      if (session?.code === code) storage.remove(SESSION_KEY);
      set({ status: get().status === 'reconnecting' ? 'reconnecting' : 'idle', error: r.error.message });
      return false;
    }
    storage.set(SESSION_KEY, { code: r.code, token: r.token, playerId: r.playerId });
    set({ status: 'online' });
    return true;
  },

  leave: () => {
    if (socket?.connected) socket.emit('room:leave');
    storage.remove(SESSION_KEY);
    resetOnline();
  },

  update: (patch) => socket?.emit('room:update', patch),
  addBot: (difficulty) => socket?.emit('room:addBot', { difficulty }),
  setBot: (playerId, difficulty) => socket?.emit('room:setBot', { playerId, difficulty }),
  removeSeat: (playerId) => socket?.emit('room:removeSeat', { playerId }),
  start: async () => {
    const r = await emitAck<object>((s, ack) => s.emit('room:start', ack));
    return r.ok ? null : r.error.message;
  },
  rematch: () => socket?.emit('room:rematch'),
  backToLobby: () => socket?.emit('room:lobby'),
  clearError: () => set({ error: null, kicked: false }),
}));

export function isHost(): boolean {
  const room = useOnline.getState().room;
  return !!room && room.hostId === room.youId;
}
