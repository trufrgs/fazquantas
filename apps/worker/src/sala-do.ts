import { DurableObject } from 'cloudflare:workers';
import {
  ROOM_CAPACITY,
  WS_CLOSE,
  WS_PING,
  WS_PONG,
  type Ack,
  type ServerToClientEvents,
  type WireToClient,
} from '@fodinha/engine';
import {
  consoleLogger,
  SalaServidor,
  type Aviso,
  type Conexao,
  type PartidaRanqueada,
  type SalaSalva,
} from '@fodinha/sala';
import { rankingStub } from './ranking-do';
import { AlarmClock } from './relogio';

/** No lobby, quem caiu tem esse tempo para voltar ao assento (dá para ir ao WhatsApp chamar gente). */
export const LOBBY_GRACE_MS = 3 * 60_000;
/** Sem nenhum humano conectado por esse tempo, a sala acaba e o código fica livre. */
export const IDLE_ROOM_MS = 15 * 60_000;
/** `RAPIDO=1` (só nos testes E2E): pausas curtas para a partida acabar em segundos. */
const FAST_TIMING = { botThinkMs: [60, 140] as [number, number], trickPauseMs: 300, roundPauseMs: 500, forcedPlayMs: 80, dealMs: 120, awayActMs: 250 };

/** O que fica preso a cada WebSocket e sobrevive à hibernação. */
interface Anexo {
  jogadorId: string | null;
  /** Código da sala: acordando sem nada salvo, a sala ainda sabe quem é. */
  codigo: string;
}

/** Uma conexão da sala sobre um WebSocket hibernável. */
class ConexaoWs implements Conexao {
  jogadorId: string | null;
  private readonly codigo: string;

  constructor(private readonly ws: WebSocket) {
    const anexo = ws.deserializeAttachment() as Anexo | null;
    this.jogadorId = anexo?.jogadorId ?? null;
    this.codigo = anexo?.codigo ?? '';
  }

  enviar<E extends keyof ServerToClientEvents>(evento: E, ...dados: Parameters<ServerToClientEvents[E]>): void {
    this.send(dados.length > 0 ? { e: evento, d: dados[0] } : { e: evento });
  }

  responder(id: number, resposta: Ack<object>): void {
    this.send({ id, r: resposta });
  }

  fechar(codigo: number, motivo: string): void {
    try {
      this.ws.close(codigo, motivo.slice(0, 120));
    } catch {
      // já fechada
    }
  }

  vincular(jogadorId: string | null): void {
    try {
      this.ws.serializeAttachment({ jogadorId, codigo: this.codigo } satisfies Anexo);
    } catch {
      // fechada: não importa mais
    }
  }

  private send(msg: WireToClient): void {
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      // fechando: a queda chega pelo webSocketClose
    }
  }
}

export interface SalaInfo {
  exists: boolean;
  status?: string;
  hasPassword?: boolean;
  seats?: number;
  capacity?: number;
}

/**
 * Uma sala num Durable Object: aceita os WebSockets (hibernáveis), passa as mensagens ao
 * `SalaServidor`, salva o estado a cada mudança e usa o alarme como relógio.
 */
export class SalaDO extends DurableObject<Env> {
  private code = '';
  private servidor: SalaServidor | null = null;
  private readonly relogio: AlarmClock;
  private readonly conexoes = new WeakMap<WebSocket, ConexaoWs>();
  private salvando = false;
  /** Há resultado de ranking esperando para ser enviado. */
  private rankingPendente = true;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.relogio = new AlarmClock(ctx.storage, Date.now, (error) => console.error('[alarme]', error));
    // Ping do cliente respondido sem acordar a sala: a conexão fica viva de graça.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(WS_PING, WS_PONG));
    void ctx.blockConcurrencyWhile(async () => {
      const salva = await ctx.storage.get<SalaSalva>('sala');
      const sockets = ctx.getWebSockets();
      if (salva) {
        this.servidorPara(salva.code).restore(
          salva,
          sockets.map((ws) => this.conexao(ws)),
        );
      } else {
        // Nada salvo, mas com conexão aberta (sala ainda não criada): recupera o código delas.
        const codigo = (sockets[0]?.deserializeAttachment() as Anexo | null)?.codigo;
        if (codigo) this.servidorPara(codigo);
      }
      await this.retomarRanking();
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const code = request.headers.get('x-codigo') ?? '';
    const url = new URL(request.url);
    if (url.pathname.endsWith('/info')) return Response.json(this.info());
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Esperava um WebSocket.', { status: 426 });
    }
    this.servidorPara(this.code || code);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ jogadorId: null, codigo: this.code } satisfies Anexo);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.servidor?.receive(this.conexao(ws), message);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.servidor?.disconnected(this.conexao(ws));
    try {
      ws.close(code === 1005 ? 1000 : code, reason);
    } catch {
      // já fechada
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.servidor?.disconnected(this.conexao(ws));
  }

  override async alarm(): Promise<void> {
    const r = this.relogio.fire();
    if (!r.ran) console.log(`[${this.code}] alarme sem timer vencido`, JSON.stringify(r));
    if (this.rankingPendente) await this.retomarRanking();
  }

  // ---------------------------------------------------------------------------

  private servidorPara(code: string): SalaServidor {
    if (this.servidor && this.code === code) return this.servidor;
    this.code = code;
    this.servidor = new SalaServidor(code, {
      relogio: this.relogio,
      aleatorio: Math.random,
      timing: (this.env.RAPIDO as string) === '1' ? FAST_TIMING : undefined,
      graceMs: LOBBY_GRACE_MS,
      ociosaMs: IDLE_ROOM_MS,
      logger: consoleLogger,
      aoMudar: () => this.agendarSalvar(),
      aoEncerrar: (motivo) => this.encerrar(motivo),
      aoTerminarRanqueada: (p) => void this.registrarRanking(p),
      aoAvisar: (a) => this.avisar(a),
    });
    return this.servidor;
  }

  private conexao(ws: WebSocket): ConexaoWs {
    let c = this.conexoes.get(ws);
    if (!c) {
      c = new ConexaoWs(ws);
      this.conexoes.set(ws, c);
    }
    return c;
  }

  private info(): SalaInfo {
    const sala = this.servidor?.room;
    if (!sala || sala.isDisposed) return { exists: false };
    return { exists: true, status: sala.status, hasPassword: sala.hasPassword, seats: sala.seatCount, capacity: ROOM_CAPACITY };
  }

  /** Salva uma vez por rodada de mudanças (várias no mesmo tique viram uma gravação). */
  private agendarSalvar(): void {
    if (this.salvando) return;
    this.salvando = true;
    queueMicrotask(() => {
      this.salvando = false;
      const salva = this.servidor?.serialize();
      if (salva) void this.ctx.storage.put('sala', salva).catch((e) => console.error('[salvar]', e));
    });
  }

  private encerrar(motivo: string): void {
    console.log(`[${this.code}] sala encerrada: ${motivo}`);
    this.relogio.clear();
    void this.ctx.storage.deleteAll().catch((e) => console.error('[encerrar]', e));
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(WS_CLOSE.gone, motivo);
      } catch {
        // já fechada
      }
    }
  }

  /** Guarda o resultado antes de mandar: se o ranking falhar, tenta de novo depois. */
  private async registrarRanking(p: PartidaRanqueada): Promise<void> {
    try {
      await this.ctx.storage.put(`ranking:${p.id}`, p);
      await this.enviarRanking(p);
    } catch (error) {
      this.rankingPendente = true;
      console.error('[ranking]', error);
    }
  }

  private async enviarRanking(p: PartidaRanqueada): Promise<void> {
    const stub = rankingStub(this.env);
    await stub.registrar(p);
    await this.ctx.storage.delete(`ranking:${p.id}`);
  }

  private async retomarRanking(): Promise<void> {
    this.rankingPendente = false;
    const pendentes = await this.ctx.storage.list<PartidaRanqueada>({ prefix: 'ranking:' });
    for (const p of pendentes.values()) {
      try {
        await this.enviarRanking(p);
      } catch (error) {
        this.rankingPendente = true;
        console.error('[ranking pendente]', error);
      }
    }
  }

  /** A vez chegou (ou a partida começou) para quem está com o jogo escondido: push no celular. */
  private avisar(aviso: Aviso): void {
    if (!aviso.profileId) return;
    const stub = this.env.AVISOS.get(this.env.AVISOS.idFromName('geral'));
    const msg =
      aviso.kind === 'turn'
        ? { title: 'Tua vez!', body: `É tua vez na sala ${this.code}.`, tag: `vez-${this.code}` }
        : { title: 'Começou!', body: `A partida começou na sala ${this.code}.`, tag: `sala-${this.code}` };
    void stub
      .enviar(aviso.profileId, { ...msg, url: `${this.env.SITE}/?sala=${this.code}` })
      .catch((error: unknown) => console.error('[aviso]', error));
  }
}
