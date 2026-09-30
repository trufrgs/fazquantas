import { beforeEach, describe, expect, it, vi } from 'vitest';

// Um Howler de mentira: um contexto de áudio com estado e os Howls que tocam.
const mundo = vi.hoisted(() => {
  const tocados: string[] = [];
  const ctx = {
    state: 'running' as string,
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    suspend: vi.fn(async () => {
      ctx.state = 'suspended';
    }),
    createBuffer: vi.fn(() => ({})),
    createBufferSource: vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn() })),
    destination: {},
  };
  const Howler = { autoSuspend: true, ctx: ctx as typeof ctx | null, unload: vi.fn(), volume: vi.fn() };
  class Howl {
    src: string;
    constructor(o: { src: string[] }) {
      this.src = o.src[0]!;
    }
    play() {
      tocados.push(this.src);
      return 1;
    }
    volume() {}
    rate() {}
    mute() {}
  }
  return { tocados, ctx, Howler, Howl };
});
vi.mock('howler', () => ({ Howl: mundo.Howl, Howler: mundo.Howler }));

const som = await import('./sound');

describe('som que não se perde', () => {
  beforeEach(() => {
    mundo.tocados.length = 0;
    mundo.ctx.state = 'running';
    mundo.ctx.resume.mockClear();
    mundo.Howler.unload.mockClear();
  });

  it('o Howler nunca suspende o áudio sozinho (no iPhone ele não voltava fora de um toque)', () => {
    expect(mundo.Howler.autoSuspend).toBe(false);
  });

  it('antes do primeiro toque nada toca; depois, toca', () => {
    som.play('play');
    expect(mundo.tocados).toEqual([]);
    som.preloadSounds();
    som.play('play');
    expect(mundo.tocados).toHaveLength(1);
  });

  it('com o áudio parado, o som não vai para a fila (sairia tudo junto depois): tenta acordar', () => {
    som.preloadSounds();
    mundo.ctx.state = 'suspended';
    som.play('corte');
    expect(mundo.tocados).toEqual([]);
    expect(mundo.ctx.resume).toHaveBeenCalled();
  });

  it('um toque acorda o áudio interrompido; ligar os efeitos força um contexto novo', () => {
    mundo.ctx.state = 'interrupted';
    som.acordarAudio();
    expect(mundo.ctx.resume).toHaveBeenCalledTimes(1);
    mundo.ctx.state = 'interrupted';
    som.forcarAudio();
    expect(mundo.Howler.unload).toHaveBeenCalledTimes(1);
    expect(mundo.ctx.resume).toHaveBeenCalledTimes(2);
  });

  it('saiu do app: os efeitos dormem (com o contexto rodando, o iPhone mostrava o ícone de som) e o toque acorda', () => {
    som.dormirAudio();
    expect(mundo.ctx.suspend).toHaveBeenCalledTimes(1);
    expect(mundo.ctx.state).toBe('suspended');
    som.dormirAudio(); // já dormindo: nada
    expect(mundo.ctx.suspend).toHaveBeenCalledTimes(1);
    som.acordarAudio();
    expect(mundo.ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('com o áudio rodando, acordar não mexe em nada', () => {
    som.acordarAudio();
    som.forcarAudio();
    expect(mundo.ctx.resume).not.toHaveBeenCalled();
    expect(mundo.Howler.unload).not.toHaveBeenCalled();
  });
});
