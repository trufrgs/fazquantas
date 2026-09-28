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
    // O prazo vem no relógio do servidor: converte para o relógio deste aparelho
    // (servidor antigo, sem `serverNow`: usa o prazo como veio).
    const skew = typeof msg.serverNow === 'number' ? msg.serverNow - Date.now() : 0;
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
/** Cada tentativa de voltar ao assento depois de uma queda; só a mais nova decide o resultado. */
let rejoinAttempt = 0;
const REJOIN_RETRY_MS = 2500;

const NO_ANSWER = { ok: false as const, error: { code: 'TIMEOUT', message: 'O servidor não respondeu. Tenta de novo.' } };
const NO_SERVER = {
  ok: false as const,
  error: { code: 'OFFLINE', message: 'Não deu pra falar com o servidor. Confere a conexão e tenta de novo.' },
};
/** Falhas que passam sozinhas (rede, servidor ocupado): a sala e o lugar continuam valendo. */
const TRANSIENT = new Set(['TIMEOUT', 'OFFLINE', 'RATE_LIMITED', 'SERVER_FULL', 'INTERNAL_ERROR']);

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

/**
 * Sai da sala localmente e mostra o motivo na tela "Jogar com a gurizada". `keepSession` preserva
 * o token salvo: ele é compartilhado entre abas e pode ser o de outra aba que assumiu o lugar.
 */
function dropToOnlineScreen(error: string, { keepSession = false } = {}) {
  if (!keepSession) storage.remove(SESSION_KEY);
  resetOnline();
  useOnline.setState({ error });
  if (useApp.getState().screen !== 'home') useApp.getState().reset('online');
}

function requestJoin(code: string, useToken: boolean): Promise<Ack<JoinResult>> {
  const session = savedSession();
  const token = useToken && session?.code === code ? session.token : undefined;
  return emitAck<JoinResult>((s, ack) => s.emit('room:join', { code, ...profile(), token }, ack));
}

function saveSession(r: JoinResult) {
  storage.set(SESSION_KEY, { code: r.code, token: r.token, playerId: r.playerId });
}

/**
 * Depois de uma queda, volta ao mesmo assento com o token. Falha passageira mantém o "reconectando"
 * e tenta de novo; só sala sumida ou lugar perdido tiram o jogador da mesa.
 */
async function rejoin(): Promise<void> {
  const { room, status } = useOnline.getState();
  if (!room || status !== 'reconnecting') return;
  const attempt = ++rejoinAttempt;
  const r = await requestJoin(room.code, true);
  if (attempt !== rejoinAttempt) return;
  if (r.ok) {
    saveSession(r);
    useOnline.setState({ status: 'online', error: null });
    return;
  }
  if (TRANSIENT.has(r.error.code)) {
    window.setTimeout(() => {
      if (attempt === rejoinAttempt && socket?.connected) void rejoin();
    }, REJOIN_RETRY_MS);
    return;
  }
  // A sala sumiu (servidor reiniciou, ficou ociosa…) ou o lugar foi perdido.
  dropToOnlineScreen(r.error.message);
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
    if (useOnline.getState().status === 'reconnecting') void rejoin();
  });
  s.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      // O servidor derrubou este socket: o mesmo jogador entrou por outro aparelho ou aba.
      // Esse socket não reconecta sozinho — descarta para o próximo uso abrir outro. O token
      // salvo agora é o da outra aba: fica onde está.
      s.removeAllListeners();
      socket = null;
      dropToOnlineScreen('Tu abriu essa sala em outro aparelho ou aba. Segue por lá.', { keepSession: true });
      return;
    }
    if (useOnline.getState().room) useOnline.setState({ status: 'reconnecting' });
  });
  s.on('room:state', (room) => {
    useOnline.setState({ room, status: 'online' });
    const app = useApp.getState();
    if (room.status !== 'lobby' && connection) app.swap('lobby', 'game');
    if (room.status === 'lobby' && useGame.getState().conn?.kind === 'online') {
      // Voltou para a sala: a partida anterior sai da mesa (a próxima chega do zero). Quem estava
      // lendo as regras volta para a sala, não para uma mesa vazia.
      useGame.getState().detach();
      connection = null;
      app.swap('game', 'lobby');
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
    const app = useApp.getState();
    if (app.screen === 'online') app.reset('game');
    else app.swap('lobby', 'game');
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
  rejoinAttempt++; // uma volta ao assento ainda pendente não ressuscita a sala
  useOnline.setState({ room: null, status: 'idle' });
}

function profile() {
  const s = useSettings.getState();
  // Online, sem apelido, o nome é "Jogador" (o servidor numera se repetir).
  return { name: (s.name.trim() || 'Jogador').slice(0, 16), avatar: s.avatar };
}

export const useOnline = create<OnlineState>((set) => ({
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
    set({ status: 'connecting', error: null, kicked: false });
    const r = await requestJoin(code, useToken);
    if (!r.ok) {
      // Só esquece a sala quando ela não serve mais; falha de rede deixa o "Voltar pra sala".
      if (!TRANSIENT.has(r.error.code) && savedSession()?.code === code) storage.remove(SESSION_KEY);
      set({ status: 'idle', error: r.error.message });
      return false;
    }
    saveSession(r);
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
