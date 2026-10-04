import { REACTIONS, type ReactionId } from '@fodinha/engine';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { contextoParaTocar, saidaDosEfeitos } from './sound';
import { safeStateStorage } from './storage';

/**
 * A frase na tua voz (caderno de zoeira): cada um grava até dois segundos dizendo a frase do jeito
 * dele, e é essa voz que toca na mesa quando ele manda a frase (gritada, toca mais alto). Funciona
 * com o microfone da conversa fechado.
 *
 * O áudio é feito aqui mesmo, sem depender do codec de cada navegador (o iPhone grava AAC, o Chrome
 * Opus, e um nem sempre toca o do outro): amostras a `VOZ.taxa` Hz comprimidas em IMA ADPCM (4 bits
 * por amostra), em base64. Dois segundos dão uns 13 kB, que cabem numa mensagem da sala
 * (`MAX_MESSAGE_BYTES`). A gravação fica no aparelho (localStorage) e, na sala, só na memória do
 * servidor enquanto a pessoa estiver lá: não é gravada em lugar nenhum.
 */
export const VOZ = {
  /** Amostras por segundo (voz de telefone; o bastante para um "Cagão!"). */
  taxa: 9600,
  /** Duração máxima, em segundos. */
  maxS: 2,
  /** Frases gravadas por pessoa (as que ficam a um toque). */
  maxFrases: 3,
} as const;

/** Tamanho máximo do texto base64 de uma gravação (o servidor confere o mesmo). */
export const VOZ_MAX_B64 = Math.ceil((VOZ.taxa * VOZ.maxS) / 2 / 3) * 4 + 8;

// ---------------------------------------------------------------------------------- IMA ADPCM

const PASSOS = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337,
  371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
  5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];
const INDICES = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

const limita = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Amostras em [-1, 1] → bytes ADPCM (duas amostras por byte, a primeira no nibble de baixo). */
export function adpcmCodifica(amostras: Float32Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(amostras.length / 2));
  let previsto = 0;
  let indice = 0;
  for (let i = 0; i < amostras.length; i++) {
    const s = Math.round(limita(amostras[i]!, -1, 1) * 32767);
    const passo = PASSOS[indice]!;
    let dif = s - previsto;
    let codigo = 0;
    if (dif < 0) {
      codigo = 8;
      dif = -dif;
    }
    let delta = passo >> 3;
    if (dif >= passo) {
      codigo |= 4;
      dif -= passo;
      delta += passo;
    }
    if (dif >= passo >> 1) {
      codigo |= 2;
      dif -= passo >> 1;
      delta += passo >> 1;
    }
    if (dif >= passo >> 2) {
      codigo |= 1;
      delta += passo >> 2;
    }
    previsto = limita(previsto + (codigo & 8 ? -delta : delta), -32768, 32767);
    indice = limita(indice + INDICES[codigo]!, 0, 88);
    if (i % 2 === 0) out[i >> 1] = codigo;
    else out[i >> 1]! |= codigo << 4;
  }
  return out;
}

/** Bytes ADPCM → amostras em [-1, 1]. */
export function adpcmDecodifica(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length * 2);
  let previsto = 0;
  let indice = 0;
  for (let i = 0; i < out.length; i++) {
    const codigo = i % 2 === 0 ? bytes[i >> 1]! & 0x0f : bytes[i >> 1]! >> 4;
    const passo = PASSOS[indice]!;
    let delta = passo >> 3;
    if (codigo & 4) delta += passo;
    if (codigo & 2) delta += passo >> 1;
    if (codigo & 1) delta += passo >> 2;
    previsto = limita(previsto + (codigo & 8 ? -delta : delta), -32768, 32767);
    indice = limita(indice + INDICES[codigo]!, 0, 88);
    out[i] = previsto / 32768;
  }
  return out;
}

function paraBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function deBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * O que saiu do microfone vira a gravação: desce para `VOZ.taxa` (média de cada janela, que já tira
 * o chiado agudo), corta o silêncio do começo e do fim, limita a `VOZ.maxS` e sobe o volume até perto
 * do máximo (cada um grava num volume).
 */
export function preparaVoz(bruto: Float32Array, taxaOrigem: number): Float32Array | null {
  const passo = taxaOrigem / VOZ.taxa;
  const n = Math.floor(bruto.length / passo);
  const baixa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * passo);
    const b = Math.max(a + 1, Math.floor((i + 1) * passo));
    let soma = 0;
    for (let k = a; k < b; k++) soma += bruto[k] ?? 0;
    baixa[i] = soma / (b - a);
  }
  let pico = 0;
  for (const v of baixa) pico = Math.max(pico, Math.abs(v));
  if (pico < 0.02) return null; // só silêncio
  const limiar = pico * 0.08;
  let ini = baixa.findIndex((v) => Math.abs(v) > limiar);
  let fim = baixa.length - 1;
  while (fim > ini && Math.abs(baixa[fim]!) <= limiar) fim--;
  ini = Math.max(0, ini - Math.round(VOZ.taxa * 0.04));
  fim = Math.min(baixa.length - 1, fim + Math.round(VOZ.taxa * 0.08));
  const corte = baixa.slice(ini, Math.min(fim + 1, ini + VOZ.taxa * VOZ.maxS));
  const ganho = 0.92 / pico;
  for (let i = 0; i < corte.length; i++) corte[i] = corte[i]! * ganho;
  return corte;
}

export const codificaVoz = (amostras: Float32Array): string => paraBase64(adpcmCodifica(amostras));
export const decodificaVoz = (b64: string): Float32Array => adpcmDecodifica(deBase64(b64));

/** Confere se um texto parece uma gravação válida (antes de tocar o que veio da sala). */
export const vozValida = (b64: unknown): b64 is string => typeof b64 === 'string' && b64.length > 0 && b64.length <= VOZ_MAX_B64 && /^[A-Za-z0-9+/]+=*$/.test(b64);

// ---------------------------------------------------------------------------------- gravar

/** Dá para gravar neste aparelho (microfone e Web Audio). */
export const podeGravar = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && 'AudioContext' in window;

/**
 * Grava `VOZ.maxS` segundos do microfone e devolve a gravação pronta (ou `null` se só deu silêncio).
 * `aoNivel` recebe o volume (0 a 1) enquanto grava, para a barrinha. Lança se o microfone for negado.
 */
export async function gravarVoz(aoNivel?: (v: number) => void, sinal?: AbortSignal): Promise<string | null> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext();
  try {
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    const fonte = ctx.createMediaStreamSource(stream);
    // O ScriptProcessor é antigo, mas é o que roda igual em todo lugar (o iPhone inclusive).
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const pedacos: Float32Array[] = [];
    let total = 0;
    const alvo = ctx.sampleRate * VOZ.maxS;
    await new Promise<void>((resolve) => {
      const fim = () => resolve();
      sinal?.addEventListener('abort', fim, { once: true });
      proc.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0);
        pedacos.push(new Float32Array(d));
        total += d.length;
        let soma = 0;
        for (let i = 0; i < d.length; i += 8) soma += d[i]! * d[i]!;
        aoNivel?.(Math.min(1, Math.sqrt(soma / (d.length / 8)) * 4));
        if (total >= alvo) fim();
      };
      fonte.connect(proc);
      // O processador só roda ligado em algum lugar: um ganho zerado, para não ouvir a própria voz.
      const mudo = ctx.createGain();
      mudo.gain.value = 0;
      proc.connect(mudo).connect(ctx.destination);
    });
    proc.disconnect();
    fonte.disconnect();
    const bruto = new Float32Array(total);
    let at = 0;
    for (const p of pedacos) {
      bruto.set(p, at);
      at += p.length;
    }
    const pronta = preparaVoz(bruto, ctx.sampleRate);
    return pronta ? codificaVoz(pronta) : null;
  } finally {
    for (const t of stream.getTracks()) t.stop();
    void ctx.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------- tocar

const buffers = new Map<string, AudioBuffer>();

/** Sobe a gravação para 24 kHz (o Safari antigo não aceitava buffer abaixo de 22 kHz). */
function bufferDe(ctx: AudioContext, b64: string): AudioBuffer {
  const pronto = buffers.get(b64);
  if (pronto) return pronto;
  const voz = decodificaVoz(b64);
  const taxa = 24000;
  const fator = taxa / VOZ.taxa;
  const n = Math.floor(voz.length * fator);
  const buf = ctx.createBuffer(1, n, taxa);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const x = i / fator;
    const a = Math.floor(x);
    const t = x - a;
    d[i] = (voz[a] ?? 0) * (1 - t) + (voz[a + 1] ?? 0) * t;
  }
  if (buffers.size > 40) buffers.clear();
  buffers.set(b64, buf);
  return buf;
}

/** Toca uma gravação (com os efeitos ligados). Gritada (`forca` 1 a 3), sai mais alta. */
export function tocarVoz(b64: string, forca = 0): void {
  const ctx = contextoParaTocar();
  if (!ctx || !vozValida(b64)) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = bufferDe(ctx, b64);
    const g = ctx.createGain();
    g.gain.value = 0.9 + forca * 0.35;
    src.connect(g).connect(saidaDosEfeitos(ctx));
    src.start();
  } catch {
    /* sem áudio */
  }
}

// ---------------------------------------------------------------------------------- guardar

const FRASES = new Set<string>(REACTIONS.map((r) => r.id));

interface MinhasVozes {
  /** As gravações deste aparelho, por frase. */
  vozes: Partial<Record<ReactionId, string>>;
  gravar: (frase: ReactionId, b64: string) => void;
  apagar: (frase: ReactionId) => void;
}

/** As tuas gravações (no aparelho). No máximo `VOZ.maxFrases`: gravar outra tira a mais antiga. */
export const useMinhasVozes = create<MinhasVozes>()(
  persist(
    (set, get) => ({
      vozes: {},
      gravar: (frase, b64) => {
        const resto = Object.entries(get().vozes).filter(([id]) => id !== frase);
        const vozes = Object.fromEntries([...resto.slice(-(VOZ.maxFrases - 1)), [frase, b64]]) as MinhasVozes['vozes'];
        set({ vozes });
      },
      apagar: (frase) => {
        const { [frase]: _fora, ...vozes } = get().vozes;
        set({ vozes });
      },
    }),
    {
      name: 'fodinha:vozes',
      version: 1,
      storage: {
        getItem: (n) => {
          const raw = safeStateStorage.getItem(n);
          return raw ? JSON.parse(raw) : null;
        },
        setItem: (n, v) => safeStateStorage.setItem(n, JSON.stringify(v)),
        removeItem: (n) => safeStateStorage.removeItem(n),
      },
      // O que veio estragado do aparelho não entra.
      merge: (persistido, atual) => {
        const vozes = (persistido as { vozes?: Record<string, unknown> } | undefined)?.vozes ?? {};
        const limpas = Object.fromEntries(Object.entries(vozes).filter(([id, b64]) => FRASES.has(id) && vozValida(b64)));
        return { ...atual, vozes: limpas as MinhasVozes['vozes'] };
      },
    },
  ),
);

/** As gravações de quem está na sala (só na memória, enquanto a sala durar). */
export const useVozesDaSala = create<{ vozes: Record<string, Partial<Record<ReactionId, string>>> }>(() => ({ vozes: {} }));

export function guardarVozDaSala(playerId: string, frase: ReactionId, b64: string | null): void {
  const atual = useVozesDaSala.getState().vozes;
  const dele = { ...(atual[playerId] ?? {}) };
  if (b64 && vozValida(b64) && FRASES.has(frase)) dele[frase] = b64;
  else delete dele[frase];
  useVozesDaSala.setState({ vozes: { ...atual, [playerId]: dele } });
}

export function esquecerVozesDaSala(): void {
  useVozesDaSala.setState({ vozes: {} });
}

/** A voz que toca quando `playerId` manda `frase`: a tua, se é tu; a que veio da sala, se é outro. */
export function vozDe(playerId: string, frase: ReactionId, eu: string | null): string | null {
  if (playerId === eu) return useMinhasVozes.getState().vozes[frase] ?? null;
  return useVozesDaSala.getState().vozes[playerId]?.[frase] ?? null;
}
