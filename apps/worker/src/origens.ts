/**
 * Quem pode falar com o servidor: o site publicado, as prévias do Pages, o app nativo (Capacitor)
 * e o desenvolvimento local (localhost e rede local, para testar no celular).
 */

const NATIVE = new Set(['capacitor://localhost', 'http://localhost', 'https://localhost']);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export function allowedOrigin(origin: string | null, configured: string): boolean {
  if (!origin) return false;
  if (NATIVE.has(origin) || LOCAL.test(origin)) return true;
  for (const entry of configured.split(',').map((o) => o.trim()).filter(Boolean)) {
    if (origin === entry) return true;
    // Prévias do Pages: https://<hash>.<projeto>.pages.dev
    const host = entry.replace(/^https:\/\//, '');
    if (entry.startsWith('https://') && host.endsWith('.pages.dev')) {
      if (origin.startsWith('https://') && origin.endsWith(`.${host}`)) return true;
    }
  }
  return false;
}

export function corsHeaders(origin: string | null, configured: string): Record<string, string> {
  if (!origin || !allowedOrigin(origin, configured)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
