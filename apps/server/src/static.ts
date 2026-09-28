import { createReadStream, type Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.wasm': 'application/wasm',
};

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

export function contentTypeFor(file: string): string {
  return MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export type StaticHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': REVALIDATE,
  });
  res.end(text);
}

async function fileStats(file: string): Promise<Stats | null> {
  try {
    const stats = await stat(file);
    return stats.isFile() ? stats : null;
  } catch {
    return null;
  }
}

/**
 * Serve o build do web: `/assets/*` com cache eterno (nomes com hash), o resto com `no-cache`,
 * e `index.html` para rotas sem extensão (SPA). Nada fora de `rootDir` é servido.
 */
export function createStaticHandler(rootDir: string): StaticHandler {
  const root = path.resolve(rootDir);
  const indexFile = path.join(root, 'index.html');

  const serveFile = async (
    req: IncomingMessage,
    res: ServerResponse,
    file: string,
    stats: Stats,
    cacheControl: string,
  ): Promise<void> => {
    const etag = `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': contentTypeFor(file),
      'Cache-Control': cacheControl,
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': stats.size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    try {
      await pipeline(createReadStream(file), res);
    } catch {
      res.destroy(); // cliente desistiu ou erro de leitura no meio do envio
    }
  };

  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendText(res, 405, 'Método não permitido.');
      return;
    }
    const rawPath = (req.url ?? '/').split(/[?#]/, 1)[0] || '/';
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(rawPath);
    } catch {
      sendText(res, 400, 'Endereço inválido.');
      return;
    }
    const segments = urlPath.split(/[\\/]+/);
    if (urlPath.includes('\0') || segments.includes('..')) {
      sendText(res, 400, 'Endereço inválido.');
      return;
    }
    // Arquivos ocultos (.env, .git…) nunca saem.
    if (segments.some((s) => s.startsWith('.') && s !== '.well-known')) {
      sendText(res, 404, 'Não encontrado.');
      return;
    }
    const target = path.resolve(root, `.${path.posix.normalize(`/${urlPath}`)}`);
    if (target !== root && !target.startsWith(root + path.sep)) {
      sendText(res, 400, 'Endereço inválido.');
      return;
    }
    const isAsset = urlPath.startsWith('/assets/');
    const direct = target === root ? null : await fileStats(target);
    if (direct) {
      await serveFile(req, res, target, direct, isAsset ? IMMUTABLE : REVALIDATE);
      return;
    }
    // Arquivo que não existe (asset com hash velho, imagem) é 404; rota da SPA recebe o index.
    if (target !== root && (isAsset || path.extname(urlPath) !== '')) {
      sendText(res, 404, 'Não encontrado.');
      return;
    }
    const index = await fileStats(indexFile);
    if (!index) {
      sendText(res, 404, 'Não encontrado.');
      return;
    }
    await serveFile(req, res, indexFile, index, REVALIDATE);
  };
}
