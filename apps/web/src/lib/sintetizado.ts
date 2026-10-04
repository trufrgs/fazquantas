import { contextoParaTocar, saidaDosEfeitos } from './sound';

/**
 * Os sons da zoeira que não vêm de arquivo: feitos na hora com o Web Audio, curtos e baixinhos, para
 * não pesar o download nem precisar de licença. Seguem a chave "Efeitos" (`contextoParaTocar`).
 *
 * - `rufar`: o bombo rufando na mão que decide (dura `duracaoMs`).
 * - `fogo`: o estalo da manilha queimando no lixo.
 * - `ronco`: o porco de quem fez mais do que cantou.
 * - `berro`: o bugio berrando.
 * - `alarme`: o grito do quero-quero no rasante.
 * - `pum`: a nuvem do zorrilho.
 * - `sopro`: a baforada do palheiro e o abano da fumaça.
 */
export type Sintetizado = 'rufar' | 'fogo' | 'ronco' | 'berro' | 'alarme' | 'pum' | 'sopro';

export function sintetizar(som: Sintetizado, opts: { delayMs?: number; duracaoMs?: number } = {}): void {
  const tocar = () => {
    const ctx = contextoParaTocar();
    if (!ctx) return;
    try {
      SONS[som](ctx, saidaDosEfeitos(ctx), ctx.currentTime + 0.01, opts.duracaoMs ?? 0);
    } catch {
      /* sem áudio */
    }
  };
  if (opts.delayMs) window.setTimeout(tocar, opts.delayMs);
  else tocar();
}

type Gerador = (ctx: AudioContext, saida: AudioNode, t: number, duracaoMs: number) => void;

function ruido(ctx: AudioContext, segundos: number): AudioBufferSourceNode {
  const n = Math.max(1, Math.floor(ctx.sampleRate * segundos));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function envelope(ctx: AudioContext, t: number, pico: number, ataque: number, queda: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pico, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + queda);
  return g;
}

const SONS: Record<Sintetizado, Gerador> = {
  rufar: (ctx, saida, t, duracaoMs) => {
    // Batidas rápidas de bombo, crescendo, com um pouco de couro (ruído grave).
    const total = Math.max(0.6, duracaoMs / 1000);
    const passo = 0.055;
    for (let k = 0, x = 0; x < total; k++, x += passo) {
      const forca = 0.08 + 0.32 * (x / total) ** 1.5;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(95 + (k % 2) * 8, t + x);
      o.frequency.exponentialRampToValueAtTime(55, t + x + 0.08);
      const g = envelope(ctx, t + x, forca, 0.004, 0.09);
      o.connect(g).connect(saida);
      o.start(t + x);
      o.stop(t + x + 0.12);
    }
  },
  fogo: (ctx, saida, t) => {
    // Chiado que sobe e uns estalos soltos por cima.
    const r = ruido(ctx, 0.9);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(2400, t + 0.8);
    const g = envelope(ctx, t, 0.22, 0.12, 0.7);
    r.connect(f).connect(g).connect(saida);
    r.start(t);
    for (let i = 0; i < 7; i++) {
      const at = t + 0.05 + Math.random() * 0.7;
      const e = ruido(ctx, 0.02);
      const ge = envelope(ctx, at, 0.35, 0.002, 0.02);
      e.connect(ge).connect(saida);
      e.start(at);
    }
  },
  ronco: (ctx, saida, t) => {
    // Dois roncos curtos: grave áspero, com o nariz (filtro) apertado.
    for (const d of [0, 0.32]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(130, t + d);
      o.frequency.linearRampToValueAtTime(90, t + d + 0.22);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 38;
      const lg = ctx.createGain();
      lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 520;
      f.Q.value = 3;
      const g = envelope(ctx, t + d, 0.3, 0.02, 0.22);
      o.connect(f).connect(g).connect(saida);
      o.start(t + d);
      lfo.start(t + d);
      o.stop(t + d + 0.3);
      lfo.stop(t + d + 0.3);
    }
  },
  berro: (ctx, saida, t) => {
    // O berro grave do bugio: sobe, fica, desce, áspero.
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.linearRampToValueAtTime(180, t + 0.25);
    o.frequency.linearRampToValueAtTime(150, t + 0.7);
    o.frequency.linearRampToValueAtTime(90, t + 1.1);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = envelope(ctx, t, 0.28, 0.12, 1.0);
    o.connect(f).connect(g).connect(saida);
    o.start(t);
    o.stop(t + 1.2);
  },
  alarme: (ctx, saida, t) => {
    // "Quero-quero": dois gritos agudos que caem, duas vezes.
    [0, 0.2, 0.55, 0.75].forEach((d) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(2300, t + d);
      o.frequency.exponentialRampToValueAtTime(1500, t + d + 0.14);
      const g = envelope(ctx, t + d, 0.16, 0.01, 0.14);
      o.connect(g).connect(saida);
      o.start(t + d);
      o.stop(t + d + 0.17);
    });
  },
  pum: (ctx, saida, t) => {
    const r = ruido(ctx, 0.6);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(260, t);
    f.frequency.linearRampToValueAtTime(140, t + 0.5);
    const g = envelope(ctx, t, 0.5, 0.03, 0.5);
    r.connect(f).connect(g).connect(saida);
    r.start(t);
  },
  sopro: (ctx, saida, t) => {
    const r = ruido(ctx, 0.7);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(380, t + 0.6);
    f.Q.value = 0.8;
    const g = envelope(ctx, t, 0.25, 0.08, 0.55);
    r.connect(f).connect(g).connect(saida);
    r.start(t);
  },
};
