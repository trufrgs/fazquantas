import { useApp } from '../stores/app';
import { useOnline } from '../stores/online';

/**
 * Versão nova do jogo chegando em aba aberta e em app instalado, sem depender de fechar tudo:
 *
 * 1. O service worker novo assume na hora (skipWaiting + clientsClaim, no vite.config.ts).
 * 2. A cada 30 min e sempre que a aba volta para a frente, o app pergunta ao servidor
 *    (`/version.json`, nunca em cache) qual é o build publicado. Se é outro, pede ao service worker
 *    para se atualizar.
 * 3. Se mesmo assim a aba continua no build velho (service worker travado, cache estragado), o app
 *    tira o service worker e os caches e recarrega do servidor.
 *
 * O recarregar só acontece em momento seguro: fora da mesa, ou com a aba escondida (quem volta para
 * uma sala online entra de novo sozinho; a partida local fica salva).
 */

/** De quanto em quanto tempo pergunta se tem versão nova (além de ao voltar para a aba). */
const CHECK_EVERY_MS = 30 * 60_000;
/** Quanto espera o service worker novo assumir antes de partir para a limpeza. */
const SW_GRACE_MS = 20_000;

type Registrar = (opts: {
  immediate?: boolean;
  onRegisteredSW?: (url: string, reg: ServiceWorkerRegistration | undefined) => void;
}) => unknown;

let pending: 'reload' | 'hard' | null = null;
let registration: ServiceWorkerRegistration | undefined;
let checking = false;
let behindSince: number | null = null;
/** Última versão publicada que já levou limpeza nesta aba (uma vez por versão, sem ciclo). */
const HARD_KEY = 'fodinha:limpeza';

function alreadyHardReset(build: string): boolean {
  try {
    return sessionStorage.getItem(HARD_KEY) === build;
  } catch {
    return false;
  }
}

function markHardReset(build: string): void {
  try {
    sessionStorage.setItem(HARD_KEY, build);
  } catch {
    // sem sessionStorage: segue sem a marca
  }
}

/**
 * Hora segura de recarregar: fora de qualquer sala online (nem conectando, nem voltando para ela) e
 * fora da mesa, ou com a aba escondida numa partida local (que fica salva). Recarregar no meio da
 * volta para a sala já apagou a mensagem de erro e largou gente no início (28/09/2026).
 */
function safeToReload(): boolean {
  const { room, status, error } = useOnline.getState();
  if (room !== null || status !== 'idle') return false;
  // Com um erro na tela (a sala acabou, te tiraram), recarregar apagaria o porquê: espera sair dela.
  if (error) return false;
  return useApp.getState().screen !== 'game' || document.visibilityState === 'hidden';
}

async function hardReset(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // sem permissão para mexer: o recarregar abaixo ainda tenta
  }
}

function applyWhenSafe(): void {
  if (!pending || !safeToReload()) return;
  const kind = pending;
  pending = null;
  if (kind === 'hard') void hardReset().then(() => window.location.reload());
  else window.location.reload();
}

/** Build publicado agora (ou `null` se não deu para saber: sem rede, servidor fora). */
export async function publishedBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: unknown };
    return typeof data.build === 'string' ? data.build : null;
  } catch {
    return null;
  }
}

async function check(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    const published = await publishedBuild();
    if (!published || published === __BUILD_ID__) {
      behindSince = null;
      return;
    }
    // Ficou para trás: o service worker novo deveria resolver sozinho.
    await registration?.update().catch(() => undefined);
    behindSince ??= Date.now();
    if (Date.now() - behindSince >= SW_GRACE_MS && pending === null && !alreadyHardReset(published)) {
      markHardReset(published);
      pending = 'hard';
      applyWhenSafe();
    } else if (!alreadyHardReset(published)) {
      window.setTimeout(() => void check(), SW_GRACE_MS);
    }
  } finally {
    checking = false;
  }
}

export function startUpdates(registerSW: Registrar): void {
  if (!('serviceWorker' in navigator)) return;
  // Sem controlador ainda = primeira instalação, não é atualização.
  let hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    pending = 'reload';
    applyWhenSafe();
  });
  useApp.subscribe(applyWhenSafe);
  useOnline.subscribe(applyWhenSafe);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
    else applyWhenSafe();
  });
  window.setInterval(() => void check(), CHECK_EVERY_MS);
  registerSW({
    immediate: true,
    onRegisteredSW: (_url, reg) => {
      registration = reg;
      void check();
    },
  });
}
