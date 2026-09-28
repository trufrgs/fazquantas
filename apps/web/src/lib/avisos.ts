import { useSettings } from '../stores/settings';
import { serverUrl } from './platform';

/**
 * Avisos para quem não está olhando a mesa: o título da aba muda e, com permissão, sai uma
 * notificação do sistema. Com a página à vista, o som e a vibração da vez já bastam.
 */

const BASE_TITLE = typeof document !== 'undefined' ? document.title : '';
const TURN_BADGE = '🔔 Tua vez';
let badge: string | null = null;
/** É a vez desta pessoa agora (para avisar se ela esconder a página no meio da vez). */
let myTurn = false;
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
    else if (hidden() && myTurn) setBadge(TURN_BADGE);
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

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
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
    const r = await fetch(`${serverUrl()}/api/avisos/chave`);
    const { publicKey } = (await r.json()) as { publicKey?: string };
    if (!publicKey) return false;
    const key = keyBytes(publicKey);
    let sub = await reg.pushManager.getSubscription();
    // Assinatura feita com outra chave do servidor (a chave foi trocada): não recebe mais nada.
    if (sub && !sameKey(sub.options.applicationServerKey, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
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

/** A mesa diz se é a vez desta pessoa (a cada visão nova). */
export function setMyTurn(on: boolean) {
  myTurn = on;
  if (!on && badge === TURN_BADGE) setBadge(null);
}

/** A vez chegou e a pessoa não está olhando. */
export function warnTurn(kind: 'bid' | 'play', secondsLeft: number | null) {
  if (!hidden()) return;
  const what = kind === 'bid' ? 'palpitar' : 'jogar';
  setBadge(TURN_BADGE);
  void show('Tua vez!', secondsLeft ? `Tua vez de ${what}. Tem ${secondsLeft} s.` : `Tua vez de ${what}.`, 'vez');
}

/** Algo aconteceu na sala enquanto a pessoa estava em outra tela. */
export function warnRoom(text: string, tag = 'sala') {
  if (!hidden()) return;
  // A vez pesa mais que a notícia da sala: não troca o aviso.
  if (badge !== TURN_BADGE) setBadge('🔔 Sala');
  void show('Faz quantas?', text, tag);
}
