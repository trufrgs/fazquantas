import { randomBytes } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Clock, HostTiming } from '@fodinha/engine';
import { Server } from 'socket.io';
import {
  DEFAULT_CLEANUP_INTERVAL_MS,
  DEFAULT_HOST,
  DEFAULT_IDLE_ROOM_MS,
  DEFAULT_LOBBY_GRACE_MS,
  DEFAULT_MAX_ROOMS,
  DEFAULT_PORT,
  DEFAULT_RATE_LIMIT,
  isDirectory,
  type CorsOrigins,
  type RateLimitOptions,
} from './config';
import { registerHandlers } from './handlers';
import { consoleLogger, type Logger } from './logger';
import { RoomManager } from './rooms';
import { createStaticHandler } from './static';
import type { FodinhaIO } from './types';

export interface FodinhaServerOptions {
  /** 0 = porta efêmera. Padrão 3001. */
  port?: number;
  /** Padrão 0.0.0.0 (aceita conexões da rede local). */
  host?: string;
  /** `true` (padrão) = qualquer origem. */
  corsOrigins?: CorsOrigins;
  /** Build do web para servir; ignorado se a pasta não existir. */
  staticDir?: string | null;
  /** Repassado ao `GameHost` de cada partida. */
  timing?: Partial<HostTiming>;
  /** Intervalo da limpeza de salas ociosas. Padrão 30 s. */
  cleanupIntervalMs?: number;
  /** Tempo para reconectar fora da partida antes de perder o assento. Padrão 60 s. */
  lobbyGraceMs?: number;
  /** Sala sem nenhum humano conectado por esse tempo é removida. Padrão 5 min. */
  idleRoomMs?: number;
  /** Teto de salas simultâneas. Padrão 5000. */
  maxRooms?: number;
  /** Limite de mensagens por socket. Padrão 20 de rajada, 10/s. */
  rateLimit?: RateLimitOptions;
  /** Relógio (epoch ms); injetável nos testes. */
  now?: () => number;
  /** Aleatório em [0, 1) para códigos, sementes e avatares; padrão usa `crypto`. */
  random?: () => number;
  logger?: Logger;
}

export interface FodinhaServer {
  httpServer: HttpServer;
  io: FodinhaIO;
  /** URL para conectar (localhost quando escutando em todas as interfaces). */
  url: string;
  port: number;
  rooms: RoomManager;
  close(): Promise<void>;
}

/** Aleatório criptográfico em [0, 1), com 48 bits. */
export function cryptoRandom(): number {
  return randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

function isOriginAllowed(origin: string, corsOrigins: CorsOrigins): boolean {
  return corsOrigins === true || corsOrigins.includes(origin.replace(/\/+$/, ''));
}

function displayHost(host: string): string {
  if (host === '0.0.0.0' || host === '::' || host === '') return 'localhost';
  return host.includes(':') ? `[${host}]` : host;
}

function listen(httpServer: HttpServer, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    httpServer.once('error', onError);
    httpServer.listen(port, host, () => {
      httpServer.off('error', onError);
      resolve();
    });
  });
}

/** Sobe HTTP (`/health` + estáticos) e socket.io com as salas do Fodinha. */
export async function createFodinhaServer(opts: FodinhaServerOptions = {}): Promise<FodinhaServer> {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? cryptoRandom;
  const logger = opts.logger ?? consoleLogger;
  const corsOrigins = opts.corsOrigins ?? true;
  const startedAt = now();

  let serveStatic: ReturnType<typeof createStaticHandler> | null = null;
  if (opts.staticDir) {
    if (isDirectory(opts.staticDir)) serveStatic = createStaticHandler(opts.staticDir);
    else logger.warn(`Pasta de estáticos não encontrada (${opts.staticDir}); servindo só a API.`);
  }

  const sendJson = (req: IncomingMessage, res: ServerResponse, status: number, body: unknown) => {
    const text = JSON.stringify(body);
    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
    };
    const origin = req.headers.origin;
    if (corsOrigins === true) headers['Access-Control-Allow-Origin'] = '*';
    else if (origin && isOriginAllowed(origin, corsOrigins)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers.Vary = 'Origin';
    }
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : text);
  };

  const sendText = (res: ServerResponse, status: number, text: string) => {
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
  };

  const handleHttp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const pathname = (req.url ?? '/').split(/[?#]/, 1)[0] || '/';
    if (pathname === '/health') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        sendText(res, 405, 'Método não permitido.');
        return;
      }
      sendJson(req, res, 200, {
        ok: true,
        rooms: manager.size,
        uptimeSec: Math.max(0, Math.floor((now() - startedAt) / 1000)),
      });
      return;
    }
    if (serveStatic) {
      await serveStatic(req, res);
      return;
    }
    if (pathname === '/') {
      sendText(res, 200, 'Servidor do Fodinha no ar.');
      return;
    }
    sendText(res, 404, 'Não encontrado.');
  };

  const httpServer = createServer((req, res) => {
    handleHttp(req, res).catch((error: unknown) => {
      logger.error('erro ao responder HTTP', error);
      if (!res.headersSent) sendText(res, 500, 'Erro interno.');
      else res.destroy();
    });
  });

  // O handler acima fica guardado; o socket.io intercepta só o caminho /socket.io/.
  const io: FodinhaIO = new Server(httpServer, {
    serveClient: false,
    cors: { origin: corsOrigins === true ? true : corsOrigins, methods: ['GET', 'POST'] },
    // Mensagens do cliente são minúsculas; isso barra payloads gigantes.
    maxHttpBufferSize: 64 * 1024,
    // Com lista de origens, o websocket (que não passa por CORS) também respeita a lista.
    allowRequest:
      corsOrigins === true
        ? undefined
        : (req, callback) => {
            const origin = req.headers.origin;
            callback(null, origin === undefined || isOriginAllowed(origin, corsOrigins));
          },
  });

  const clock: Clock = {
    now,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };

  // O handler HTTP lê `manager` só quando chega a primeira requisição (depois do listen).
  const manager = new RoomManager({
    io,
    now,
    random,
    clock,
    timing: opts.timing,
    lobbyGraceMs: opts.lobbyGraceMs ?? DEFAULT_LOBBY_GRACE_MS,
    idleRoomMs: opts.idleRoomMs ?? DEFAULT_IDLE_ROOM_MS,
    maxRooms: opts.maxRooms ?? DEFAULT_MAX_ROOMS,
    logger,
  });

  const rateLimit = opts.rateLimit ?? DEFAULT_RATE_LIMIT;
  io.on('connection', (socket) => {
    registerHandlers(socket, { rooms: manager, logger, now, rateLimit });
  });

  try {
    await listen(httpServer, opts.port ?? DEFAULT_PORT, opts.host ?? DEFAULT_HOST);
  } catch (error) {
    await io.close().catch(() => {});
    throw error;
  }

  const cleanupTimer = setInterval(() => {
    try {
      manager.cleanup();
    } catch (error) {
      logger.error('erro na limpeza de salas', error);
    }
  }, opts.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  const { port } = httpServer.address() as AddressInfo;
  const url = `http://${displayHost(opts.host ?? DEFAULT_HOST)}:${port}`;

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      clearInterval(cleanupTimer);
      manager.disposeAll();
      const closed = io.close();
      // Conexões HTTP keep-alive seguram o close; depois que o socket.io fechou, derruba o resto.
      setImmediate(() => httpServer.closeAllConnections());
      await closed;
    })();
    return closing;
  };

  return { httpServer, io, url, port, rooms: manager, close };
}
