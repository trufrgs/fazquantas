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

export interface RateLimitOptions {
  burst: number;
  perSecond: number;
}

export const DEFAULT_RATE_LIMIT: Readonly<RateLimitOptions> = Object.freeze({ burst: 20, perSecond: 10 });

export interface ServidorDeps extends Omit<SalaDeps, 'aoEncerrar'> {
  /** A sala acabou: pode apagar o que foi salvo. */
  aoEncerrar(motivo: string): void;
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
  private readonly porConexao = new WeakMap<Conexao, PorConexao>();

  constructor(
    readonly code: string,
    private readonly deps: ServidorDeps,
  ) {}

  get room(): Sala | null {
    return this.sala;
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
    hold(this.sala);
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
    this.sala?.handleDisconnect(conexao);
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
        this.deps.aoEncerrar(motivo);
      },
    };
  }

  private async perfil(p: { name: string; avatar: string; profileKey?: string | undefined }): Promise<Perfil> {
    return {
      name: p.name,
      avatar: p.avatar,
      profileId: p.profileKey ? await profileIdFromKey(p.profileKey) : null,
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
        if (this.sala && !this.sala.isDisposed && this.sala.seatCount > 0) {
          throw fail('ROOM_TAKEN', MESSAGES.roomTaken);
        }
        const sala = new Sala(this.code, this.salaDeps());
        hold(sala);
        this.sala = sala;
        if (settings) sala.configure(settings);
        return sala.addHuman(conexao, perfil);
      }
      case 'room:join': {
        const { code, token, password, ...profile } = parsePayload(joinRoomSchema, payload);
        const perfil = await this.perfil(profile);
        const sala = this.sala;
        if (!sala || sala.isDisposed || code !== this.code) throw fail('ROOM_NOT_FOUND', MESSAGES.roomNotFound);
        hold(sala);
        const here = conexao.jogadorId && sala.isBound(conexao.jogadorId, conexao) ? conexao.jogadorId : null;
        // Token válido = mesmo assento (mesmo no meio da partida); já sentado aqui = idempotente.
        const seatId = (token ? sala.playerIdForToken(token) : null) ?? here;
        if (seatId) return sala.reconnect(seatId, conexao, perfil);
        sala.assertCanJoin();
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
