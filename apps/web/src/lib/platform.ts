import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/**
 * URL do servidor multiplayer. Ordem: `VITE_SERVER_URL` → mesma origem em produção web →
 * porta 3001 no mesmo host em desenvolvimento (funciona de celulares na mesma rede).
 */
export function serverUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (import.meta.env.DEV || isNative) {
    return `${window.location.protocol === 'https:' ? 'https' : 'http'}://${window.location.hostname || 'localhost'}:3001`;
  }
  return window.location.origin;
}

/** Link de convite para uma sala. */
export function inviteLink(code: string): string {
  const base = import.meta.env.VITE_SERVER_URL && isNative ? import.meta.env.VITE_SERVER_URL : window.location.origin;
  return `${base}/?sala=${code}`;
}

/** Compartilha pelo menu nativo (Capacitor/Web Share) ou copia para a área de transferência. */
export async function shareInvite(code: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = inviteLink(code);
  const text = `Buenas! Bora uma Fodinha? Entra na sala ${code}: ${url}`;
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'Faz Quantas?', text, url });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title: 'Faz Quantas?', text, url });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
