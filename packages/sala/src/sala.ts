import {
  DEFAULT_PACE,
  DEFAULT_RULES,
  DEFAULT_TURN_TIMEOUT_SEC,
  isAsyncTurn,
  GameHost,
  NAME_MAX_LENGTH,
  RANKED_MIN_HUMANS,
  ROOM_CAPACITY,
  WS_CLOSE,
  createRng,
  currentActor,
  newSeries,
  normalizeRules,
  paceMultiplier,
  pickBotNames,
  placementPoints,
  randomSeed,
  recordSeriesGame,
  standingsOf,
  type Ack,
  type BestOf,
  type BotDifficulty,
  type ClientAction,
  type Clock,
  type HostEvent,
  type HostSnapshot,
  type HostTiming,
  type JoinResult,
  type Pace,
  type ReactionId,
  type RoomState,
  type RoomStatus,
  type Rules,
  type SeatConfig,
  type SeatPublic,
  type SeriesState,
  type ServerToClientEvents,
  type ViewMessage,
} from '@fodinha/engine';
import { fail, MESSAGES } from './erros';
import type { Logger } from './logger';
import { randomToken, sameSecret } from './perfil';

/** No máximo uma reação por jogador a cada 1,5 s. */
export const REACTION_INTERVAL_MS = 1500;
/** Sala assíncrona parada (sem lance e sem ninguém conectado) por uma semana acaba. */
export const ASYNC_IDLE_MS = 7 * 24 * 60 * 60_000;
const AVATAR_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Uma conexão de cliente (um WebSocket). `jogadorId` é o assento a que está ligada; `vincular`
 * guarda esse vínculo onde ele sobrevive à hibernação da sala.
 */
export interface Conexao {
  jogadorId: string | null;
  enviar<E extends keyof ServerToClientEvents>(evento: E, ...dados: Parameters<ServerToClientEvents[E]>): void;
  /** Resposta a um pedido do cliente (o `id` que ele mandou). */
  responder(id: number, resposta: Ack<object>): void;
  fechar(codigo: number, motivo: string): void;
  vincular(jogadorId: string | null): void;
}

export interface Perfil {
  name: string;
  /** Vazio = a sala sorteia um. */
  avatar: string;
  /** Id público do perfil de ranking (derivado da chave), ou `null`. */
  profileId: string | null;
}

export interface AjustesSala {
  rules?: Partial<Rules>;
  turnTimeoutSec?: number | null;
  pace?: Pace;
  bestOf?: BestOf;
  ranked?: boolean;
  password?: string | null;
}

/** Resultado de uma partida que vale ranking, pronto para gravar. */
export interface PartidaRanqueada {
  id: string;
  sala: string;
  iniciadaEm: number;
  terminadaEm: number;
  jogadores: {
    profileId: string;
    name: string;
    avatar: string;
    points: number;
    won: boolean;
    abandoned: boolean;
  }[];
}

/** Algo que merece notificação fora da tela (a página do jogador está escondida). */
export interface Aviso {
  playerId: string;
  profileId: string | null;
  /** `reminder`: numa sala assíncrona, o prazo da vez está acabando. */
  kind: 'turn' | 'start' | 'reminder';
  /** Até quando a vez vale (`Date.now()` do servidor), se tem prazo. */
  deadline?: number | null;
}

export interface SalaDeps {
  relogio: Clock;
  aleatorio(): number;
  timing?: Partial<HostTiming>;
  /** No lobby, quanto tempo quem caiu tem para voltar antes de perder o assento. */
  graceMs: number;
  /** Sem nenhum humano conectado por esse tempo, a sala acaba. */
  ociosaMs: number;
  /**
   * Numa sala assíncrona (1 h ou mais por jogada, ou sem limite), o que conta é o tempo sem nenhum
   * lance e sem ninguém conectado: passou disso, a sala acaba. No lobby, é também o prazo de quem caiu.
   */
  ociosaAssincronaMs?: number;
  /** Encolhe o tempo por jogada (só nos testes, para não esperar 15 s de verdade). */
  turnScale?: number;
  logger: Logger;
  /** O estado mudou: hora de salvar. */
  aoMudar(): void;
  /** A sala acabou (ninguém ficou, ou ficou ociosa). */
  aoEncerrar(motivo: string): void;
  /** Uma partida valendo ranking terminou. */
  aoTerminarRanqueada(partida: PartidaRanqueada): void;
  aoAvisar?(aviso: Aviso): void;
}

interface HumanSeat {
  kind: 'human';
  playerId: string;
  name: string;
  avatar: string;
  profileId: string | null;
  /** Segredo para reconectar no mesmo assento. */
  token: string;
  conexao: Conexao | null;
  /** Quando caiu (`null` conectado); no lobby, dá o prazo para voltar. */
  desconectadoEm: number | null;
  graceTimer: unknown;
  /** A página do jogador está à vista (senão, a vez dele vira notificação). */
  visivel: boolean;
}

interface BotSeat {
  kind: 'bot';
  playerId: string;
  name: string;
  avatar: string;
  difficulty: BotDifficulty;
}

type Seat = HumanSeat | BotSeat;

interface PartidaMeta {
  id: string;
  ranqueada: boolean;
  iniciadaEm: number;
  /** Quem saiu de uma partida valendo ranking (termina atrás de quem ficou). */
  abandonos: { profileId: string; name: string; avatar: string }[];
}

/** O que a sala guarda para voltar depois de hibernar ou reiniciar. */
export interface SalaSalva {
  v: 1;
  code: string;
  criadaEm: number;
  hostId: string;
  status: RoomStatus;
  seats: (
    | Omit<HumanSeat, 'conexao' | 'graceTimer'>
    | BotSeat
  )[];
  rules: Rules;
  turnTimeoutSec: number | null;
  pace: Pace;
  bestOf: BestOf;
  ranked: boolean;
  password: string | null;
  series: SeriesState | null;
  partida: (PartidaMeta & { host: HostSnapshot }) | null;
  idleSince: number | null;
}

/**
 * Uma sala: assentos na ordem de jogo, anfitrião, regras, a série e a partida (`GameHost`).
 *
 * Mudanças de lobby/conexão marcam o estado como sujo; o envio (`room:state` para cada membro e
 * as visões pendentes) sai num microtask, depois da resposta de quem pediu a mudança.
 */
export class Sala {
  private seats: Seat[] = [];
  private hostPlayerId = '';
  private currentStatus: RoomStatus = 'lobby';
  private rules: Rules = normalizeRules(DEFAULT_RULES);
  private turnTimeoutSec: number | null = DEFAULT_TURN_TIMEOUT_SEC;
  private pace: Pace = DEFAULT_PACE;
  private bestOf: BestOf = 1;
  private ranked = false;
  private password: string | null = null;
  private series: SeriesState | null = null;
  private gameHost: GameHost | null = null;
  private partida: PartidaMeta | null = null;
  private unsubscribeGame: (() => void) | null = null;
  private idleSinceMs: number | null = null;
  private idleTimer: unknown = null;
  private lastAway = '';
  private lastActorKey = '';
  /** Lembrete de prazo da vez atual (sala assíncrona). */
  private reminderTimer: unknown = null;
  /** A vez que já virou aviso (`seq:jogador`): não avisa duas vezes a mesma. */
  private avisadoKey = '';
  private readonly lastReactionAt = new Map<string, number>();
  private stateDirty = false;
  private outbox: { playerId: string; message: ViewMessage }[] = [];
  private flushQueued = false;
  /** Pedidos em andamento segurando o envio (a resposta sai antes do estado). */
  private holds = 0;
  private flushWaiting = false;
  private disposed = false;

  constructor(
    readonly code: string,
    private readonly deps: SalaDeps,
    readonly criadaEm: number = deps.relogio.now(),
  ) {}

  // ---------------------------------------------------------------------------
  // Consultas

  get status(): RoomStatus {
    return this.currentStatus;
  }

  get hostId(): string {
    return this.hostPlayerId;
  }

  /** Partida atual (ou a última, depois do fim); `null` no lobby. */
  get game(): GameHost | null {
    return this.gameHost;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get seatCount(): number {
    return this.seats.length;
  }

  /** De quem é a vez agora (id e nome), com o prazo, para a lista de salas de quem está fora. */
  get turn(): { playerId: string; name: string; deadline: number | null } | null {
    const game = this.currentStatus === 'playing' ? this.gameHost : null;
    const actor = game ? currentActor(game.state) : null;
    if (!game || !actor) return null;
    const seat = this.seats.find((s) => s.playerId === actor.playerId);
    return { playerId: actor.playerId, name: seat?.name ?? '', deadline: game.view(actor.playerId).turnDeadline };
  }

  get turnTimeout(): number | null {
    return this.turnTimeoutSec;
  }

  get hasPassword(): boolean {
    return this.password !== null;
  }

  /** Desde quando não há nenhum humano conectado (`null` se há alguém). */
  get idleSince(): number | null {
    return this.idleSinceMs;
  }

  get currentSeries(): SeriesState | null {
    return this.series;
  }

  publicSeats(): SeatPublic[] {
    const game = this.currentStatus === 'playing' ? this.gameHost : null;
    return this.seats.map((seat) =>
      seat.kind === 'human'
        ? {
            kind: 'human',
            playerId: seat.playerId,
            name: seat.name,
            avatar: seat.avatar,
            connected: seat.conexao !== null,
            away: game?.isAway(seat.playerId) ?? false,
          }
        : {
            kind: 'bot',
            playerId: seat.playerId,
            name: seat.name,
            avatar: seat.avatar,
            difficulty: seat.difficulty,
          },
    );
  }

  stateFor(youId: string): RoomState {
    return {
      code: this.code,
      status: this.currentStatus,
      seats: this.publicSeats(),
      hostId: this.hostPlayerId,
      youId,
      rules: { ...this.rules },
      turnTimeoutSec: this.turnTimeoutSec,
      pace: this.pace,
      bestOf: this.bestOf,
      ranked: this.ranked,
      hasPassword: this.password !== null,
      password: youId === this.hostPlayerId ? this.password : null,
      capacity: ROOM_CAPACITY,
      series: this.series,
    };
  }

  /** A conexão está sentada neste assento humano. */
  isBound(playerId: string, conexao: Conexao): boolean {
    return this.human(playerId)?.conexao === conexao;
  }

  hasHuman(playerId: string): boolean {
    return this.human(playerId) !== undefined;
  }

  playerIdForToken(token: string): string | null {
    return this.humans().find((seat) => sameSecret(seat.token, token))?.playerId ?? null;
  }

  /** Confere a senha de quem entra sem token. */
  checkPassword(given: string | undefined): void {
    if (this.password === null) return;
    if (given === undefined || given === '') throw fail('PASSWORD_REQUIRED', MESSAGES.passwordRequired);
    if (!sameSecret(given, this.password)) throw fail('WRONG_PASSWORD', MESSAGES.wrongPassword);
  }

  // ---------------------------------------------------------------------------
  // Entrar, reconectar, sair

  /** Lança se não dá para entrar num assento novo agora. */
  assertCanJoin(): void {
    if (this.currentStatus !== 'lobby') throw fail('GAME_IN_PROGRESS', MESSAGES.joinInProgress);
    if (this.seats.length >= ROOM_CAPACITY) throw fail('ROOM_FULL', MESSAGES.roomFull);
  }

  addHuman(conexao: Conexao, perfil: Perfil): JoinResult {
    this.assertCanJoin();
    const seat: HumanSeat = {
      kind: 'human',
      playerId: this.newPlayerId(),
      name: this.claimName(perfil.name, null),
      avatar: perfil.avatar || this.randomAvatar(),
      profileId: perfil.profileId,
      token: randomToken(),
      conexao: null,
      desconectadoEm: null,
      graceTimer: null,
      visivel: true,
    };
    this.seats.push(seat);
    this.bind(seat, conexao);
    if (!this.hostPlayerId) this.hostPlayerId = seat.playerId;
    this.touch();
    return { code: this.code, playerId: seat.playerId, token: seat.token };
  }

  /** Volta ao mesmo assento (token válido). Tira a conexão antiga, se ainda existir. */
  reconnect(playerId: string, conexao: Conexao, perfil: Perfil): JoinResult {
    const seat = this.human(playerId);
    if (!seat) throw fail('NOT_IN_ROOM', MESSAGES.notInRoom);
    const old = seat.conexao;
    if (old && old !== conexao) {
      this.unbind(seat);
      // Outra aba ou aparelho assumiu: a conexão antiga é avisada e fechada, sem reconectar sozinha.
      old.enviar('room:replaced');
      old.fechar(WS_CLOSE.replaced, 'assento assumido por outra conexão');
    }
    this.clearGrace(seat);
    // Durante a partida o nome já está no estado do jogo; só muda fora dela.
    if (this.currentStatus !== 'playing') {
      seat.name = this.claimName(perfil.name, seat.playerId);
      if (perfil.avatar) seat.avatar = perfil.avatar;
    }
    if (perfil.profileId) seat.profileId = perfil.profileId;
    this.bind(seat, conexao);
    if (this.currentStatus === 'playing') this.gameHost?.setAway(playerId, false);
    this.touch();
    this.queueView(playerId);
    return { code: this.code, playerId: seat.playerId, token: seat.token };
  }

  /** Sala assíncrona: a vez espera quem fechou o jogo, até o prazo (ou para sempre). */
  get isAsync(): boolean {
    return isAsyncTurn(this.turnTimeoutSec);
  }

  /** A conexão caiu (não é saída explícita). */
  handleDisconnect(conexao: Conexao): void {
    const playerId = conexao.jogadorId;
    const seat = playerId ? this.human(playerId) : undefined;
    if (!seat || seat.conexao !== conexao) return;
    seat.conexao = null;
    seat.desconectadoEm = this.deps.relogio.now();
    // Na partida ao vivo, a mesa joga por quem caiu; na assíncrona, a vez espera por ele.
    if (this.currentStatus === 'playing') {
      if (!this.isAsync) this.gameHost?.setAway(seat.playerId, true);
      else this.warnIfTurnOf(seat);
    } else this.startGrace(seat);
    this.touch();
  }

  /** Saída explícita: no lobby libera o assento; na partida vira bot médio; depois do fim, sai. */
  leave(playerId: string): void {
    const index = this.indexOf(playerId);
    const seat = this.seats[index];
    if (!seat || seat.kind !== 'human') return;
    if (this.currentStatus === 'playing') this.replaceWithBot(index, seat);
    else this.removeAt(index);
  }

  /** "Voltei": o jogador está de novo na frente da tela; para de jogar por ele. */
  present(playerId: string): void {
    const seat = this.human(playerId);
    if (!seat?.conexao) return;
    seat.visivel = true;
    if (this.currentStatus === 'playing' && this.gameHost?.isAway(playerId)) {
      this.gameHost.setAway(playerId, false);
      this.touch();
    }
  }

  /** A página do jogador ficou visível ou escondida. */
  setVisible(playerId: string, visible: boolean): void {
    const seat = this.human(playerId);
    if (!seat || seat.visivel === visible) return;
    seat.visivel = visible;
    if (!visible) this.warnIfTurnOf(seat);
    this.deps.aoMudar();
  }

  // ---------------------------------------------------------------------------
  // Ações do anfitrião

  update(requesterId: string, patch: AjustesSala): void {
    this.assertHost(requesterId);
    this.applySettings(patch, false);
    this.touch();
  }

  /** Ajustes da criação da sala (quem cria é o anfitrião). */
  configure(patch: AjustesSala): void {
    this.applySettings(patch, true);
    this.markDirty();
  }

  private applySettings(patch: AjustesSala, creating: boolean): void {
    const inGame = this.currentStatus === 'playing';
    const lobbyOnly =
      patch.rules !== undefined ||
      patch.turnTimeoutSec !== undefined ||
      patch.bestOf !== undefined ||
      patch.ranked !== undefined;
    // Regras, tempo, série e ranking só mudam no lobby; ritmo e senha mudam a qualquer hora.
    if (lobbyOnly && !creating && this.currentStatus !== 'lobby') {
      throw fail('GAME_IN_PROGRESS', MESSAGES.locked);
    }
    if (patch.rules) this.rules = normalizeRules({ ...this.rules, ...patch.rules });
    if (patch.turnTimeoutSec !== undefined) this.turnTimeoutSec = patch.turnTimeoutSec;
    if (patch.bestOf !== undefined) this.bestOf = patch.bestOf;
    if (patch.ranked !== undefined) this.ranked = patch.ranked;
    if (patch.password !== undefined) this.password = patch.password;
    if (patch.pace !== undefined) {
      this.pace = patch.pace;
      if (inGame) this.gameHost?.setSpeed(paceMultiplier(this.pace));
    }
  }

  /**
   * Nome único na mesa para um humano: um bot homônimo ganha outro nome; outro humano homônimo
   * faz este virar "Nome 2", "Nome 3"…
   */
  private claimName(wanted: string, playerId: string | null): string {
    const same = (a: string, b: string) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');
    const others = this.seats.filter((seat) => seat.playerId !== playerId);
    for (const bot of others) {
      if (bot.kind === 'bot' && same(bot.name, wanted)) {
        const taken = [...this.seats.map((seat) => seat.name), wanted];
        const [renamed] = pickBotNames(1, taken, createRng(randomSeed(this.deps.aleatorio)));
        bot.name = renamed ?? 'Bot';
      }
    }
    const humans = others.filter((seat) => seat.kind === 'human').map((seat) => seat.name);
    if (!humans.some((n) => same(n, wanted))) return wanted;
    for (let k = 2; ; k++) {
      const suffix = ` ${k}`;
      const candidate = `${[...wanted].slice(0, NAME_MAX_LENGTH - suffix.length).join('')}${suffix}`;
      if (!humans.some((n) => same(n, candidate))) return candidate;
    }
  }

  addBot(requesterId: string, difficulty: BotDifficulty): void {
    this.assertHost(requesterId);
    this.assertEditable();
    if (this.seats.length >= ROOM_CAPACITY) throw fail('ROOM_FULL', MESSAGES.roomFull);
    const rng = createRng(randomSeed(this.deps.aleatorio));
    const [name] = pickBotNames(
      1,
      this.seats.map((seat) => seat.name),
      rng,
    );
    this.seats.push({
      kind: 'bot',
      playerId: this.newPlayerId(),
      name: name ?? 'Bot',
      avatar: this.randomAvatar(),
      difficulty,
    });
    this.touch();
  }

  setBot(requesterId: string, playerId: string, difficulty: BotDifficulty): void {
    this.assertHost(requesterId);
    const seat = this.seats[this.indexOf(playerId)];
    if (!seat) throw fail('INVALID_PAYLOAD', MESSAGES.seatGone);
    if (seat.kind !== 'bot') throw fail('INVALID_PAYLOAD', MESSAGES.notBot);
    seat.difficulty = difficulty;
    if (this.currentStatus === 'playing') this.gameHost?.setSeatKind(playerId, 'bot', difficulty);
    this.touch();
  }

  /** Remove um bot ou expulsa um humano (na partida, o assento dele vira bot médio). */
  removeSeat(requesterId: string, playerId: string): void {
    this.assertHost(requesterId);
    if (playerId === requesterId) throw fail('INVALID_PAYLOAD', MESSAGES.kickSelf);
    const index = this.indexOf(playerId);
    const seat = this.seats[index];
    if (!seat) throw fail('INVALID_PAYLOAD', MESSAGES.seatGone);
    if (seat.kind === 'bot') {
      if (this.currentStatus === 'playing') throw fail('GAME_IN_PROGRESS', MESSAGES.botInGame);
      this.removeAt(index);
      return;
    }
    const conexao = seat.conexao;
    if (this.currentStatus === 'playing') this.replaceWithBot(index, seat);
    else this.removeAt(index);
    conexao?.enviar('room:kicked');
    conexao?.fechar(WS_CLOSE.kicked, 'expulso pelo anfitrião');
  }

  start(requesterId: string): void {
    this.assertHost(requesterId);
    if (this.currentStatus === 'playing') throw fail('GAME_IN_PROGRESS', MESSAGES.alreadyPlaying);
    if (this.seats.length < 2) throw fail('NOT_ENOUGH_PLAYERS', MESSAGES.notEnoughPlayers);
    // Do lobby sempre começa série nova; depois do fim, segue a série se ela não acabou.
    const continuing = this.currentStatus === 'finished' && this.series !== null && this.series.champion === null;
    if (!continuing && this.ranked) this.assertRankable();
    this.startGame(continuing ? this.series! : newSeries(this.bestOf));
  }

  /** Próxima partida com os mesmos assentos: segue a série ou começa outra. */
  rematch(requesterId: string): void {
    this.start(requesterId);
  }

  /** Depois do fim de jogo, volta para o lobby: dá para trocar assentos, regras e chamar gente. */
  backToLobby(requesterId: string): void {
    this.assertHost(requesterId);
    if (this.currentStatus === 'playing') throw fail('GAME_IN_PROGRESS', MESSAGES.alreadyPlaying);
    if (this.currentStatus === 'lobby') return;
    this.disposeGame();
    this.currentStatus = 'lobby';
    this.touch();
  }

  // ---------------------------------------------------------------------------
  // Partida

  act(playerId: string, action: ClientAction): void {
    const game = this.gameHost;
    if (!game || this.currentStatus === 'lobby') throw fail('GAME_ERROR', MESSAGES.noGame);
    const wasAway = game.isAway(playerId);
    const result = game.act(playerId, { ...action, playerId });
    // Quem age está de volta, mesmo que a jogada não valha: a mesa fica sabendo e a partida segue.
    if (wasAway) this.touch();
    if (!result.ok) throw fail('GAME_ERROR', result.error.message);
  }

  react(playerId: string, reaction: ReactionId): void {
    const at = this.deps.relogio.now();
    const last = this.lastReactionAt.get(playerId);
    if (last !== undefined && at - last < REACTION_INTERVAL_MS) return; // excesso: ignora em silêncio
    this.lastReactionAt.set(playerId, at);
    for (const seat of this.humans()) seat.conexao?.enviar('game:reaction', { playerId, reaction, at });
  }

  // ---------------------------------------------------------------------------
  // Ciclo de vida

  isIdleFor(ms: number, now: number): boolean {
    return this.idleSinceMs !== null && now - this.idleSinceMs >= ms;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeGame();
    this.clearIdleTimer();
    for (const seat of this.humans()) {
      this.clearGrace(seat);
      this.unbind(seat);
    }
    this.outbox = [];
  }

  /** Estado para guardar (sem conexões nem timers). */
  serialize(): SalaSalva {
    return {
      v: 1,
      code: this.code,
      criadaEm: this.criadaEm,
      hostId: this.hostPlayerId,
      status: this.currentStatus,
      seats: this.seats.map((seat) => {
        if (seat.kind === 'bot') return { ...seat };
        const { conexao: _c, graceTimer: _g, ...rest } = seat;
        return rest;
      }),
      rules: { ...this.rules },
      turnTimeoutSec: this.turnTimeoutSec,
      pace: this.pace,
      bestOf: this.bestOf,
      ranked: this.ranked,
      password: this.password,
      series: this.series,
      // Depois do fim, a última partida também vai: quem volta ainda vê a mesa final.
      partida: this.partida && this.gameHost ? { ...this.partida, host: this.gameHost.snapshot() } : null,
      idleSince: this.idleSinceMs,
    };
  }

  /**
   * Volta a sala a partir do que foi salvo. As conexões vivas (as que sobreviveram à hibernação)
   * voltam aos assentos pelo vínculo; quem não tem conexão conta como caído desde quando caiu.
   */
  static restore(saved: SalaSalva, deps: SalaDeps, conexoes: readonly Conexao[]): Sala {
    const sala = new Sala(saved.code, deps, saved.criadaEm);
    sala.hostPlayerId = saved.hostId;
    sala.currentStatus = saved.status;
    sala.rules = normalizeRules(saved.rules);
    sala.turnTimeoutSec = saved.turnTimeoutSec;
    sala.pace = saved.pace;
    sala.bestOf = saved.bestOf;
    sala.ranked = saved.ranked;
    sala.password = saved.password;
    sala.series = saved.series;
    sala.seats = saved.seats.map((seat) =>
      seat.kind === 'bot' ? { ...seat } : { ...seat, conexao: null, graceTimer: null },
    );
    const now = deps.relogio.now();
    for (const conexao of conexoes) {
      const seat = conexao.jogadorId ? sala.human(conexao.jogadorId) : undefined;
      if (seat && !seat.conexao) {
        seat.conexao = conexao;
        seat.desconectadoEm = null;
      } else if (conexao.jogadorId) {
        conexao.vincular(null); // assento sumiu: a conexão fica solta
        conexao.jogadorId = null;
      }
    }
    for (const seat of sala.humans()) if (!seat.conexao) seat.desconectadoEm ??= now;
    if (saved.status !== 'lobby' && saved.partida) {
      const { host, ...meta } = saved.partida;
      const game = GameHost.restore(host, { clock: deps.relogio, timing: deps.timing });
      game.setSpeed(paceMultiplier(sala.pace));
      sala.partida = meta;
      sala.attachGame(game);
      if (saved.status === 'playing') {
        if (!sala.isAsync) for (const seat of sala.humans()) if (!seat.conexao) game.setAway(seat.playerId, true);
        game.start();
        // A vez atual já foi avisada antes de hibernar: não repete o push ao acordar.
        const actor = currentActor(game.state);
        sala.lastActorKey = actor ? `${game.state.seq}:${actor.playerId}` : '';
        sala.avisadoKey = sala.lastActorKey;
        sala.scheduleReminder(game);
      }
    } else if (saved.status === 'playing') {
      // Partida perdida (não deveria acontecer): volta para o lobby em vez de travar.
      sala.currentStatus = 'lobby';
    }
    if (sala.currentStatus !== 'playing') {
      for (const seat of sala.humans()) if (!seat.conexao) sala.startGrace(seat, seat.desconectadoEm ?? now);
    }
    sala.idleSinceMs = saved.idleSince;
    sala.touch();
    return sala;
  }

  // ---------------------------------------------------------------------------
  // Internos

  private humans(): HumanSeat[] {
    return this.seats.filter((seat): seat is HumanSeat => seat.kind === 'human');
  }

  private human(playerId: string): HumanSeat | undefined {
    const seat = this.seats.find((s) => s.playerId === playerId);
    return seat?.kind === 'human' ? seat : undefined;
  }

  private indexOf(playerId: string): number {
    return this.seats.findIndex((seat) => seat.playerId === playerId);
  }

  private assertHost(playerId: string): void {
    if (playerId !== this.hostPlayerId) throw fail('NOT_HOST', MESSAGES.notHost);
  }

  private assertEditable(): void {
    if (this.currentStatus === 'playing') throw fail('GAME_IN_PROGRESS', MESSAGES.locked);
  }

  private assertRankable(): void {
    const ranked = this.humans().filter((seat) => seat.profileId !== null);
    if (ranked.length < RANKED_MIN_HUMANS) throw fail('NOT_RANKABLE', MESSAGES.notRankable);
  }

  private newPlayerId(): string {
    for (;;) {
      const id = randomToken(6);
      if (this.indexOf(id) === -1) return id;
    }
  }

  private randomAvatar(): string {
    let seed = '';
    for (let i = 0; i < 10; i++) {
      seed += AVATAR_ALPHABET[Math.floor(this.deps.aleatorio() * AVATAR_ALPHABET.length)] ?? 'a';
    }
    return seed;
  }

  private bind(seat: HumanSeat, conexao: Conexao): void {
    seat.conexao = conexao;
    seat.desconectadoEm = null;
    seat.visivel = true;
    conexao.jogadorId = seat.playerId;
    conexao.vincular(seat.playerId);
  }

  private unbind(seat: HumanSeat): void {
    const conexao = seat.conexao;
    if (!conexao) return;
    seat.conexao = null;
    if (conexao.jogadorId === seat.playerId) {
      conexao.jogadorId = null;
      conexao.vincular(null);
    }
  }

  /** Prazo para voltar ao assento no lobby, contado desde a queda. */
  private startGrace(seat: HumanSeat, since = this.deps.relogio.now()): void {
    this.clearGrace(seat);
    const grace = this.isAsync ? this.asyncIdleMs : this.deps.graceMs;
    const left = Math.max(0, since + grace - this.deps.relogio.now());
    seat.graceTimer = this.deps.relogio.setTimeout(() => {
      seat.graceTimer = null;
      this.onGraceExpired(seat.playerId);
    }, left);
  }

  private clearGrace(seat: HumanSeat): void {
    if (seat.graceTimer === null) return;
    this.deps.relogio.clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
  }

  private onGraceExpired(playerId: string): void {
    if (this.disposed || this.currentStatus === 'playing') return; // na partida o assento fica
    const index = this.indexOf(playerId);
    const seat = this.seats[index];
    if (seat?.kind !== 'human' || seat.conexao) return;
    this.deps.logger.info(`[${this.code}] ${seat.name} não voltou a tempo e perdeu o assento.`);
    this.removeAt(index);
  }

  private removeAt(index: number): void {
    const [seat] = this.seats.splice(index, 1);
    if (!seat) return;
    this.lastReactionAt.delete(seat.playerId);
    if (seat.kind === 'human') {
      this.clearGrace(seat);
      this.unbind(seat);
    }
    if (seat.playerId === this.hostPlayerId) this.passCrown(index);
    this.afterSeatChange();
  }

  private replaceWithBot(index: number, seat: HumanSeat): void {
    this.clearGrace(seat);
    this.unbind(seat);
    if (this.partida?.ranqueada && seat.profileId) {
      this.partida.abandonos.push({ profileId: seat.profileId, name: seat.name, avatar: seat.avatar });
    }
    this.seats[index] = {
      kind: 'bot',
      playerId: seat.playerId,
      name: seat.name,
      avatar: seat.avatar,
      difficulty: 'medio',
    };
    this.gameHost?.setSeatKind(seat.playerId, 'bot', 'medio');
    if (seat.playerId === this.hostPlayerId) this.passCrown(index + 1);
    this.afterSeatChange();
  }

  /** Coroa para o próximo humano na ordem dos assentos, de preferência conectado. */
  private passCrown(fromIndex: number): void {
    const n = this.seats.length;
    let fallback: HumanSeat | undefined;
    for (let k = 0; k < n; k++) {
      const seat = this.seats[(fromIndex + k) % n];
      if (seat?.kind !== 'human') continue;
      if (seat.conexao) {
        this.hostPlayerId = seat.playerId;
        return;
      }
      fallback ??= seat;
    }
    if (fallback) this.hostPlayerId = fallback.playerId;
  }

  private afterSeatChange(): void {
    this.markDirty();
    if (this.humans().length === 0) {
      this.close('sem jogadores');
      return;
    }
    this.refreshIdle();
  }

  /** Como a sala está, em poucas linhas (painel do admin). */
  summary(): { status: RoomStatus; humanos: string[]; bots: number; conectados: number; assincrona: boolean; ranqueada: boolean; senha: boolean } {
    const humans = this.humans();
    return {
      status: this.currentStatus,
      humanos: humans.map((seat) => seat.name),
      bots: this.seats.length - humans.length,
      conectados: humans.filter((seat) => seat.conexao !== null).length,
      assincrona: this.isAsync,
      ranqueada: this.ranked,
      senha: this.password !== null,
    };
  }

  /** A administração encerrou a sala (todo mundo sai, o código fica livre). */
  closeByAdmin(): void {
    this.close('admin', WS_CLOSE.closedByAdmin);
  }

  private close(reason: string, closeCode: number = WS_CLOSE.gone): void {
    if (this.disposed) return;
    this.deps.logger.info(`[${this.code}] sala encerrada: ${reason}`);
    for (const seat of this.humans()) seat.conexao?.fechar(closeCode, reason);
    this.dispose();
    this.deps.aoEncerrar(reason);
  }

  private startGame(series: SeriesState): void {
    const seats: SeatConfig[] = this.seats.map((seat) =>
      seat.kind === 'human'
        ? { id: seat.playerId, name: seat.name, kind: 'human', avatar: seat.avatar }
        : {
            id: seat.playerId,
            name: seat.name,
            kind: 'bot',
            difficulty: seat.difficulty,
            avatar: seat.avatar,
          },
    );
    let game: GameHost;
    try {
      game = new GameHost({
        seats,
        rules: this.rules,
        seed: randomSeed(this.deps.aleatorio),
        clock: this.deps.relogio,
        timing: this.deps.timing,
        turnTimeoutMs:
          this.turnTimeoutSec === null ? null : this.turnTimeoutSec * 1000 * (this.deps.turnScale ?? 1),
      });
    } catch (error) {
      throw fail('GAME_ERROR', error instanceof Error ? error.message : MESSAGES.internal);
    }
    game.setSpeed(paceMultiplier(this.pace));
    this.disposeGame();
    for (const seat of this.humans()) {
      this.clearGrace(seat); // na partida, quem caiu fica com o assento (o host joga por ele)
      if (!seat.conexao && !this.isAsync) game.setAway(seat.playerId, true);
    }
    this.series = series;
    this.partida = {
      id: `${this.code}-${randomToken(9)}`,
      ranqueada: this.ranked,
      iniciadaEm: this.deps.relogio.now(),
      abandonos: [],
    };
    this.currentStatus = 'playing';
    this.attachGame(game);
    game.start();
    this.touch();
    for (const seat of this.humans()) {
      const away = seat.conexao ? !seat.visivel : this.isAsync;
      if (away) this.deps.aoAvisar?.({ playerId: seat.playerId, profileId: seat.profileId, kind: 'start' });
    }
  }

  private attachGame(game: GameHost): void {
    this.gameHost = game;
    this.lastAway = '';
    this.lastActorKey = '';
    this.unsubscribeGame = game.subscribe((event) => this.onGameEvent(game, event));
  }

  private onGameEvent(game: GameHost, event: HostEvent): void {
    // Roda dentro do GameHost (inclusive em timers): nunca pode lançar.
    try {
      if (game !== this.gameHost || this.disposed) return;
      const action = event.action;
      const actorId = action && 'playerId' in action ? action.playerId : null;
      for (const seat of this.humans()) {
        if (!seat.conexao) continue;
        this.outbox.push({
          playerId: seat.playerId,
          message: {
            view: game.view(seat.playerId),
            auto: event.auto,
            reason: event.reason,
            actorId,
            serverNow: this.deps.relogio.now(),
          },
        });
      }
      // Quem ficou ausente (estourou o tempo de novo) aparece para a mesa e pode pausar a partida.
      const away = game.awayPlayers().sort().join(',');
      if (away !== this.lastAway) {
        this.lastAway = away;
        this.stateDirty = true;
        this.refreshIdle();
      }
      this.warnTurn(game);
      // Assíncrona sem ninguém olhando: cada lance recomeça a contagem da sala parada.
      if (this.isAsync && this.idleTimer !== null) {
        this.idleSinceMs = this.deps.relogio.now();
        this.armIdleTimer();
      }
      if (event.state.phase === 'gameOver' && this.currentStatus === 'playing') this.finishGame(game);
      this.queueFlush();
    } catch (error) {
      this.deps.logger.error(`[${this.code}] erro ao repassar evento da partida`, error);
    }
  }

  /** A vez passou para alguém com a página escondida: vale uma notificação (uma por vez). */
  private warnTurn(game: GameHost): void {
    const actor = currentActor(game.state);
    const key = actor ? `${game.state.seq}:${actor.playerId}` : '';
    if (!actor || key === this.lastActorKey) return;
    const previous = this.lastActorKey.split(':')[1];
    this.lastActorKey = key;
    if (previous === actor.playerId) return; // várias cartas seguidas do mesmo jogador: avisa uma vez
    this.scheduleReminder(game);
    const seat = this.human(actor.playerId);
    if (seat && (!seat.conexao || !seat.visivel)) this.warnIfTurnOf(seat);
  }

  /**
   * É a vez desta pessoa e ela não está olhando (fechou o jogo ou foi para outro app): um aviso
   * por vez. Jogada forçada (a última carta) e quem está ausente não contam: a mesa joga sozinha.
   */
  private warnIfTurnOf(seat: HumanSeat): void {
    const game = this.currentStatus === 'playing' ? this.gameHost : null;
    const actor = game ? currentActor(game.state) : null;
    if (!game || !actor || actor.playerId !== seat.playerId || game.isAway(seat.playerId)) return;
    if (actor.kind === 'play' && (game.state.round.hands[seat.playerId]?.length ?? 0) <= 1) return;
    const key = `${game.state.seq}:${seat.playerId}`;
    if (key === this.avisadoKey) return;
    this.avisadoKey = key;
    const deadline = game.view(seat.playerId).turnDeadline;
    this.deps.aoAvisar?.({ playerId: seat.playerId, profileId: seat.profileId, kind: 'turn', deadline });
  }

  /**
   * Sala assíncrona com prazo: avisa de novo quando falta um quarto do tempo (1 h → 15 min antes,
   * 12 h → 3 h antes), se a pessoa ainda não jogou nem está olhando.
   */
  private scheduleReminder(game: GameHost): void {
    this.clearReminder();
    if (!this.isAsync || this.turnTimeoutSec === null) return;
    const actor = currentActor(game.state);
    const seat = actor ? this.human(actor.playerId) : undefined;
    if (!actor || !seat) return;
    const deadline = game.view(seat.playerId).turnDeadline;
    if (deadline === null) return;
    const at = deadline - (this.turnTimeoutSec * 1000 * (this.deps.turnScale ?? 1)) / 4;
    const wait = at - this.deps.relogio.now();
    if (wait <= 0) return;
    const seq = game.state.seq;
    this.reminderTimer = this.deps.relogio.setTimeout(() => {
      this.reminderTimer = null;
      if (this.disposed || game !== this.gameHost || game.state.seq !== seq || game.isAway(seat.playerId)) return;
      if (seat.conexao && seat.visivel) return;
      this.deps.aoAvisar?.({ playerId: seat.playerId, profileId: seat.profileId, kind: 'reminder', deadline });
    }, wait);
  }

  private clearReminder(): void {
    if (this.reminderTimer === null) return;
    this.deps.relogio.clearTimeout(this.reminderTimer);
    this.reminderTimer = null;
  }

  private finishGame(game: GameHost): void {
    this.currentStatus = 'finished';
    const now = this.deps.relogio.now();
    const names = Object.fromEntries(game.state.players.map((p) => [p.id, p.name]));
    if (this.series) this.series = recordSeriesGame(this.series, game.state, names, now);
    const meta = this.partida;
    if (meta?.ranqueada) {
      try {
        this.deps.aoTerminarRanqueada(this.rankedResult(game, meta, now));
      } catch (error) {
        this.deps.logger.error(`[${this.code}] erro ao registrar o ranking`, error);
      }
    }
    // Fora da partida, quem continua desconectado volta a ter prazo para voltar.
    for (const seat of this.humans()) if (!seat.conexao) this.startGrace(seat, seat.desconectadoEm ?? now);
    this.markDirty();
  }

  /** Pontos só entre os humanos com perfil; quem abandonou fica atrás de todos que ficaram. */
  private rankedResult(game: GameHost, meta: PartidaMeta, now: number): PartidaRanqueada {
    const byPlayer = new Map(
      this.humans()
        .filter((seat) => seat.profileId !== null)
        .map((seat) => [seat.playerId, seat] as const),
    );
    const groups = standingsOf(game.state.players)
      .map((group) => group.filter((id) => byPlayer.has(id)).map((id) => byPlayer.get(id)!.profileId!))
      .filter((group) => group.length > 0);
    const quitters = meta.abandonos.filter((q) => ![...byPlayer.values()].some((s) => s.profileId === q.profileId));
    if (quitters.length > 0) groups.push(quitters.map((q) => q.profileId));
    const points = placementPoints(groups);
    const winners = new Set(game.state.result?.winners ?? []);
    const players: PartidaRanqueada['jogadores'] = [];
    for (const seat of byPlayer.values()) {
      players.push({
        profileId: seat.profileId!,
        name: seat.name,
        avatar: seat.avatar,
        points: points[seat.profileId!] ?? 0,
        won: winners.has(seat.playerId),
        abandoned: false,
      });
    }
    for (const q of quitters) {
      players.push({ profileId: q.profileId, name: q.name, avatar: q.avatar, points: 0, won: false, abandoned: true });
    }
    return { id: meta.id, sala: this.code, iniciadaEm: meta.iniciadaEm, terminadaEm: now, jogadores: players };
  }

  private disposeGame(): void {
    this.clearReminder();
    this.unsubscribeGame?.();
    this.unsubscribeGame = null;
    this.gameHost?.dispose();
    this.gameHost = null;
    this.partida = null;
  }

  /**
   * Sem humano conectado, a contagem de ociosidade começa. Sem ninguém presente (conectado e não
   * ausente), a partida pausa: a mesa não joga sozinha para ninguém ver.
   */
  private refreshIdle(): void {
    if (this.disposed) return;
    const game = this.currentStatus === 'playing' ? this.gameHost : null;
    const connected = this.humans().filter((seat) => seat.conexao !== null);
    if (connected.length > 0) {
      this.idleSinceMs = null;
      this.clearIdleTimer();
    } else if (this.idleSinceMs === null || this.idleTimer === null) {
      this.idleSinceMs ??= this.deps.relogio.now();
      this.armIdleTimer();
    }
    if (!game) return;
    // Na assíncrona, quem fechou o jogo segue na mesa: só pausa se todo mundo ficou ausente.
    const counted = this.isAsync ? this.humans() : connected;
    const present = counted.some((seat) => !game.isAway(seat.playerId));
    if (present && game.isPaused) game.resume();
    else if (!present && !game.isPaused) game.pause();
  }

  private armIdleTimer(): void {
    this.clearIdleTimer();
    const since = this.idleSinceMs ?? this.deps.relogio.now();
    const limit = this.isAsync ? this.asyncIdleMs : this.deps.ociosaMs;
    const left = Math.max(0, since + limit - this.deps.relogio.now());
    this.idleTimer = this.deps.relogio.setTimeout(() => {
      this.idleTimer = null;
      if (this.humans().every((seat) => seat.conexao === null)) this.close('ociosa');
    }, left);
  }

  private get asyncIdleMs(): number {
    return this.deps.ociosaAssincronaMs ?? ASYNC_IDLE_MS;
  }

  private clearIdleTimer(): void {
    if (this.idleTimer === null) return;
    this.deps.relogio.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private touch(): void {
    this.markDirty();
    this.refreshIdle();
  }

  private queueView(playerId: string): void {
    const game = this.gameHost;
    if (!game) return;
    this.outbox.push({
      playerId,
      message: {
        view: game.view(playerId),
        auto: false,
        reason: null,
        actorId: null,
        serverNow: this.deps.relogio.now(),
      },
    });
    this.queueFlush();
  }

  private markDirty(): void {
    this.stateDirty = true;
    this.queueFlush();
  }

  /** Segura o envio de estado e visões até `release` (a resposta ao pedido sai primeiro). */
  hold(): void {
    this.holds += 1;
  }

  release(): void {
    this.holds = Math.max(0, this.holds - 1);
    if (this.holds === 0 && this.flushWaiting) {
      this.flushWaiting = false;
      this.queueFlush();
    }
  }

  private queueFlush(): void {
    if (this.holds > 0) {
      this.flushWaiting = true;
      return;
    }
    if (this.flushQueued || this.disposed) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      try {
        this.flush();
      } catch (error) {
        this.deps.logger.error(`[${this.code}] erro ao enviar estado da sala`, error);
      }
    });
  }

  private flush(): void {
    this.flushQueued = false;
    if (this.disposed) return;
    if (this.stateDirty) {
      this.stateDirty = false;
      for (const seat of this.humans()) seat.conexao?.enviar('room:state', this.stateFor(seat.playerId));
    }
    const pending = this.outbox;
    this.outbox = [];
    for (const { playerId, message } of pending) {
      this.human(playerId)?.conexao?.enviar('game:view', message);
    }
    this.deps.aoMudar();
  }
}
