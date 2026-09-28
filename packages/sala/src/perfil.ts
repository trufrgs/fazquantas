/**
 * Perfil de ranking e segredos: as contas moram no engine (o web usa as mesmas); aqui fica só a
 * comparação de segredos do servidor.
 */
export { PROFILE_KEY_PATTERN, profileIdFromKey, randomToken } from '@fodinha/engine';

/** Compara segredos sem vazar, pelo tempo, quanto do começo bateu. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
