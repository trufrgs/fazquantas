import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/**
 * Jogo online ligado. Desligado (`VITE_MULTIPLAYER=off`) quando o web sobe sem servidor: some o
 * "Jogar com a gurizada" e o link de convite abre o início.
 */
export const multiplayer = import.meta.env.VITE_MULTIPLAYER !== 'off';

/** O Worker de produção (o site e os apps nativos falam com ele). */
const PRODUCTION_SERVER = 'https://fazquantas-api.fancy-night-938c.workers.dev';

/**
 * URL do servidor (o Worker do Cloudflare). Ordem: `VITE_SERVER_URL` → no desenvolvimento, o
 * `wrangler dev` na porta 8787 do mesmo host (funciona de celulares na mesma rede) → produção.
 */
export function serverUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (import.meta.env.DEV) {
    return `${window.location.protocol === 'https:' ? 'https' : 'http'}://${window.location.hostname || 'localhost'}:8787`;
  }
  return PRODUCTION_SERVER;
}

/** Link de convite para uma sala. */
export function inviteLink(code: string): string {
  // No app nativo a origem é "localhost": o convite aponta para o site.
  const base = isNative ? (import.meta.env.VITE_SITE_URL || 'https://fazquantas.pages.dev') : window.location.origin;
  return `${base}/?sala=${code}`;
}

/**
 * O código da sala num texto colado: a mensagem do convite inteira, só o link ou só o código. No
 * iPhone o link do convite sempre abre no Safari (a Apple não deixa abrir no app da tela de início):
 * no app, "Colar convite" lê o que a pessoa copiou no WhatsApp.
 */
export function codigoDoConvite(texto: string): string | null {
  const m = /[?&]sala=([A-Za-z0-9]{4})\b/.exec(texto) ?? /\bsala\s+([A-Za-z0-9]{4})\b/i.exec(texto) ?? /^\s*([A-Za-z0-9]{4})\s*$/.exec(texto);
  return m ? m[1]!.toUpperCase() : null;
}

/** Compartilha pelo menu nativo (Capacitor/Web Share) ou copia para a área de transferência. */
export async function shareInvite(code: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = inviteLink(code);
  // No menu de compartilhar, o link vai só no `url`: o WhatsApp (e o Android) junta o texto e o link
  // numa mensagem só, e com o link também no texto ele chegava duas vezes.
  const text = `Buenas! Bora uma Fodinha? Entra na sala ${code}:`;
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'Faz quantas?', text, url });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title: 'Faz quantas?', text, url });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
