/**
 * A versão do jogo: o build publicado, a limpeza do cache e a conferência ao abrir.
 *
 * Conferência ao abrir: o app velho (o service worker ainda com o build anterior) aberto por um
 * convite ou pela sala salva ia direto para a mesa e ficava velho a partida inteira, porque o
 * recarregar espera sair da sala (relato de 29/09/2026: o Igor não viu as animações novas). Agora,
 * antes de sentar em qualquer sala, o app pergunta qual é o build publicado; se é outro, limpa o
 * cache e recarrega na hora, antes de a pessoa estar numa mesa. O resto (aba que fica aberta) está em
 * `atualizacao.ts`.
 */

/** Quanto a conferência ao abrir espera pela resposta (sem rede, segue na versão que tem). */
const CONFERENCIA_MS = 2500;
/** Última versão publicada que já levou limpeza nesta aba (uma vez por versão, sem ciclo). */
const HARD_KEY = 'fodinha:limpeza';

export function alreadyHardReset(build: string): boolean {
  try {
    return sessionStorage.getItem(HARD_KEY) === build;
  } catch {
    return false;
  }
}

export function markHardReset(build: string): void {
  try {
    sessionStorage.setItem(HARD_KEY, build);
  } catch {
    // sem sessionStorage: segue sem a marca
  }
}

/** Tira o service worker e os caches: o próximo carregamento vem inteiro do servidor. */
export async function hardReset(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // sem permissão para mexer: o recarregar ainda tenta
  }
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

let conferida: Promise<void> = Promise.resolve();

/** Ao abrir (só no build de produção): versão velha limpa o cache e recarrega antes de qualquer sala. */
export function conferirVersaoAoAbrir(): void {
  // O endereço de quando abriu: o convite (`?sala=`) sai da barra logo depois, e tem de voltar junto.
  const endereco = window.location.href;
  conferida = (async () => {
    const publicado = await Promise.race([publishedBuild(), new Promise<null>((r) => window.setTimeout(() => r(null), CONFERENCIA_MS))]);
    if (!publicado || publicado === __BUILD_ID__ || alreadyHardReset(publicado)) return;
    markHardReset(publicado);
    await hardReset();
    window.location.replace(endereco);
    // A página está recarregando: ninguém senta na versão velha.
    await new Promise<never>(() => undefined);
  })();
}

/** Espera a conferência da versão ao abrir (fora do build de produção, na hora). */
export function versaoConferida(): Promise<void> {
  return conferida;
}
