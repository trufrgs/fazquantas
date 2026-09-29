import { DurableObject } from 'cloudflare:workers';
import {
  isAsyncTurn,
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
import { contasStub } from './contas-do';
import type { EstadoSala } from './automacao-regras';
import { painelStub, type ResumoSala } from './painel-do';
import { rankingStub } from './ranking-do';
import { horaBrasilia } from './hora';
import { AlarmClock } from './relogio';

/** No lobby, quem caiu tem esse tempo para voltar ao assento (dá para ir ao WhatsApp chamar gente). */
export const LOBBY_GRACE_MS = 3 * 60_000;
/** Sem nenhum humano conectado por esse tempo, a sala acaba e o código fica livre. */
export const IDLE_ROOM_MS = 15 * 60_000;
/** `RAPIDO=1` (só nos testes E2E): pausas curtas para a partida acabar em segundos. */
const FAST_TIMING = { botThinkMs: [60, 140] as [number, number], trickPauseMs: 300, roundPauseMs: 500, bidsRevealMs: 150, forcedPlayMs: 80, dealMs: 120, awayActMs: 250 };

/** O que fica preso a cada WebSocket e sobrevive à hibernação. */
interface Anexo {
  /** Última mensagem que chegou por ele (guardada no máximo a cada 5 s). */
  visto?: number;
  jogadorId: string | null;
  /** Código da sala: acordando sem nada salvo, a sala ainda sabe quem é. */
  codigo: string;
}

/** Uma conexão da sala sobre um WebSocket hibernável. */
class ConexaoWs implements Conexao {
  jogadorId: string | null;
  private readonly codigo: string;
  private vistoEm: number;

  constructor(
    private readonly ws: WebSocket,
    /** Quando o Cloudflare respondeu o último ping dela (sem acordar a sala), ou 0. */
    private readonly ultimoPing: () => number,
  ) {
    const anexo = ws.deserializeAttachment() as Anexo | null;
    this.jogadorId = anexo?.jogadorId ?? null;
    this.codigo = anexo?.codigo ?? '';
    this.vistoEm = anexo?.visto ?? 0;
  }

  /** Há quanto tempo deu sinal de vida (ping ou mensagem); `null` se não se sabe (conexão antiga). */
  vivaHa(): number | null {
    const t = Math.max(this.ultimoPing(), this.vistoEm);
    return t > 0 ? Math.max(0, Date.now() - t) : null;
  }

  /** Chegou mensagem: guarda a hora no anexo, que sobrevive à hibernação (no máximo a cada 5 s). */
  visto(agora: number): void {
    if (agora - this.vistoEm < 5000) return;
    this.vistoEm = agora;
    this.gravar(this.jogadorId);
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
    this.gravar(jogadorId);
  }

  private gravar(jogadorId: string | null): void {
    try {
      this.ws.serializeAttachment({ jogadorId, codigo: this.codigo, visto: this.vistoEm } satisfies Anexo);
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
  /** Cada um joga no seu tempo (1 h ou mais por jogada, ou sem limite). */
  async?: boolean;
  /** De quem é a vez (na partida), para a lista "Tuas salas". */
  turn?: { playerId: string; name: string; deadline: number | null } | null;
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
  /** Por que a sala deste código acabou (guardado com a marca de fim). */
  private fimMotivo: string | null = null;
  private salvando = false;
  /** Há resultado de ranking esperando para ser enviado. */
  private rankingPendente = true;
  /** Último resumo mandado para o painel (só manda quando muda). */
  private ultimoResumo = '';
  /** A sala deste código já acabou (marca guardada): link antigo ouve "já acabou". */
  private acabou = false;
  /** Última vez que uma pessoa mexeu na sala (mensagem ou conexão); bot jogando sozinho não conta. */
  private atividade: number | null = null;
  private atividadeAvisada = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.relogio = new AlarmClock(ctx.storage, Date.now, (error) => console.error('[alarme]', error));
    // Ping do cliente respondido sem acordar a sala: a conexão fica viva de graça.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(WS_PING, WS_PONG));
    void ctx.blockConcurrencyWhile(async () => {
      const salva = await ctx.storage.get<SalaSalva>('sala');
      // A marca de fim era só a hora (até 29/09/2026); agora guarda o motivo também.
      const fim = await ctx.storage.get<number | { quando: number; motivo: string }>('fim');
      this.acabou = !salva && fim !== undefined;
      this.fimMotivo = typeof fim === 'object' && fim !== null ? fim.motivo : null;
      this.atividade = (await ctx.storage.get<number>('atividade')) ?? salva?.criadaEm ?? null;
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
    this.marcarAtividade();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ jogadorId: null, codigo: this.code, visto: Date.now() } satisfies Anexo);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.conexao(ws).visto(Date.now());
    this.marcarAtividade();
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
      conferirPerfil: (profileId, nome) => contasStub(this.env).conferir(profileId, nome),
    });
    if (this.acabou) this.servidor.markEnded(this.fimMotivo);
    return this.servidor;
  }

  private conexao(ws: WebSocket): ConexaoWs {
    let c = this.conexoes.get(ws);
    if (!c) {
      c = new ConexaoWs(ws, () => this.ultimoPing(ws));
      this.conexoes.set(ws, c);
    }
    return c;
  }

  /** O ping é respondido pelo Cloudflare sem acordar a sala, mas o horário da resposta fica guardado. */
  private ultimoPing(ws: WebSocket): number {
    try {
      return this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
    } catch {
      return 0; // WebSocket já fechado
    }
  }

  /** Saída pelo token, pela internet comum (o WebSocket de quem saiu pode ter caído). */
  async sairPorToken(token: string): Promise<boolean> {
    return this.servidor?.leaveByToken(token) ?? false;
  }

  private info(): SalaInfo {
    const sala = this.servidor?.room;
    if (!sala || sala.isDisposed) return { exists: false };
    return {
      exists: true,
      status: sala.status,
      hasPassword: sala.hasPassword,
      seats: sala.seatCount,
      capacity: ROOM_CAPACITY,
      async: isAsyncTurn(sala.turnTimeout),
      turn: sala.turn,
    };
  }

  /** Salva uma vez por rodada de mudanças (várias no mesmo tique viram uma gravação). */
  private agendarSalvar(): void {
    if (this.salvando) return;
    this.salvando = true;
    queueMicrotask(() => {
      this.salvando = false;
      const salva = this.servidor?.serialize();
      if (salva) void this.ctx.storage.put('sala', salva).catch((e) => console.error('[salvar]', e));
      this.informarPainel();
    });
  }

  /** O painel do admin fica sabendo quando a sala muda de situação (e conta as partidas). */
  private informarPainel(): void {
    const sala = this.servidor?.room;
    if (!sala || sala.isDisposed) return;
    const resumo: ResumoSala = { code: this.code, ...sala.summary() };
    const json = JSON.stringify(resumo);
    if (json === this.ultimoResumo) return;
    const antes = this.ultimoResumo ? (JSON.parse(this.ultimoResumo) as ResumoSala).status : null;
    this.ultimoResumo = json;
    const painel = painelStub(this.env);
    const tarefas: Promise<unknown>[] = [painel.sala(resumo)];
    if (antes !== null && antes !== 'playing' && resumo.status === 'playing') tarefas.push(painel.contar('partidas'));
    if (antes === 'playing' && resumo.status === 'finished') tarefas.push(painel.contar('partidas_fim'));
    this.ctx.waitUntil(Promise.all(tarefas).catch((e: unknown) => console.error('[painel]', e)));
  }

  /** Alguém mexeu na sala: guarda (e avisa o painel no máximo a cada 5 min). */
  private marcarAtividade(): void {
    const now = Date.now();
    this.atividade = now;
    if (now - this.atividadeAvisada < 5 * 60_000 || !this.code) return;
    this.atividadeAvisada = now;
    this.ctx.waitUntil(
      Promise.all([this.ctx.storage.put('atividade', now), painelStub(this.env).atividade(this.code, now)]).catch((e: unknown) =>
        console.error('[atividade]', e),
      ),
    );
  }

  /** Para a automação e o admin: a sala existe? Em que pé está? Quando alguém mexeu por último? */
  async estadoAdmin(): Promise<EstadoSala> {
    const sala = this.servidor?.room;
    if (!sala || sala.isDisposed) return { existe: false };
    const resumo = sala.summary();
    return { existe: true, status: resumo.status, conectados: resumo.conectados, atividade: this.atividade, assincrona: resumo.assincrona };
  }

  /** Admin: encerra a sala na hora (todo mundo sai), com o motivo no histórico. */
  async encerrarPeloAdmin(motivo = 'admin'): Promise<boolean> {
    const sala = this.servidor?.room;
    if (!sala || sala.isDisposed) return false;
    sala.closeByAdmin(motivo);
    return true;
  }

  /** Admin: recado para quem está na sala. Devolve quantas pessoas receberam. */
  async avisoAdmin(texto: string): Promise<number> {
    const sala = this.servidor?.room;
    if (!sala || sala.isDisposed) return 0;
    return sala.notice(texto);
  }

  private encerrar(motivo: string): void {
    console.log(`[${this.code}] sala encerrada: ${motivo}`);
    this.ultimoResumo = '';
    this.ctx.waitUntil(painelStub(this.env).salaEncerrada(this.code, motivo).catch((e: unknown) => console.error('[painel]', e)));
    this.relogio.clear();
    // Apaga tudo e deixa só a marca de que acabou, com o motivo (o link velho ouve o porquê).
    this.fimMotivo = motivo;
    void this.ctx.storage
      .deleteAll()
      .then(() => this.ctx.storage.put('fim', { quando: Date.now(), motivo: motivo.slice(0, 120) }))
      .catch((e) => console.error('[encerrar]', e));
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
      this.ctx.waitUntil(painelStub(this.env).contar('ranqueadas').catch(() => {}));
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
    // Prazo só vale ser dito na sala assíncrona (horas); na ao vivo são segundos.
    const longo = aviso.deadline != null && aviso.deadline - Date.now() > 10 * 60_000;
    const ate = longo ? ` Tens até ${horaBrasilia(aviso.deadline!)}.` : '';
    const msg =
      aviso.kind === 'turn'
        ? { title: 'Tua vez!', body: `É tua vez na sala ${this.code}.${ate}`, tag: `vez-${this.code}` }
        : aviso.kind === 'reminder'
          ? { title: 'Tua vez tá acabando', body: `Na sala ${this.code}, a mesa joga por ti às ${horaBrasilia(aviso.deadline ?? Date.now())}.`, tag: `vez-${this.code}` }
          : { title: 'Começou!', body: `A partida começou na sala ${this.code}.`, tag: `sala-${this.code}` };
    this.ctx.waitUntil(
      stub
        .enviar(aviso.profileId, { ...msg, url: `${this.env.SITE}/?sala=${this.code}` })
        .then((n) => (n > 0 ? painelStub(this.env).contar('avisos', n) : undefined))
        .catch((error: unknown) => console.error('[aviso]', error)),
    );
  }
}
