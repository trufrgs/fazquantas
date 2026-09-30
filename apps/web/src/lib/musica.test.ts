import { beforeEach, describe, expect, it, vi } from 'vitest';

// A música roda no navegador: aqui ganha `window` e `document` de mentira (a tela visível ou
// escondida é o teste que diz) e um Howl de mentira, que sabe se está tocando, o volume, as descidas
// pedidas e se foi jogado fora.
const mundo = vi.hoisted(() => {
  type Ouvinte = () => void;
  const ouvintes = new Map<string, Set<Ouvinte>>();
  const on = (tipo: string, fn: Ouvinte) => {
    if (!ouvintes.has(tipo)) ouvintes.set(tipo, new Set());
    ouvintes.get(tipo)!.add(fn);
  };
  const doc = { visibilityState: 'visible', addEventListener: on, removeEventListener: () => undefined };
  (globalThis as unknown as { window: unknown }).window = { addEventListener: on, removeEventListener: () => undefined };
  (globalThis as unknown as { document: unknown }).document = doc;
  const disparar = (tipo: string) => {
    for (const fn of [...(ouvintes.get(tipo) ?? [])]) fn();
  };
  class Faixa {
    vol = 0;
    tocando = false;
    solta = false;
    fades: [number, number][] = [];
    private ouvintes: (() => void)[] = [];
    constructor() {
      faixas.push(this);
    }
    on(_ev: string, f: () => void) {
      this.ouvintes.push(f);
      return this;
    }
    play() {
      this.tocando = true;
      return 1;
    }
    pause() {
      this.tocando = false;
    }
    playing() {
      return this.tocando;
    }
    volume() {
      return this.vol;
    }
    fade(de: number, para: number) {
      this.fades.push([de, para]);
    }
    /** A descida (ou subida) de fininho terminou. */
    fim() {
      this.vol = this.fades.at(-1)![1];
      for (const f of this.ouvintes) f();
    }
    rate() {}
    unload() {
      this.solta = true;
      this.tocando = false;
    }
  }
  const faixas: Faixa[] = [];
  return { faixas, Faixa, doc, disparar };
});
vi.mock('howler', () => ({ Howl: mundo.Faixa }));

const musica = await import('./musica');

const tela = (visivel: boolean) => {
  mundo.doc.visibilityState = visivel ? 'visible' : 'hidden';
  mundo.disparar('visibilitychange');
};
const atual = () => mundo.faixas.at(-1)!;

describe('o tango não fica "tocando" depois de sair (ícone de som no iPhone)', () => {
  beforeEach(() => {
    tela(true);
    musica.ligarMusica(false);
    mundo.faixas.length = 0;
  });

  it('saindo da mesa, desce de fininho e a faixa vai fora (pausada, o `<audio>` seguia vivo)', () => {
    musica.destravarMusica();
    musica.ligarMusica(true);
    expect(atual().tocando).toBe(true);
    atual().fim(); // subiu
    musica.ligarMusica(false);
    expect(atual().fades.at(-1)).toEqual([0.22, 0]);
    expect(atual().solta).toBe(false);
    atual().fim(); // desceu
    expect(atual().solta).toBe(true);
  });

  it('saiu do app: solta na hora (em segundo plano a descida nunca terminava) e volta numa faixa nova', () => {
    musica.ligarMusica(true);
    const antes = atual();
    antes.fim();
    tela(false);
    expect(antes.solta).toBe(true);
    tela(true);
    expect(atual()).not.toBe(antes);
    expect(atual().tocando).toBe(true);
  });

  it('fechar o app (pagehide) também solta', () => {
    musica.ligarMusica(true);
    mundo.disparar('pagehide');
    expect(atual().solta).toBe(true);
  });
});
