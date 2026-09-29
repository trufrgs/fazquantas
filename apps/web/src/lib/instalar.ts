import { useSyncExternalStore } from 'react';
import { isNative } from './platform';

/**
 * Instalar o jogo como app (PWA), sem loja: no computador (Windows, Mac, Linux), no Android e no
 * iPhone. Onde o navegador oferece o pedido de instalação (`beforeinstallprompt`: Chrome, Edge,
 * Samsung Internet, Opera), o botão dos ajustes chama esse pedido; nos outros, a tela explica o
 * caminho daquele navegador.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Como instalar neste aparelho e navegador. */
export type ComoInstalar =
  /** Já está rodando como app (ou acabou de instalar). */
  | 'instalado'
  /** O navegador oferece o pedido de instalação: um toque no botão. */
  | 'pedido'
  /** iPhone e iPad (qualquer navegador): Compartilhar → Adicionar à Tela de Início. */
  | 'ios'
  /** Safari no Mac: Arquivo → Adicionar ao Dock. */
  | 'mac-safari'
  /** Android sem o pedido (Firefox, ou recusou antes): menu do navegador. */
  | 'android'
  /** Chrome, Edge, Brave ou Opera no computador sem o pedido: ícone na barra de endereço ou menu. */
  | 'computador'
  /** Firefox no computador: não instala site como app. */
  | 'sem-suporte';

let pedido: BeforeInstallPromptEvent | null = null;
let acabouDeInstalar = false;
const ouvintes = new Set<() => void>();
const avisar = () => {
  for (const l of ouvintes) l();
};

/** Guarda o pedido de instalação do navegador (tem que ligar antes do primeiro render). */
export function startInstalar(): void {
  if (typeof window === 'undefined' || isNative) return;
  // Sem preventDefault: o navegador segue oferecendo do jeito dele; o evento fica para o botão.
  window.addEventListener('beforeinstallprompt', (e) => {
    pedido = e as BeforeInstallPromptEvent;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    acabouDeInstalar = true;
    pedido = null;
    avisar();
  });
}

function rodandoComoApp(): boolean {
  const modo = (m: string) => window.matchMedia(`(display-mode: ${m})`).matches;
  return modo('standalone') || modo('fullscreen') || modo('window-controls-overlay') || (navigator as { standalone?: boolean }).standalone === true;
}

/** Decide pelo navegador e pelo sistema (detecção por `userAgent`, só para escolher o texto). */
export function comoInstalar(ua = navigator.userAgent, touch = navigator.maxTouchPoints ?? 0, plataforma = navigator.platform ?? ''): ComoInstalar {
  if (acabouDeInstalar || rodandoComoApp()) return 'instalado';
  if (pedido) return 'pedido';
  // iPad com iPadOS se apresenta como Mac, mas tem toque.
  if (/iPad|iPhone|iPod/.test(ua) || (plataforma === 'MacIntel' && touch > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Firefox\//.test(ua)) return 'sem-suporte';
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(ua);
  if (!chromium && /Macintosh/.test(ua) && /Safari\//.test(ua)) return 'mac-safari';
  return 'computador';
}

/** Abre o pedido de instalação do navegador (só existe em `pedido`). */
export async function instalar(): Promise<'aceitou' | 'recusou' | 'indisponivel'> {
  const e = pedido;
  if (!e) return 'indisponivel';
  // O pedido só vale uma vez: depois, a tela mostra o caminho pelo menu do navegador.
  pedido = null;
  avisar();
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') {
    acabouDeInstalar = true;
    avisar();
    return 'aceitou';
  }
  return 'recusou';
}

function subscribe(listener: () => void) {
  ouvintes.add(listener);
  const m = window.matchMedia('(display-mode: standalone)');
  m.addEventListener('change', listener);
  return () => {
    ouvintes.delete(listener);
    m.removeEventListener('change', listener);
  };
}

export function useComoInstalar(): ComoInstalar {
  return useSyncExternalStore(subscribe, () => comoInstalar(), () => 'sem-suporte');
}
