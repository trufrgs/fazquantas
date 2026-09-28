import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import path from 'node:path';
import { loadConfig } from './config';
import { consoleLogger } from './logger';
import { createFodinhaServer } from './server';

/** Endereços IPv4 da rede local, para abrir no celular. */
function lanUrls(port: number): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net): net is NetworkInterfaceInfo => net?.family === 'IPv4' && !net.internal)
    .map((net) => `http://${net.address}:${port}`);
}

async function main(): Promise<void> {
  // Em produção (dist/) e em dev (src/), o build do web fica em apps/web/dist.
  const config = loadConfig(process.env, {
    defaultStaticDir: path.resolve(import.meta.dirname, '../../web/dist'),
  });
  // FODINHA_FAST=1: tempos curtos (testes E2E e demonstração).
  const fast = process.env.FODINHA_FAST === '1';
  const server = await createFodinhaServer({
    ...config,
    logger: consoleLogger,
    timing: fast
      ? { botThinkMs: [60, 140], trickPauseMs: 300, roundPauseMs: 500, forcedPlayMs: 80, dealMs: 120, awayActMs: 250 }
      : undefined,
  });

  const listening =
    config.host === '0.0.0.0' || config.host === '::'
      ? [server.url, ...lanUrls(server.port)]
      : [server.url];
  consoleLogger.info(`Servidor do Fodinha no ar: ${listening.join('  ')}`);
  consoleLogger.info(
    config.staticDir ? `Servindo o web de ${config.staticDir}` : 'Sem build do web: só a API.',
  );
  consoleLogger.info(
    config.corsOrigins === true
      ? 'CORS: qualquer origem.'
      : `CORS: ${config.corsOrigins.join(', ')}`,
  );

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    consoleLogger.info(`${signal} recebido; encerrando…`);
    // Se algo travar, não fica pendurado.
    setTimeout(() => process.exit(1), 5_000).unref();
    server.close().then(
      () => process.exit(0),
      (error: unknown) => {
        consoleLogger.error('erro ao encerrar', error);
        process.exit(1);
      },
    );
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  consoleLogger.error('não foi possível subir o servidor', error);
  process.exit(1);
});
