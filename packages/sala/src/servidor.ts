import {
  WS_CLOSE,
  type Ack,
  type ClientToServerEvents,
  type ProtocolError,
  type WireToServer,
} from '@fodinha/engine';
import { fail, MESSAGES, ProtocolFailure } from './erros';
import { TokenBucket } from './limite';
import { profileIdFromKey } from './perfil';
import { Sala, type Conexao, type Perfil, type SalaDeps, type SalaSalva } from './sala';
import {
  addBotSchema,
  createRoomSchema,
  gameActionSchema,
  joinRoomSchema,
  parsePayload,
  presenceSchema,
  reactSchema,
  removeSeatSchema,
  setBotSchema,
  updateRoomSchema,
} from './validacao';

/** Maior mensagem aceita de um cliente (uma jogada tem poucas dezenas de bytes). */
export const MAX_MESSAGE_BYTES = 16 * 1024;
/** Senhas erradas seguidas numa conexão antes de ela ser fechada. */
export const MAX_PASSWORD_ATTEMPTS = 5;
/**
 * Prazo para conferir o perfil (apelido guardado, bloqueio) antes de sentar. Passou disso, senta com o
 * nome que veio: um problema no objeto das contas não pode prender todas as salas em "Reconectando…".
 */
export const PERFIL_PRAZO_MS = 3000;

/** A mensagem de "essa sala já acabou" conforme o motivo guardado. */
function salaAcabou(motivo: string | null): string {
  if (motivo?.startsWith('admin')) return MESSAGES.roomGoneAdmin;
  if (motivo === 'sem jogadores') return MESSAGES.roomGoneVazia;
  if (motivo && /parad|abandonad|sem ninguém há/.test(motivo)) return MESSAGES.roomGoneParada;
  return MESSAGES.roomGone;
}

export interface RateLimitOptions {
  burst: number;
  perSecond: number;
}

export const DEFAULT_RATE_LIMIT: Readonly<RateLimitOptions> = Object.freeze({ burst: 20, perSecond: 10 });

export interface ServidorDeps extends Omit<SalaDeps, 'aoEncerrar'> {
  /** A sala acabou: pode apagar o que foi salvo. */
  aoEncerrar(motivo: string): void;
  /**
   * Antes de sentar: perfil com apelido guardado senta com o apelido e o avatar dele; nome que é
   * apelido guardado de outra pessoa muda; perfil bloqueado não senta.
   */
  conferirPerfil?(profileId: string | null, name: string): Promise<{ bloqueado: boolean; nome: string; avatar: string | null }>;
  /** Prazo da conferência do perfil (padrão `PERFIL_PRAZO_MS`; os testes encurtam). */
  perfilPrazoMs?: number;
  rateLimit?: RateLimitOptions;
}

type EventName = keyof ClientToServerEvents;

const EVENTS: ReadonlySet<string> = new Set<EventName>([
  'room:create',
  'room:join',
  'room:leave',
  'room:update',
  'room:addBot',
  'room:setBot',
  'room:removeSeat',
  'room:start',
  'room:rematch',
  'room:lobby',
  'room:present',
  'game:action',
  'game:react',
  'presence',
]);

/** Estado por conexão que não precisa sobreviver à hibernação. */
interface PorConexao {
  bucket: TokenBucket;
  wrongPasswords: number;
}

/**
 * O porteiro de uma sala: recebe as mensagens de cada conexão, valida, limita a taxa e chama a
 * `Sala`. Uma instância por sala (um Durable Object), com a sala criada no primeiro `room:create`.
 */
export class SalaServidor {
  private sala: Sala | null = null;
  /** A sala deste código já existiu e acabou (link antigo): "já acabou" em vez de "não encontrada". */
  private acabou = false;
  /** Por que acabou (admin, parada, ociosa), para a mensagem de quem chega pelo link antigo. */
  private fimMotivo: string | null = null;
  private readonly porConexao = new WeakMap<Conexao, PorConexao>();
  /**
   * Conexões que fecharam. Entrar e criar esperam a conferência do perfil (outro objeto): se a
   * conexão fechar nesse meio-tempo, o assento não pode ficar preso a ela (ficava "conectado" a um
   * socket morto, sem prazo nem contagem de sala parada).
   */
  private readonly fechadas = new WeakSet<Conexao>();

  constructor(
    readonly code: string,
    private readonly deps: ServidorDeps,
  ) {}

  get room(): Sala | null {
    return this.sala;
  }

  /** O objeto acordou sem sala, mas com a marca de que ela acabou (e o motivo, se guardado). */
  markEnded(motivo: string | null = null): void {
    if (this.sala) return;
    this.acabou = true;
    this.fimMotivo = motivo;
  }

  /** Saída pelo token, sem WebSocket (o app sai pela internet comum quando a conexão caiu). */
  leaveByToken(token: string): boolean {
    const sala = this.sala;
    if (!sala || sala.isDisposed) return false;
    return sala.leaveByToken(token);
  }

  /** Volta a sala salva (depois de hibernar ou reiniciar), religando as conexões vivas. */
  restore(saved: SalaSalva, conexoes: readonly Conexao[]): void {
    this.sala = Sala.restore(saved, this.salaDeps(), conexoes);
  }

  serialize(): SalaSalva | null {
    return this.sala && !this.sala.isDisposed ? this.sala.serialize() : null;
  }

  /** Mensagem de texto de uma conexão. Nunca lança. */
  async receive(conexao: Conexao, raw: string | ArrayBuffer): Promise<void> {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    if (text.length > MAX_MESSAGE_BYTES) {
      conexao.fechar(1009, 'mensagem grande demais');
      return;
    }
    let msg: WireToServer;
    try {
      msg = JSON.parse(text) as WireToServer;
    } catch {
      return; // lixo: ignora
    }
    if (!msg || typeof msg !== 'object' || typeof msg.e !== 'string' || !EVENTS.has(msg.e)) return;
    const id = typeof msg.id === 'number' && Number.isInteger(msg.id) ? msg.id : null;
    const state = this.stateFor(conexao);
    if (!state.bucket.take()) {
      if (id !== null) this.reply(conexao, id, { ok: false, error: { code: 'RATE_LIMITED', message: MESSAGES.rateLimited } });
      return;
    }
    // A sala segura o envio enquanto o pedido corre: a resposta chega antes do estado novo.
    const held: Sala[] = [];
    const hold = (sala: Sala | null) => {
      if (sala && !held.includes(sala)) {
        sala.hold();
        held.push(sala);
      }
    };
    // Entrar e criar seguram a sala só depois de conferir o perfil (esperar outro objeto com o envio
    // da sala inteira parado atrasaria a mesa de todo mundo).
    if (msg.e !== 'room:join' && msg.e !== 'room:create') hold(this.sala);
    let response: Ack;
    let closeAfter = false;
    try {
      response = { ok: true, ...((await this.dispatch(conexao, msg.e, msg.d, state, hold)) ?? {}) };
    } catch (error) {
      response = { ok: false, error: this.toProtocolError(error, msg.e) };
      closeAfter = error instanceof ProtocolFailure && error.code === 'TOO_MANY_ATTEMPTS';
    }
    if (id !== null) this.reply(conexao, id, response);
    for (const sala of held) sala.release();
    if (closeAfter) conexao.fechar(WS_CLOSE.tooManyAttempts, 'senhas erradas demais');
  }

  /** A conexão fechou ou deu erro. */
  disconnected(conexao: Conexao): void {
    this.fechadas.add(conexao);
    this.sala?.handleDisconnect(conexao);
  }

  /** Depois de esperar algo de fora: a conexão fechou nesse meio-tempo? Então não senta ninguém. */
  private assertOpen(conexao: Conexao): void {
    if (this.fechadas.has(conexao)) throw fail('NOT_IN_ROOM', MESSAGES.notInRoom);
  }

  // ---------------------------------------------------------------------------

  private stateFor(conexao: Conexao): PorConexao {
    let state = this.porConexao.get(conexao);
    if (!state) {
      const rl = this.deps.rateLimit ?? DEFAULT_RATE_LIMIT;
      state = { bucket: new TokenBucket(rl.burst, rl.perSecond, () => this.deps.relogio.now()), wrongPasswords: 0 };
      this.porConexao.set(conexao, state);
    }
    return state;
  }

  private reply(conexao: Conexao, id: number, r: Ack): void {
    try {
      conexao.responder(id, r);
    } catch (error) {
      this.deps.logger.warn('falha ao responder', error);
    }
  }

  private toProtocolError(error: unknown, event: string): ProtocolError {
    if (error instanceof ProtocolFailure) return error.toProtocolError();
    this.deps.logger.error(`erro inesperado em ${event}`, error);
    return { code: 'INTERNAL_ERROR', message: MESSAGES.internal };
  }

  private salaDeps(): SalaDeps {
    return {
      ...this.deps,
      aoEncerrar: (motivo) => {
        this.sala = null;
        this.acabou = true;
        this.fimMotivo = motivo;
        this.deps.aoEncerrar(motivo);
      },
    };
  }

  private async perfil(p: {
    name: string;
    avatar: string;
    profileKey?: string | undefined;
    aba?: string | undefined;
    visible?: boolean | undefined;
  }): Promise<Perfil> {
    const profileId = p.profileKey ? await profileIdFromKey(p.profileKey) : null;
    let conferido: Awaited<ReturnType<NonNullable<ServidorDeps['conferirPerfil']>>> | null = null;
    if (this.deps.conferirPerfil) {
      let prazo: ReturnType<typeof setTimeout> | undefined;
      try {
        conferido = await Promise.race([
          this.deps.conferirPerfil(profileId, p.name),
          new Promise<null>((resolve) => {
            prazo = setTimeout(() => resolve(null), this.deps.perfilPrazoMs ?? PERFIL_PRAZO_MS);
          }),
        ]);
      } catch (error) {
        this.deps.logger.warn('conferir o perfil falhou; senta com o nome que veio', error);
      } finally {
        if (prazo !== undefined) clearTimeout(prazo);
      }
    }
    if (conferido?.bloqueado) throw fail('BLOCKED', MESSAGES.blocked);
    return {
      name: conferido?.nome ?? p.name,
      avatar: conferido?.avatar ?? p.avatar,
      profileId,
      aba: p.aba ?? null,
      visivel: p.visible ?? true,
    };
  }

  /** A conexão tem de estar sentada nesta sala. */
  private membership(conexao: Conexao): { sala: Sala; playerId: string } {
    const sala = this.sala;
    const playerId = conexao.jogadorId;
    if (!sala || sala.isDisposed || !playerId || !sala.isBound(playerId, conexao)) {
      throw fail('NOT_IN_ROOM', MESSAGES.notInRoom);
    }
    return { sala, playerId };
  }

  private async dispatch(
    conexao: Conexao,
    event: EventName,
    payload: unknown,
    state: PorConexao,
    hold: (sala: Sala) => void,
  ): Promise<object | void> {
    switch (event) {
      case 'room:create': {
        const { settings, ...profile } = parsePayload(createRoomSchema, payload);
        const perfil = await this.perfil(profile);
        this.assertOpen(conexao);
        if (this.sala && !this.sala.isDisposed && this.sala.seatCount > 0) {
          throw fail('ROOM_TAKEN', MESSAGES.roomTaken);
        }
        const sala = new Sala(this.code, this.salaDeps());
        hold(sala);
        this.sala = sala;
        this.acabou = false;
        if (settings) sala.configure(settings);
        return sala.addHuman(conexao, perfil);
      }
      case 'room:join': {
        const { code, token, password, auto, ...profile } = parsePayload(joinRoomSchema, payload);
        const perfil = await this.perfil(profile);
        this.assertOpen(conexao);
        const sala = this.sala;
        if (!sala || sala.isDisposed || code !== this.code) {
          throw this.acabou && code === this.code ? fail('ROOM_GONE', salaAcabou(this.fimMotivo)) : fail('ROOM_NOT_FOUND', MESSAGES.roomNotFound);
        }
        hold(sala);
        const here = conexao.jogadorId && sala.isBound(conexao.jogadorId, conexao) ? conexao.jogadorId : null;
        // Token válido = mesmo assento (mesmo no meio da partida); já sentado aqui = idempotente.
        const seatId = (token ? sala.playerIdForToken(token) : null) ?? here;
        if (seatId) {
          // A volta automática não derruba quem está jogando agora em outro aparelho ou aba.
          if (auto && seatId !== here && sala.seatInUse(seatId, conexao, perfil.aba)) throw fail('SEAT_TAKEN', MESSAGES.seatTaken);
          return sala.reconnect(seatId, conexao, perfil);
        }
        if (auto) {
          // Voltando sozinho sem um token que valha: nunca senta como gente nova. O mesmo perfil (a
          // chave é segredo do aparelho) ainda recupera o lugar; senão, diz o porquê.
          const meu = sala.reclaimableSeat(perfil, { soPerfil: true });
          if (meu) return sala.reconnect(meu, conexao, perfil);
          throw token && sala.wasKicked(token) ? fail('KICKED', MESSAGES.kicked) : fail('SEAT_LOST', MESSAGES.seatLost);
        }
        // Sem token, a senha vale antes de tudo (inclusive para voltar ao lugar pelo apelido).
        if (state.wrongPasswords >= MAX_PASSWORD_ATTEMPTS) throw fail('TOO_MANY_ATTEMPTS', MESSAGES.tooManyAttempts);
        try {
          sala.checkPassword(password);
        } catch (error) {
          if (error instanceof ProtocolFailure && error.code === 'WRONG_PASSWORD') {
            state.wrongPasswords += 1;
            if (state.wrongPasswords >= MAX_PASSWORD_ATTEMPTS) throw fail('TOO_MANY_ATTEMPTS', MESSAGES.tooManyAttempts);
          }
          throw error;
        }
        // Mesma pessoa voltando sem o token (o navegador perdeu os dados): o mesmo lugar, até na partida.
        const volta = sala.reclaimableSeat(perfil);
        if (volta) return sala.reconnect(volta, conexao, perfil);
        // No meio da partida, o mesmo apelido com a conexão viva: é a pessoa em outro aparelho.
        if (sala.status === 'playing' && sala.seatBusyFor(perfil)) throw fail('GAME_IN_PROGRESS', MESSAGES.seatBusy);
        sala.assertCanJoin();
        return sala.addHuman(conexao, perfil);
      }
      case 'room:leave': {
        const sala = this.sala;
        const playerId = conexao.jogadorId;
        if (sala && playerId && sala.isBound(playerId, conexao)) sala.leave(playerId);
        conexao.jogadorId = null;
        conexao.vincular(null);
        return;
      }
      case 'room:update': {
        const patch = parsePayload(updateRoomSchema, payload);
        const { sala, playerId } = this.membership(conexao);
        sala.update(playerId, patch);
        return;
      }
      case 'room:addBot': {
        const { difficulty } = parsePayload(addBotSchema, payload);
        const { sala, playerId } = this.membership(conexao);
        sala.addBot(playerId, difficulty);
        return;
      }
      case 'room:setBot': {
        const target = parsePayload(setBotSchema, payload);
        const { sala, playerId } = this.membership(conexao);
        sala.setBot(playerId, target.playerId, target.difficulty);
        return;
      }
      case 'room:removeSeat': {
        const target = parsePayload(removeSeatSchema, payload);
        const { sala, playerId } = this.membership(conexao);
        sala.removeSeat(playerId, target.playerId);
        return;
      }
      case 'room:start':
      case 'room:rematch': {
        const { sala, playerId } = this.membership(conexao);
        sala.start(playerId);
        return;
      }
      case 'room:lobby': {
        const { sala, playerId } = this.membership(conexao);
        sala.backToLobby(playerId);
        return;
      }
      case 'room:present': {
        const { sala, playerId } = this.membership(conexao);
        sala.present(playerId);
        return;
      }
      case 'game:action': {
        const { action } = parsePayload(gameActionSchema, payload);
        const { sala, playerId } = this.membership(conexao);
        sala.act(playerId, action);
        return;
      }
      case 'game:react': {
        const { reaction } = parsePayload(reactSchema, payload);
        const { sala, playerId } = this.membership(conexao);
        sala.react(playerId, reaction);
        return;
      }
      case 'presence': {
        const { visible } = parsePayload(presenceSchema, payload);
        const { sala, playerId } = this.membership(conexao);
        sala.setVisible(playerId, visible);
        return;
      }
    }
  }
}
