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

/**
 * A sessão da sala aberta também fica na memória: com o armazenamento falhando (cookies bloqueados,
 * cota cheia) ou apagado por outra aba, a reconexão ainda leva o token.
 */
let sessaoViva: Session | null = null;

/** Token para voltar ao lugar numa sala: o da sala aberta agora ou o de uma das "tuas salas". */
function tokenFor(code: string): string | undefined {
  if (sessaoViva?.code === code) return sessaoViva.token;
  const session = savedSession();
  if (session?.code === code) return session.token;
  return knownRoom(code)?.token;
}

/**
 * Esquece uma sala: não volta sozinho nem aparece nas "tuas salas". A sessão salva só sai se for
 * dela (pode ser a de outra sala, aberta em outra aba).
 */
function forgetCurrent(code = useOnline.getState().room?.code ?? savedSession()?.code) {
  if (!code) return;
  if (savedSession()?.code === code) storage.remove(SESSION_KEY);
  if (sessaoViva?.code === code) sessaoViva = null;
  forgetRoom(code);
}

/**
 * Esta aba perdeu o lugar para outro aparelho ou aba: a volta automática (reabrir, atualizar) não
 * toma o lugar de volta. Vale só para esta aba; entrar de propósito limpa.
 */
const SUBSTITUIDA_KEY = 'fodinha:substituida';

function marcarSubstituida(code: string) {
  try {
    window.sessionStorage.setItem(SUBSTITUIDA_KEY, code);
  } catch {
    // sem armazenamento da aba: segue
  }
}

export function abaSubstituida(code: string): boolean {
  try {
    return window.sessionStorage.getItem(SUBSTITUIDA_KEY) === code;
  } catch {
    return false;
  }
}

function limparSubstituida() {
  try {
    window.sessionStorage.removeItem(SUBSTITUIDA_KEY);
  } catch {
    // idem
  }
}

/**
 * Sai também pela internet comum, com o token: se o WebSocket caiu, o `room:leave` some e o lugar
 * ficava preso (ele só fica livre quando a pessoa sai). `keepalive` sobrevive a fechar a aba.
 */
function sairPelaInternet(code: string) {
  const token = tokenFor(code);
  if (!token) return;
  try {
    void fetch(`${serverUrl()}/api/salas/${code}/sair`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => undefined);
  } catch {
    // sem rede: o WebSocket e os prazos da sala cuidam
  }
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
    // Reconectando: a jogada não sai (a mesa na tela pode estar velha); quando voltar, joga de novo.
    if (!this.socket.connected || useOnline.getState().status !== 'online') return 'Reconectando… tenta de novo em um instante.';
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
  /**
   * A volta automática (abriu o app com a sala salva) em andamento. `semRede`: uma tentativa já falhou
   * por falta de rede, e ela segue tentando sozinha (o lugar continua guardado no servidor) até dar
   * certo ou a pessoa desistir.
   */
  voltando: { code: string; semRede: boolean } | null;
  /** Desiste da volta automática em andamento (a sala segue nas "tuas salas" para voltar depois). */
  desistirDaVolta: () => void;
  /** Recado da administração para a sala (faixa no alto até a pessoa fechar). */
  notice: { text: string; at: number } | null;
  dismissNotice: () => void;
  create: (settings?: RoomUpdatePayload) => Promise<boolean>;
  /** `auto`: a volta que o app faz sozinho (abrir o app); não toma o lugar de outro aparelho em uso. */
  join: (code: string, opts?: { useToken?: boolean; password?: string; auto?: boolean }) => Promise<boolean>;
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
const REJOIN_RETRY_MS = 1000;
/** A volta ao assento espera menos que um pedido comum: resposta perdida numa conexão que morreu. */
const REJOIN_TIMEOUT_MS = 5000;

/** Falhas que passam sozinhas (rede, servidor ocupado): a sala e o lugar continuam valendo. */
const TRANSIENT = new Set(['TIMEOUT', 'OFFLINE', 'RATE_LIMITED', 'INTERNAL_ERROR']);
/** Cada entrada numa sala; uma mais nova (ou desistir) encerra a volta automática que ainda tentava. */
let joinSeq = 0;
/** Pausa entre as tentativas da volta automática sem rede (o socket já espera a conexão abrir). */
const VOLTA_PAUSA_MS = 1000;
/** Falta de rede: a volta automática tenta até conseguir. Erro do servidor: só algumas vezes. */
const SEM_REDE = new Set(['TIMEOUT', 'OFFLINE']);
const VOLTA_TENTATIVAS_ERRO = 5;

/**
 * Sai da sala localmente e mostra o motivo na tela "Jogar com a gurizada". `keepSession` preserva
 * o token salvo: ele é compartilhado entre abas e pode ser o de outra aba que assumiu o lugar.
 */
function dropToOnlineScreen(error: string, { keepSession = false } = {}) {
  // Só esquece a sala de onde caiu (sem sala, como na recusa ao criar, não há o que esquecer).
  const code = useOnline.getState().room?.code;
  if (!keepSession && code) forgetCurrent(code);
  resetOnline();
  useOnline.setState({ error });
  if (useApp.getState().screen !== 'home') useApp.getState().reset('online');
}

/**
 * Identidade desta aba, guardada só nela (sobrevive a recarregar a página, não passa para outra aba
 * nem aparelho). A volta automática da mesma aba sempre assume o lugar dela.
 */
let abaNaMemoria: string | null = null;
function abaId(): string {
  try {
    const salva = window.sessionStorage.getItem('fodinha:aba');
    if (salva) return salva;
  } catch {
    // sem armazenamento da aba
  }
  abaNaMemoria ??= Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    window.sessionStorage.setItem('fodinha:aba', abaNaMemoria);
  } catch {
    // fica só na memória
  }
  return abaNaMemoria;
}

function profile() {
  const s = useSettings.getState();
  // Online, sem apelido, o nome é "Jogador" (o servidor numera se repetir).
  return {
    name: (s.name.trim() || 'Jogador').slice(0, 16),
    avatar: s.avatar,
    profileKey: s.profileKey,
    aba: abaId(),
    // A volta automática também acontece com o app em segundo plano: a coroa só volta para quem olha.
    visible: typeof document === 'undefined' || document.visibilityState === 'visible',
  };
}

function saveSession(r: JoinResult) {
  sessaoViva = { code: r.code, token: r.token, playerId: r.playerId };
  storage.set(SESSION_KEY, sessaoViva);
  rememberRoom({ code: r.code, token: r.token, playerId: r.playerId });
}

/** A página ficou à vista ou escondida: o servidor decide se a vez vira notificação. */
function sendPresence() {
  if (socket?.connected && useOnline.getState().room) {
    socket.emit('presence', { visible: typeof document === 'undefined' || document.visibilityState === 'visible' });
  }
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sendPresence);

/**
 * Voltou a tela ou a rede com a volta ao assento pendente: tenta de novo agora (a resposta da
 * tentativa anterior pode ter se perdido com a conexão que morreu).
 */
function retomar() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (useOnline.getState().status === 'reconnecting' && socket?.connected) void rejoin();
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', retomar);
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('online', retomar);

const REASONS: Partial<Record<DisconnectReason, string>> = {
  replaced: 'Tu abriu essa sala em outro aparelho ou aba. Segue por lá, ou toca em "Voltar pra sala" pra jogar aqui.',
  kicked: 'O anfitrião te tirou da sala.',
  gone: 'A sala acabou.',
  closedByAdmin: 'A sala foi encerrada pela administração do jogo.',
  tooManyAttempts: 'Muitas senhas erradas seguidas. Confere a senha com quem te convidou e tenta de novo.',
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
  s.on('disconnect', (reason, detail) => {
    if (socket !== s) return;
    if (reason === 'network') {
      if (useOnline.getState().room) useOnline.setState({ status: 'reconnecting' });
      return;
    }
    if (reason === 'closed' || reason === 'left') return;
    s.removeAllListeners();
    s.close();
    socket = null;
    const code = useOnline.getState().room?.code;
    if (reason === 'replaced' && code) marcarSubstituida(code);
    dropToOnlineScreen(detail ?? REASONS[reason] ?? 'A conexão com a sala caiu.', { keepSession: reason === 'replaced' });
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
  s.on('room:notice', (n) => {
    useOnline.setState({ notice: n });
    warnRoom(`Recado da administração: ${n.text}`, 'recado');
  });
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
  // `auto`: a volta automática nunca senta como gente nova nem toma o lugar de quem joga em outro aparelho.
  const r = await s.request<JoinResult>('room:join', { code: room.code, ...profile(), token, auto: true }, { timeoutMs: REJOIN_TIMEOUT_MS });
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
  if (r.error.code === 'SEAT_TAKEN') {
    // Segue jogando no outro aparelho: esta aba sai sem apagar a sessão (é a mesma do outro).
    marcarSubstituida(room.code);
    dropToOnlineScreen(r.error.message, { keepSession: true });
    return;
  }
  // A sala sumiu, o lugar foi perdido ou o anfitrião tirou a pessoa enquanto ela estava sem conexão.
  dropToOnlineScreen(r.error.message);
  if (r.error.code === 'KICKED') useOnline.setState({ kicked: true });
}

/** Espera a volta ao assento terminar (ou desistir) antes de mandar um pedido. */
function ateVoltar(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const agora = useOnline.getState().status;
    if (agora === 'online') return resolve(true);
    if (agora !== 'reconnecting') return resolve(false);
    const fim = (ok: boolean) => {
      window.clearTimeout(timer);
      unsub();
      resolve(ok);
    };
    const timer = window.setTimeout(() => fim(false), ms);
    const unsub = useOnline.subscribe((st) => {
      if (st.status === 'online') fim(true);
      else if (st.status !== 'reconnecting') fim(false);
    });
  });
}

function resetOnline() {
  closeSocket();
  if (useGame.getState().conn?.kind === 'online') useGame.getState().detach();
  connection = null;
  rejoinAttempt++; // uma volta ao assento ainda pendente não ressuscita a sala
  joinSeq++; // nem a volta automática que ainda tentava entrar
  useOnline.setState({ room: null, status: 'idle', passwordFor: null, notice: null, voltando: null });
}

async function request<T extends object = object>(event: Parameters<SalaSocket['request']>[0], payload?: unknown): Promise<Ack<T>> {
  const s = socket;
  if (!s) return { ok: false, error: { code: 'NOT_IN_ROOM', message: 'Tu não está em nenhuma sala.' } };
  // Reconectando: o pedido espera a volta ao assento (antes dela, o servidor responde "não está na sala").
  if (useOnline.getState().status === 'reconnecting' && !(await ateVoltar(8000))) {
    return { ok: false, error: { code: 'OFFLINE', message: 'Sem conexão com a sala. Espera reconectar e tenta de novo.' } };
  }
  if (socket !== s) return { ok: false, error: { code: 'NOT_IN_ROOM', message: 'Tu não está em nenhuma sala.' } };
  return s.request<T>(event, payload);
}

/** Pedido sem esperar o resultado (a tela se atualiza pelo estado da sala). */
function pedir(event: Parameters<SalaSocket['request']>[0], payload?: unknown) {
  void request(event, payload);
}

export const useOnline = create<OnlineState>((set) => ({
  status: 'idle',
  error: null,
  room: null,
  kicked: false,
  passwordFor: null,
  notice: null,
  voltando: null,
  dismissNotice: () => set({ notice: null }),
  desistirDaVolta: () => {
    if (useOnline.getState().room) return; // já voltou: sair da sala é outra coisa
    joinSeq++;
    closeSocket();
    set({ status: 'idle', voltando: null });
  },

  create: async (settings) => {
    // Estava numa sala: sai dela antes (uma conexão por sala).
    // Numa sala assíncrona, a gente só larga a mesa (o lugar continua lá); na ao vivo, sai.
    const current = useOnline.getState().room;
    if (current) {
      if (isAsyncTurn(current.turnTimeoutSec)) storage.remove(SESSION_KEY);
      else {
        socket?.emit('room:leave');
        sairPelaInternet(current.code);
        forgetCurrent(current.code);
      }
      resetOnline();
    }
    limparSubstituida();
    set({ status: 'connecting', error: null, kicked: false, passwordFor: null, voltando: null });
    const withRules: RoomUpdatePayload = { rules: useSettings.getState().rules, ...settings };
    for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
      const s = openSocket('nova');
      const r = await s.request<JoinResult>('room:create', { ...profile(), settings: withRules });
      if (socket !== s) return false; // desistiu no meio
      if (r.ok) {
        // A partir de agora, reconectar é voltar para esta sala (não criar outra).
        s.retarget(roomUrl(r.code));
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
    set({ status: 'connecting', error: null, kicked: false, voltando: null });
    // Entrar de propósito devolve o lugar a esta aba, mesmo que outra tenha assumido antes.
    if (!opts.auto) limparSubstituida();
    // Estava em outra sala: sai dela antes (uma conexão por sala).
    const current = useOnline.getState().room;
    if (current && current.code !== code) {
      if (isAsyncTurn(current.turnTimeoutSec)) storage.remove(SESSION_KEY);
      else {
        socket?.emit('room:leave');
        sairPelaInternet(current.code);
        forgetCurrent(current.code);
      }
      resetOnline();
      set({ status: 'connecting' });
    }
    const token = useToken ? tokenFor(code) : undefined;
    const seq = ++joinSeq;
    if (opts.auto) set({ voltando: { code, semRede: false } });
    // Mesma sala (outra senha, ou já dentro): aproveita a conexão; o servidor conta as tentativas.
    const s = socket && socket.url === roomUrl(code) ? socket : openSocket(code);
    const pedir = () => s.request<JoinResult>('room:join', { code, ...profile(), token, password: opts.password, auto: opts.auto || undefined });
    let r = await pedir();
    // A volta automática não desiste por falta de rede: o lugar continua guardado no servidor. Espera
    // a conexão voltar e tenta de novo, até dar certo, a sala dizer não, ou a pessoa desistir. Erro do
    // servidor (não de rede) tenta só algumas vezes; conexão fechada de vez não tem por que insistir.
    let errosDoServidor = 0;
    while (
      opts.auto &&
      !r.ok &&
      TRANSIENT.has(r.error.code) &&
      (SEM_REDE.has(r.error.code) || ++errosDoServidor < VOLTA_TENTATIVAS_ERRO) &&
      !s.encerrado &&
      socket === s &&
      seq === joinSeq
    ) {
      set({ voltando: { code, semRede: true } });
      await new Promise((resolve) => window.setTimeout(resolve, VOLTA_PAUSA_MS));
      if (socket !== s || seq !== joinSeq) return false;
      r = await pedir();
    }
    if (socket !== s || seq !== joinSeq) return false;
    set({ voltando: null });
    if (!r.ok) {
      const needsPassword = r.error.code === 'PASSWORD_REQUIRED' || r.error.code === 'WRONG_PASSWORD';
      const taken = r.error.code === 'SEAT_TAKEN';
      if (taken) marcarSubstituida(code);
      if (r.error.code === 'KICKED') set({ kicked: true });
      // Só esquece a sala quando ela não serve mais; falha de rede (ou o lugar em uso em outro
      // aparelho) deixa o "Voltar pra sala".
      if (!TRANSIENT.has(r.error.code) && !needsPassword && !taken && token) forgetCurrent(code);
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
    const code = useOnline.getState().room?.code;
    socket?.emit('room:leave');
    if (code) sairPelaInternet(code);
    forgetCurrent(code);
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
  addBot: (difficulty) => pedir('room:addBot', { difficulty }),
  setBot: (playerId, difficulty) => pedir('room:setBot', { playerId, difficulty }),
  removeSeat: (playerId) => pedir('room:removeSeat', { playerId }),
  start: async () => {
    const r = await request('room:start');
    return r.ok ? null : r.error.message;
  },
  rematch: async () => {
    const r = await request('room:rematch');
    return r.ok ? null : r.error.message;
  },
  backToLobby: () => pedir('room:lobby'),
  present: () => pedir('room:present'),
  clearError: () => set({ error: null, kicked: false, passwordFor: null }),
}));

export function isHost(): boolean {
  const room = useOnline.getState().room;
  return !!room && room.hostId === room.youId;
}
