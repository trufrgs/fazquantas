/**
 * Regras do apelido guardado (sem estado): normalização, PIN, espera depois de errar e IP truncado.
 * O objeto `ContasDO` usa estas funções; os testes cobrem cada uma.
 */

/** PIN de 4 a 8 dígitos: fácil de lembrar, como o do cartão. */
export const PIN_PATTERN = /^\d{4,8}$/;
/** Erros de PIN seguidos antes da primeira espera. */
export const PIN_FREE_ATTEMPTS = 5;
const PIN_BASE_WAIT_MS = 15 * 60_000;
const PIN_MAX_WAIT_MS = 24 * 60 * 60_000;
/** Poucas iterações: o Worker gratuito tem 10 ms de CPU. A espera depois de errar é a proteção. */
const PBKDF2_ITERATIONS = 2000;

/**
 * Chave de comparação do apelido: sem acento, sem diferença de maiúscula, espaços juntos. "Tomás",
 * "tomas" e "TOMAS " são o mesmo apelido (ninguém se passa por outro trocando um acento).
 */
export function apelidoKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quanto esperar depois de `errors` PINs errados seguidos (0 = pode tentar). */
export function pinWaitMs(errors: number): number {
  if (errors < PIN_FREE_ATTEMPTS) return 0;
  return Math.min(PIN_MAX_WAIT_MS, PIN_BASE_WAIT_MS * 2 ** (errors - PIN_FREE_ATTEMPTS));
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomSalt(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

/** Resumo do PIN (PBKDF2-SHA256 com sal): o PIN em si nunca é guardado. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return b64url(bits);
}

/**
 * IP sem a parte que identifica a casa: IPv4 fica com os dois primeiros números ("203.0.x.x"),
 * IPv6 com os três primeiros blocos. Dá para ver a região e o provedor, não a pessoa.
 */
export function truncateIp(ip: string | null): string {
  if (!ip) return '';
  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : '';
  }
  const blocks = ip.split(':').filter(Boolean);
  return blocks.length >= 3 ? `${blocks.slice(0, 3).join(':')}::/48` : '';
}

/** Navegador e sistema em poucas palavras ("Chrome · Android"), sem a string inteira. */
export function shortUserAgent(ua: string | null): string {
  if (!ua) return '';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'outro';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'outro';
  return `${browser} · ${os}`;
}

/** Dia civil em Brasília ("2026-09-28"), a chave dos acessos por dia. */
export function brtDay(at: number): string {
  return new Date(at - 3 * 60 * 60_000).toISOString().slice(0, 10);
}
