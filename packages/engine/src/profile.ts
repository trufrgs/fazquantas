/**
 * Perfil de ranking: cada aparelho gera uma chave secreta aleatória (fica só com ele); o id público
 * é um resumo SHA-256 dela. Sem a chave ninguém pontua no lugar de outro, e o servidor não guarda
 * a chave. Levar a chave para outro aparelho leva o perfil junto.
 */

/** 16 bytes em base64url dão 22 caracteres; aceita chaves maiores. */
export const PROFILE_KEY_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Segredo aleatório em base64url (chave de perfil, tokens de assento, ids). */
export function randomToken(bytes = 16): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Id público do perfil (22 caracteres) a partir da chave secreta. */
export async function profileIdFromKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(`fazquantas:perfil:${key}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64url(new Uint8Array(hash)).slice(0, 22);
}
