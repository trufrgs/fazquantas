import { useSettings } from '../stores/settings';
import { serverUrl } from './platform';

/**
 * Avisos para quem não está olhando a mesa: o título da aba muda e, com permissão, sai uma
 * notificação do sistema. Com a página à vista, o som e a vibração da vez já bastam.
 */

const BASE_TITLE = typeof document !== 'undefined' ? document.title : '';
let badge: string | null = null;
/** Este aparelho recebe push do servidor: a vez chega por lá, a página não repete o aviso. */
let pushActive = false;

function hidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function setBadge(text: string | null) {
  badge = text;
  document.title = text ? `${text} · Faz quantas?` : BASE_TITLE;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!hidden() && badge) setBadge(null);
  });
}

export type NotifyState = 'granted' | 'denied' | 'default' | 'unsupported';

/** O navegador deixa mostrar notificação? (iPhone só depois de instalar na tela inicial.) */
export function notifyState(): NotifyState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotifyState;
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Pede permissão (precisa ser num toque). Devolve se ficou ligado. */
export async function enableNotify(): Promise<boolean> {
  if (notifyState() === 'unsupported') return false;
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  const on = permission === 'granted';
  useSettings.getState().set({ notify: on });
  if (on) void syncPush();
  return on;
}

export async function disableNotify(): Promise<void> {
  useSettings.getState().set({ notify: false });
  pushActive = false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await fetch(`${serverUrl()}/api/avisos/cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileKey: useSettings.getState().profileKey, subscription: { endpoint: sub.endpoint } }),
    });
    await sub.unsubscribe();
  } catch {
    // sem push: nada a desfazer
  }
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Registra este aparelho para receber push do servidor (a vez chega mesmo com o jogo fechado).
 * Sem service worker ou sem suporte (navegador antigo, iPhone fora da tela inicial), não faz nada.
 */
export async function syncPush(): Promise<boolean> {
  if (!useSettings.getState().notify || notifyState() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg?.pushManager) return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const r = await fetch(`${serverUrl()}/api/avisos/chave`);
      const { publicKey } = (await r.json()) as { publicKey?: string };
      if (!publicKey) return false;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    }
    const res = await fetch(`${serverUrl()}/api/avisos/assinar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileKey: useSettings.getState().profileKey, subscription: sub.toJSON() }),
    });
    pushActive = res.ok;
    return res.ok;
  } catch {
    return false;
  }
}

async function show(title: string, body: string, tag: string) {
  if (!useSettings.getState().notify || notifyState() !== 'granted' || pushActive) return;
  const options: NotificationOptions = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/favicon-64.png' };
  try {
    // No Android, só o service worker pode mostrar notificação; no desktop, os dois servem.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { ...options, data: { url: window.location.href } });
      return;
    }
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // sem notificação: fica o título da aba
  }
}

/** A vez chegou e a pessoa não está olhando. */
export function warnTurn(kind: 'bid' | 'play', secondsLeft: number | null) {
  if (!hidden()) return;
  const what = kind === 'bid' ? 'palpitar' : 'jogar';
  setBadge('🔔 Tua vez');
  void show('Tua vez!', secondsLeft ? `Tua vez de ${what}. Tem ${secondsLeft} s.` : `Tua vez de ${what}.`, 'vez');
}

/** Algo aconteceu na sala enquanto a pessoa estava em outra tela. */
export function warnRoom(text: string, tag = 'sala') {
  if (!hidden()) return;
  setBadge('🔔 Sala');
  void show('Faz quantas?', text, tag);
}
