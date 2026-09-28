import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { CAPACITOR_ORIGINS } from '../src/config';
import { connect, createRoom, rawRequest, startServer } from './helpers';

const IMMUTABLE = 'public, max-age=31536000, immutable';

/** Build falso do web num diretório temporário, com um segredo do lado de fora. */
function fakeWebBuild(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fodinha-static-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const dist = path.join(root, 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Fodinha</title>');
  writeFileSync(path.join(dist, 'assets', 'app-3f9a.js'), 'console.log("fodinha")');
  writeFileSync(path.join(dist, 'assets', 'style-77aa.css'), 'body{margin:0}');
  writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(path.join(dist, 'manifest.webmanifest'), '{"name":"Fodinha"}');
  writeFileSync(path.join(dist, '.env'), 'SEGREDO=1');
  writeFileSync(path.join(root, 'secret.txt'), 'SEGREDO');
  return dist;
}

describe('HTTP', () => {
  it('/health responde com salas e uptime', async () => {
    let now = 10_000;
    const server = await startServer({ now: () => now });
    const ana = await connect(server);
    await createRoom(ana);
    now += 42_500;

    const res = await rawRequest(server.url, '/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(JSON.parse(res.body)).toEqual({ ok: true, rooms: 1, uptimeSec: 42 });

    const viaFetch = await fetch(`${server.url}/health?x=1`);
    expect(await viaFetch.json()).toMatchObject({ ok: true });
    expect((await rawRequest(server.url, '/health', { method: 'POST' })).status).toBe(405);
    // Sem build do web: raiz responde, o resto é 404.
    expect((await rawRequest(server.url, '/')).status).toBe(200);
    expect((await rawRequest(server.url, '/qualquer')).status).toBe(404);
  });

  it('serve o build do web com tipos, cache e fallback de SPA', async () => {
    const server = await startServer({ staticDir: fakeWebBuild() });

    const index = await rawRequest(server.url, '/');
    expect(index.status).toBe(200);
    expect(index.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(index.headers['cache-control']).toBe('no-cache');
    expect(index.body).toContain('<title>Fodinha</title>');

    const js = await rawRequest(server.url, '/assets/app-3f9a.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(js.headers['cache-control']).toBe(IMMUTABLE);
    expect(js.body).toBe('console.log("fodinha")');

    const css = await rawRequest(server.url, '/assets/style-77aa.css');
    expect(css.headers['content-type']).toBe('text/css; charset=utf-8');
    expect(css.headers['cache-control']).toBe(IMMUTABLE);

    const svg = await rawRequest(server.url, '/favicon.svg');
    expect(svg.headers['content-type']).toBe('image/svg+xml');
    expect(svg.headers['cache-control']).toBe('no-cache');
    const manifest = await rawRequest(server.url, '/manifest.webmanifest');
    expect(manifest.headers['content-type']).toBe('application/manifest+json; charset=utf-8');

    for (const route of ['/sala/ABCD', '/jogar?sala=ABCD', '/index.html']) {
      const res = await rawRequest(server.url, route);
      expect(res.status, route).toBe(200);
      expect(res.body, route).toContain('<title>Fodinha</title>');
      expect(res.headers['cache-control'], route).toBe('no-cache');
    }

    expect((await rawRequest(server.url, '/assets/app-velho.js')).status).toBe(404);
    expect((await rawRequest(server.url, '/nao-existe.png')).status).toBe(404);
    expect((await rawRequest(server.url, '/.env')).status).toBe(404);

    const head = await rawRequest(server.url, '/', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect((await rawRequest(server.url, '/', { method: 'POST' })).status).toBe(405);

    const etag = String(js.headers.etag);
    const cached = await rawRequest(server.url, '/assets/app-3f9a.js', {
      headers: { 'If-None-Match': etag },
    });
    expect(cached.status).toBe(304);
    expect(cached.body).toBe('');

    // /health continua funcionando com estáticos.
    expect(JSON.parse((await rawRequest(server.url, '/health')).body)).toMatchObject({ ok: true });
  });

  it('não serve nada fora da pasta (path traversal)', async () => {
    const server = await startServer({ staticDir: fakeWebBuild() });
    const attempts = [
      '/../secret.txt',
      '/assets/../../secret.txt',
      '/%2e%2e/secret.txt',
      '/%2E%2E%2Fsecret.txt',
      '/..%2fsecret.txt',
      '/assets/..%2f..%2fsecret.txt',
      '/..%5csecret.txt',
      '/%2e%2e%5c%2e%2e%5csecret.txt',
      '//..//secret.txt',
      '/secret.txt%00.html',
      '/%E0%A4%A',
    ];
    for (const attempt of attempts) {
      const res = await rawRequest(server.url, attempt);
      expect(res.body, attempt).not.toContain('SEGREDO');
      expect([400, 404], attempt).toContain(res.status);
    }
  });

  it('socket.io por polling funciona ao lado dos estáticos', async () => {
    const server = await startServer({ staticDir: fakeWebBuild() });
    const ana = await connect(server, ['polling']);
    const { code } = await createRoom(ana);
    expect(code).toHaveLength(4);
  });

  it('com lista de origens: origem estranha é barrada, a do Capacitor passa', async () => {
    const server = await startServer({
      corsOrigins: ['https://fodinha.example', ...CAPACITOR_ORIGINS],
    });
    const handshake = (origin: string) =>
      rawRequest(server.url, '/socket.io/?EIO=4&transport=polling', {
        headers: { Origin: origin },
      });

    expect((await handshake('https://malvado.example')).status).toBe(403);
    const capacitor = await handshake('capacitor://localhost');
    expect(capacitor.status).toBe(200);
    expect(capacitor.headers['access-control-allow-origin']).toBe('capacitor://localhost');
    expect((await handshake('https://fodinha.example')).status).toBe(200);

    const health = await rawRequest(server.url, '/health', {
      headers: { Origin: 'https://fodinha.example' },
    });
    expect(health.headers['access-control-allow-origin']).toBe('https://fodinha.example');
    const stranger = await rawRequest(server.url, '/health', {
      headers: { Origin: 'https://malvado.example' },
    });
    expect(stranger.headers['access-control-allow-origin']).toBeUndefined();

    // Sem cabeçalho Origin (app nativo, testes, curl) conecta normalmente.
    const ana = await connect(server);
    await createRoom(ana);
  });
});
