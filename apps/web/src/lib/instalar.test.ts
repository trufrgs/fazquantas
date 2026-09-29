import { describe, expect, it, vi } from 'vitest';

// Fora do navegador: nada roda como app instalado.
vi.hoisted(() => {
  (globalThis as unknown as { window: unknown }).window = { matchMedia: () => ({ matches: false }) };
});
vi.mock('./platform', () => ({ isNative: false }));

const { comoInstalar } = await import('./instalar');

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1',
  ipadComoMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
};

describe('como instalar o jogo como app, por sistema e navegador', () => {
  it('iPhone e iPad, em qualquer navegador: Compartilhar → Adicionar à Tela de Início', () => {
    expect(comoInstalar(UA.iphoneSafari, 5, 'iPhone')).toBe('ios');
    expect(comoInstalar(UA.iphoneChrome, 5, 'iPhone')).toBe('ios');
    // iPadOS se apresenta como Mac; o toque denuncia.
    expect(comoInstalar(UA.ipadComoMac, 5, 'MacIntel')).toBe('ios');
  });

  it('Mac: Safari pelo Dock; Chrome pelo caminho do computador', () => {
    expect(comoInstalar(UA.macSafari, 0, 'MacIntel')).toBe('mac-safari');
    expect(comoInstalar(UA.macChrome, 0, 'MacIntel')).toBe('computador');
  });

  it('Windows e Linux: Chrome e Edge instalam; Firefox não', () => {
    expect(comoInstalar(UA.windowsEdge, 0, 'Win32')).toBe('computador');
    expect(comoInstalar(UA.linuxChrome, 0, 'Linux x86_64')).toBe('computador');
    expect(comoInstalar(UA.linuxFirefox, 0, 'Linux x86_64')).toBe('sem-suporte');
  });

  it('Android sem o pedido do navegador: pelo menu (Chrome, Firefox, Samsung)', () => {
    expect(comoInstalar(UA.androidChrome, 5, 'Linux armv8l')).toBe('android');
    expect(comoInstalar(UA.androidFirefox, 5, 'Linux armv8l')).toBe('android');
    expect(comoInstalar(UA.samsung, 5, 'Linux armv8l')).toBe('android');
  });
});
