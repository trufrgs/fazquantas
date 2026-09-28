/**
 * Web Push sem biblioteca: assinatura VAPID (RFC 8292, ES256) e criptografia do conteúdo
 * (RFC 8291, aes128gcm), só com WebCrypto. Serve para Chrome/Android (FCM), Firefox, Edge e
 * Safari/iOS (web app instalado na tela inicial).
 */

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  /** Chave pública em base64url (65 bytes, formato não comprimido). */
  publicKey: string;
  /** Parte privada `d` em base64url (32 bytes). */
  privateKey: string;
  /** Contato do remetente para os serviços de push (`mailto:` ou `https:`). */
  subject: string;
}

const te = new TextEncoder();

export function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** Cifra o conteúdo para uma assinatura (um registro só, rs = 4096). */
export async function encryptPayload(payload: Uint8Array, sub: PushSubscriptionJSON): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.keys.p256dh);
  const authSecret = b64urlDecode(sub.keys.auth);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as SubtleCryptoDeriveKeyAlgorithm, local.privateKey, 256),
  );
  const ikm = await hkdf(authSecret, shared, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))),
  );
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/** JWT VAPID assinado (ES256) para a origem do serviço de push. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): Promise<string> {
  const pub = b64urlDecode(keys.publicKey);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    d: keys.privateKey,
    ext: true,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64urlEncode(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(
    te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${header}.${claims}`)),
  );
  return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${keys.publicKey}`;
}

export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  url: string;
}

/** Manda um push. Devolve o status HTTP do serviço (404/410 = assinatura morta). */
export async function sendPush(sub: PushSubscriptionJSON, msg: PushMessage, keys: VapidKeys, ttlSec = 120): Promise<number> {
  const body = await encryptPayload(te.encode(JSON.stringify(msg)), sub);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSec),
      Urgency: 'high',
      Topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'vez',
    },
    body,
  });
  return res.status;
}
