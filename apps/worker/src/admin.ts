/**
 * Entrada do admin: a senha é o segredo `ADMIN_SENHA` do Worker (quem define é o dono, no painel do
 * Cloudflare). Senha certa vira um token assinado com ela, válido por 30 dias: trocar a senha
 * derruba todos os tokens.
 */

export const ADMIN_TOKEN_MS = 30 * 24 * 60 * 60_000;

function b64url(bytes: ArrayBuffer): string {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

/** Compara sem vazar pelo tempo quanto do começo bateu. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(secret: string | undefined, password: string): Promise<boolean> {
  if (!secret || secret.length < 8) return false;
  // Compara os resumos (mesmo tamanho), não as senhas.
  return same(await hmac('senha', secret), await hmac('senha', password));
}

export async function issueToken(secret: string, now = Date.now()): Promise<string> {
  const exp = now + ADMIN_TOKEN_MS;
  return `${exp}.${await hmac(secret, `admin:${exp}`)}`;
}

export async function verifyToken(secret: string | undefined, token: string | null, now = Date.now()): Promise<boolean> {
  if (!secret || secret.length < 8 || !token) return false;
  const [expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now || !sig) return false;
  return same(sig, await hmac(secret, `admin:${exp}`));
}
