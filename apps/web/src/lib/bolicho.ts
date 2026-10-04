import { Howl } from 'howler';

/**
 * O som de bolicho (caderno de zoeira): por baixo do tango, a conversa ao fundo de um bar pequeno, um
 * copo batendo de vez em quando e a bola de sinuca estalando lá no canto. Toca onde o tango toca (sala
 * e mesa), com uma chave só dele, bem baixinho. Com alguém de microfone aberto na sala, cala: o
 * barulho de bolicho de verdade já está na conversa. O "rádio que troca de estação" do caderno ficou
 * para quando aparecer milonga e vaneira de uso livre (licença que permite uso comercial).
 *
 * A gravação é a "Atmosphere Bar #2" da BigSoundBank (CC0), cortada em laço sem emenda; os copos e a
 * sinuca são do "Impact Sounds" do Kenney (CC0).
 */

const AMBIENTE = 'music/bolicho.mp3';
const VOLUME = 0.13;
const COPOS = ['sounds/copo-1.mp3', 'sounds/copo-2.mp3', 'sounds/copo-3.mp3'];
const SINUCA = ['sounds/sinuca-1.mp3', 'sounds/sinuca-2.mp3'];
/** Entre um barulho solto e outro (ms). */
const INTERVALO = { min: 11000, max: 32000 } as const;

let ambiente: Howl | null = null;
const soltos = new Map<string, Howl>();
let ligado = false;
let destravado = false;
let calado = false;
let proximo: number | null = null;

const quer = () => ligado && destravado && !calado && typeof document !== 'undefined' && document.visibilityState === 'visible';

function solto(arquivo: string): Howl {
  let h = soltos.get(arquivo);
  if (!h) {
    h = new Howl({ src: [`${import.meta.env.BASE_URL}${arquivo}`], volume: 0.18 });
    soltos.set(arquivo, h);
  }
  return h;
}

const sorteio = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

/** Um barulho solto: um copo no balcão, ou a tacada (duas bolas se batendo). */
function barulho(): void {
  proximo = null;
  if (!quer()) return;
  try {
    if (Math.random() < 0.6) {
      const id = solto(sorteio(COPOS)).play();
      solto(sorteio(COPOS)).rate(0.9 + Math.random() * 0.25, id);
    } else {
      const a = sorteio(SINUCA);
      solto(a).play();
      window.setTimeout(() => quer() && solto(sorteio(SINUCA)).play(), 110 + Math.random() * 90);
    }
  } catch {
    // sem áudio
  }
  agendar();
}

function agendar(): void {
  if (proximo !== null || !quer()) return;
  proximo = window.setTimeout(barulho, INTERVALO.min + Math.random() * (INTERVALO.max - INTERVALO.min));
}

function soltar(): void {
  if (proximo !== null) window.clearTimeout(proximo);
  proximo = null;
  try {
    ambiente?.unload();
  } catch {
    // sem áudio
  }
  ambiente = null;
}

function aplicar(): void {
  try {
    if (quer()) {
      if (!ambiente) {
        ambiente = new Howl({ src: [`${import.meta.env.BASE_URL}${AMBIENTE}`], loop: true, volume: 0 });
        ambiente.once('load', () => ambiente?.fade(0, VOLUME, 2500));
      }
      if (!ambiente.playing()) ambiente.play();
      agendar();
    } else {
      soltar();
    }
  } catch {
    // sem áudio
  }
}

/** Liga ou desliga (a chave dos ajustes, e só na sala e na mesa). */
export function ligarBolicho(on: boolean): void {
  ligado = on;
  aplicar();
}

/** Alguém abriu o microfone na sala: o bolicho cala (a conversa já tem o barulho de verdade). */
export function calarBolicho(on: boolean): void {
  if (calado === on) return;
  calado = on;
  aplicar();
}

/** O primeiro toque destrava o áudio no celular. */
export function destravarBolicho(): void {
  destravado = true;
  aplicar();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', aplicar);
  window.addEventListener('pagehide', soltar);
}
