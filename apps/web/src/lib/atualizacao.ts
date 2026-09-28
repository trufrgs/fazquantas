import { useApp } from '../stores/app';

/**
 * Versão nova do jogo: o service worker novo assume na hora (skipWaiting + clientsClaim) e a página
 * recarrega sozinha num momento seguro — fora da mesa, ou com a aba escondida (quem volta para uma
 * sala online entra de novo sozinho; a partida local fica salva). Sem isso, quem deixava a aba ou o
 * app instalado aberto ficava para sempre na versão antiga.
 */

/** De quanto em quanto tempo pergunta ao servidor se tem versão nova (além de ao voltar para a aba). */
const CHECK_EVERY_MS = 30 * 60_000;

let pending = false;

function safeToReload(): boolean {
  return useApp.getState().screen !== 'game' || document.visibilityState === 'hidden';
}

function reloadWhenSafe(): void {
  if (!pending || !safeToReload()) return;
  pending = false;
  window.location.reload();
}

export function startUpdates(registerSW: (opts: { immediate?: boolean; onRegisteredSW?: (url: string, reg: ServiceWorkerRegistration | undefined) => void }) => unknown): void {
  if (!('serviceWorker' in navigator)) return;
  // Sem controlador ainda = primeira instalação, não é atualização.
  let hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    pending = true;
    reloadWhenSafe();
  });
  useApp.subscribe(reloadWhenSafe);
  registerSW({
    immediate: true,
    onRegisteredSW: (_url, reg) => {
      if (!reg) return;
      const check = () => void reg.update().catch(() => undefined);
      window.setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
        else reloadWhenSafe();
      });
    },
  });
}
