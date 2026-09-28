import { statSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_PORT = 3001;
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_CLEANUP_INTERVAL_MS = 30_000;
export const DEFAULT_LOBBY_GRACE_MS = 60_000;
export const DEFAULT_IDLE_ROOM_MS = 5 * 60_000;
/** Teto de salas simultâneas (proteção contra abuso; uma sala é leve). */
export const DEFAULT_MAX_ROOMS = 5_000;
export const DEFAULT_RATE_LIMIT: Readonly<RateLimitOptions> = Object.freeze({
  burst: 20,
  perSecond: 10,
});

/** Origens do app nativo: iOS usa `capacitor://localhost`; Android, `http(s)://localhost`. */
export const CAPACITOR_ORIGINS: readonly string[] = [
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
];

export interface RateLimitOptions {
  /** Mensagens aceitas numa rajada. */
  burst: number;
  /** Reposição por segundo. */
  perSecond: number;
}

/** `true` = qualquer origem; lista = só essas. */
export type CorsOrigins = true | string[];

export interface EnvConfig {
  port: number;
  host: string;
  corsOrigins: CorsOrigins;
  staticDir: string | null;
}

export function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * `CORS_ORIGINS` separado por vírgula. Vazio (ou `*`) libera qualquer origem; com lista, as
 * origens do Capacitor entram junto para o app nativo continuar funcionando.
 */
export function parseCorsOrigins(raw: string | undefined): CorsOrigins {
  const list = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (list.length === 0 || list.includes('*')) return true;
  return [...new Set([...list, ...CAPACITOR_ORIGINS])];
}

export function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`PORT inválida: "${raw}" (use um número de 0 a 65535).`);
  }
  return port;
}

/**
 * Lê a configuração do ambiente: `PORT` (3001), `HOST` (0.0.0.0), `CORS_ORIGINS` e `STATIC_DIR`.
 * Sem `STATIC_DIR`, usa `defaultStaticDir` se a pasta existir (o build do web).
 */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
  opts: { cwd?: string; defaultStaticDir?: string } = {},
): EnvConfig {
  const cwd = opts.cwd ?? process.cwd();
  const explicit = env.STATIC_DIR?.trim();
  let staticDir: string | null = null;
  if (explicit) staticDir = path.resolve(cwd, explicit);
  else if (opts.defaultStaticDir && isDirectory(opts.defaultStaticDir)) {
    staticDir = path.resolve(opts.defaultStaticDir);
  }
  return {
    port: parsePort(env.PORT),
    host: env.HOST?.trim() || DEFAULT_HOST,
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS),
    staticDir,
  };
}
