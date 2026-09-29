import { describe, expect, it, vi } from 'vitest';

// Ajustes guardados por uma versão de antes (v5): o "Som" desligado calava tudo, e a música vinha no
// padrão (ligada), escondida atrás dele.
vi.hoisted(() => {
  const store = new Map<string, string>([['fodinha:ajustes', JSON.stringify({ state: { name: 'Ana', sound: false }, version: 5 })]]);
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});

const { useSettings } = await import('./settings');

describe('ajustes guardados de uma versão de antes', () => {
  it('música e efeitos viraram chaves separadas: quem estava com o som desligado continua no silêncio', () => {
    expect(useSettings.getState().sound).toBe(false);
    expect(useSettings.getState().musica).toBe(false);
  });
});
