import {
  isAsyncTurn,
  type Ack,
  type BotDifficulty,
  type ClientAction,
  type JoinResult,
  type ReactionId,
  type RoomState,
  type RoomUpdatePayload,
  type ViewMessage,
} from '@fodinha/engine';
import { create } from 'zustand';
import type { GameConnection, ReactionEvent, SeatInfo, ViewUpdate } from '../lib/connection';
import { syncPush, warnRoom } from '../lib/avisos';
import { serverUrl } from '../lib/platform';
import { SalaSocket, type DisconnectReason } from '../lib/sala-socket';
import { forgetRoom, knownRoom, rememberRoom } from '../lib/minhas-salas';
import { storage } from '../lib/storage';
import { useApp } from './app';
import { useGame } from './game';
import { useSettings } from './settings';

const SESSION_KEY = 'fodinha:sala';
/** Criar sala num código que acabou de ser sorteado para outra: tenta de novo com outro. */
const CREATE_ATTEMPTS = 3;

interface Session {
  code: string;
  token: string;
  playerId: string;
}

export function savedSession(): Session | null {
  return storage.get<Session>(SESSION_KEY);
}

/** Token para voltar ao lugar numa sala: o da sala aberta agora ou o de uma das "tuas salas". */
function tokenFor(code: string): string | undefined {
  const session = savedSession();
  if (session?.code === code) return session.token;
  return knownRoom(code)?.token;
}

/** Esquece a sala aberta: não volta sozinho nem aparece nas "tuas salas". */
function forgetCurrent(code = savedSession()?.code ?? useOnline.getState().room?.code) {
  storage.remove(SESSION_KEY);
  if (code) forgetRoom(code);
}

/** Endereço do WebSocket de uma sala (`nova` para criar). */
export function roomUrl(code: string): string {
  return `${serverUrl().replace(/^http/, 'ws')}/api/salas/${code}`;
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
    private readonly socket: SalaSocket,
    private readonly getRoom: () => RoomState | null,
  ) {}

  push(msg: ViewMessage) {
    // O prazo vem no relógio do servidor: converte para o relógio deste aparelho.
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
        away: s.kind === 'human' ? s.away : false,
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

  async act(action: ClientAction): Promise<string | null> {
    if (!this.socket.connected) return 'Sem conexão com o servidor. Espera reconectar.';
    const r = await this.socket.request('game:action', { action });
    return r.ok ? null : r.error.message;
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
  /** Código da sala que pediu senha: a tela mostra o campo. */
  passwordFor: string | null;
  create: (settings?: RoomUpdatePayload) => Promise<boolean>;
  join: (code: string, opts?: { useToken?: boolean; password?: string }) => Promise<boolean>;
  leave: () => void;
  /** Larga a mesa sem sair da sala (assíncrona): o lugar fica, e a sala segue nas "tuas salas". */
  park: () => void;
  update: (patch: RoomUpdatePayload) => Promise<string | null>;
  addBot: (difficulty: BotDifficulty) => void;
  setBot: (playerId: string, difficulty: BotDifficulty) => void;
  removeSeat: (playerId: string) => void;
  start: () => Promise<string | null>;
  rematch: () => Promise<string | null>;
  backToLobby: () => void;
  /** "Voltei": para de jogar por mim. */
  present: () => void;
  clearError: () => void;
}

let socket: SalaSocket | null = null;
let connection: OnlineConnection | null = null;
/** Cada tentativa de voltar ao assento depois de uma queda; só a mais nova decide o resultado. */
let rejoinAttempt = 0;
const REJOIN_RETRY_MS = 2500;

/** Falhas que passam sozinhas (rede, servidor ocupado): a sala e o lugar continuam valendo. */
const TRANSIENT = new Set(['TIMEOUT', 'OFFLINE', 'RATE_LIMITED', 'INTERNAL_ERROR']);

/**
 * Sai da sala localmente e mostra o motivo na tela "Jogar com a gurizada". `keepSession` preserva
 * o token salvo: ele é compartilhado entre abas e pode ser o de outra aba que assumiu o lugar.
 */
function dropToOnlineScreen(error: string, { keepSession = false } = {}) {
  if (!keepSession) forgetCurrent();
  resetOnline();
  useOnline.setState({ error });
  if (useApp.getState().screen !== 'home') useApp.getState().reset('online');
}

function profile() {
  const s = useSettings.getState();
  // Online, sem apelido, o nome é "Jogador" (o servidor numera se repetir).
  return { name: (s.name.trim() || 'Jogador').slice(0, 16), avatar: s.avatar, profileKey: s.profileKey };
}

function saveSession(r: JoinResult) {
  storage.set(SESSION_KEY, { code: r.code, token: r.token, playerId: r.playerId });
  rememberRoom({ code: r.code, token: r.token, playerId: r.playerId });
}

/** A página ficou à vista ou escondida: o servidor decide se a vez vira notificação. */
function sendPresence() {
  if (socket?.connected && useOnline.getState().room) {
    socket.emit('presence', { visible: typeof document === 'undefined' || document.visibilityState === 'visible' });
  }
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sendPresence);

const REASONS: Partial<Record<DisconnectReason, string>> = {
  replaced: 'Tu abriu essa sala em outro aparelho ou aba. Segue por lá.',
  kicked: 'O anfitrião te tirou da sala.',
  gone: 'A sala acabou: ficou um tempo sem ninguém.',
  tooManyAttempts: 'Muitas senhas erradas. Espera um minuto e tenta de novo.',
  refused: 'Esse endereço não pode abrir salas.',
};

/** Abre a conexão de uma sala (fechando a anterior) e liga os eventos no store. */
function openSocket(code: string): SalaSocket {
  closeSocket();
  const s = new SalaSocket(roomUrl(code));
  socket = s;

  s.on('connect', () => {
    if (useOnline.getState().status === 'reconnecting') void rejoin();
  });
  s.on('disconnect', (reason) => {
    if (socket !== s) return;
    if (reason === 'network') {
      if (useOnline.getState().room) useOnline.setState({ status: 'reconnecting' });
      return;
    }
    if (reason === 'closed' || reason === 'left') return;
    s.removeAllListeners();
    socket = null;
    dropToOnlineScreen(REASONS[reason] ?? 'A conexão com a sala caiu.', { keepSession: reason === 'replaced' });
    if (reason === 'kicked') useOnline.setState({ kicked: true });
  });
  s.on('room:state', (room) => {
    const before = useOnline.getState().room;
    if (before && before.code === room.code) {
      if (before.status !== 'playing' && room.status === 'playing') warnRoom('A partida começou!', 'comecou');
      const known = new Set(before.seats.map((x) => x.playerId));
      const arrived = room.seats.filter((x) => x.kind === 'human' && !known.has(x.playerId));
      if (arrived.length > 0) warnRoom(`${arrived.map((x) => x.name).join(' e ')} entrou na sala.`, 'entrou');
    }
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
  s.on('room:kicked', () => useOnline.setState({ kicked: true }));
  return s;
}

function closeSocket() {
  const s = socket;
  socket = null;
  if (!s) return;
  s.removeAllListeners();
  s.close();
}

/**
 * Depois de uma queda, volta ao mesmo assento com o token. Falha passageira mantém o "reconectando"
 * e tenta de novo; só sala sumida ou lugar perdido tiram o jogador da mesa.
 */
async function rejoin(): Promise<void> {
  const { room, status } = useOnline.getState();
  const s = socket;
  if (!room || status !== 'reconnecting' || !s) return;
  const attempt = ++rejoinAttempt;
  const token = tokenFor(room.code);
  const r = await s.request<JoinResult>('room:join', { code: room.code, ...profile(), token });
  if (attempt !== rejoinAttempt || socket !== s) return;
  if (r.ok) {
    saveSession(r);
    useOnline.setState({ status: 'online', error: null });
    sendPresence();
    return;
  }
  if (TRANSIENT.has(r.error.code)) {
    window.setTimeout(() => {
      if (attempt === rejoinAttempt && socket?.connected) void rejoin();
    }, REJOIN_RETRY_MS);
    return;
  }
  // A sala sumiu (ficou ociosa, o servidor apagou…) ou o lugar foi perdido.
  dropToOnlineScreen(r.error.message);
}

function resetOnline() {
  closeSocket();
  if (useGame.getState().conn?.kind === 'online') useGame.getState().detach();
  connection = null;
  rejoinAttempt++; // uma volta ao assento ainda pendente não ressuscita a sala
  useOnline.setState({ room: null, status: 'idle', passwordFor: null });
}

async function request<T extends object = object>(event: Parameters<SalaSocket['request']>[0], payload?: unknown): Promise<Ack<T>> {
  const s = socket;
  if (!s) return { ok: false, error: { code: 'NOT_IN_ROOM', message: 'Tu não está em nenhuma sala.' } };
  return s.request<T>(event, payload);
}

export const useOnline = create<OnlineState>((set) => ({
  status: 'idle',
  error: null,
  room: null,
  kicked: false,
  passwordFor: null,

  create: async (settings) => {
    // Estava numa sala: sai dela antes (uma conexão por sala).
    // Numa sala assíncrona, a gente só larga a mesa (o lugar continua lá); na ao vivo, sai.
    const current = useOnline.getState().room;
    if (current) {
      if (isAsyncTurn(current.turnTimeoutSec)) storage.remove(SESSION_KEY);
      else {
        socket?.emit('room:leave');
        forgetCurrent(current.code);
      }
      resetOnline();
    }
    set({ status: 'connecting', error: null, kicked: false, passwordFor: null });
    const withRules: RoomUpdatePayload = { rules: useSettings.getState().rules, ...settings };
    for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
      const s = openSocket('nova');
      const r = await s.request<JoinResult>('room:create', { ...profile(), settings: withRules });
      if (socket !== s) return false; // desistiu no meio
      if (r.ok) {
        saveSession(r);
        set({ status: 'online' });
        sendPresence();
        void syncPush();
        return true;
      }
      closeSocket();
      if (r.error.code === 'ROOM_TAKEN' && attempt < CREATE_ATTEMPTS) continue;
      set({ status: 'idle', error: r.error.message });
      return false;
    }
    return false;
  },

  join: async (rawCode, opts = {}) => {
    const code = rawCode.trim().toUpperCase();
    const useToken = opts.useToken ?? true;
    set({ status: 'connecting', error: null, kicked: false });
    // Estava em outra sala: sai dela antes (uma conexão por sala).
    const current = useOnline.getState().room;
    if (current && current.code !== code) {
      if (isAsyncTurn(current.turnTimeoutSec)) storage.remove(SESSION_KEY);
      else {
        socket?.emit('room:leave');
        forgetCurrent(current.code);
      }
      resetOnline();
      set({ status: 'connecting' });
    }
    const token = useToken ? tokenFor(code) : undefined;
    // Mesma sala (outra senha, ou já dentro): aproveita a conexão; o servidor conta as tentativas.
    const s = socket && socket.url === roomUrl(code) ? socket : openSocket(code);
    const r = await s.request<JoinResult>('room:join', { code, ...profile(), token, password: opts.password });
    if (socket !== s) return false;
    if (!r.ok) {
      const needsPassword = r.error.code === 'PASSWORD_REQUIRED' || r.error.code === 'WRONG_PASSWORD';
      // Só esquece a sala quando ela não serve mais; falha de rede deixa o "Voltar pra sala".
      if (!TRANSIENT.has(r.error.code) && !needsPassword && token) forgetCurrent(code);
      // Pediu senha: a conexão fica aberta para a próxima tentativa.
      if (!needsPassword) closeSocket();
      set({
        status: 'idle',
        error: r.error.code === 'PASSWORD_REQUIRED' ? null : r.error.message,
        passwordFor: needsPassword ? code : null,
      });
      return false;
    }
    saveSession(r);
    set({ status: 'online', passwordFor: null });
    sendPresence();
    void syncPush();
    return true;
  },

  leave: () => {
    socket?.emit('room:leave');
    forgetCurrent();
    resetOnline();
  },

  park: () => {
    storage.remove(SESSION_KEY);
    resetOnline();
  },

  update: async (patch) => {
    const r = await request('room:update', patch);
    return r.ok ? null : r.error.message;
  },
  addBot: (difficulty) => socket?.emit('room:addBot', { difficulty }),
  setBot: (playerId, difficulty) => socket?.emit('room:setBot', { playerId, difficulty }),
  removeSeat: (playerId) => socket?.emit('room:removeSeat', { playerId }),
  start: async () => {
    const r = await request('room:start');
    return r.ok ? null : r.error.message;
  },
  rematch: async () => {
    const r = await request('room:rematch');
    return r.ok ? null : r.error.message;
  },
  backToLobby: () => socket?.emit('room:lobby'),
  present: () => socket?.emit('room:present'),
  clearError: () => set({ error: null, kicked: false, passwordFor: null }),
}));

export function isHost(): boolean {
  const room = useOnline.getState().room;
  return !!room && room.hostId === room.youId;
}
