import { Howl } from 'howler';

/**
 * A música de fundo: um tango, baixinho, em volta da mesa ("falta um tango ou um gaiteiro no fundo",
 * o Igor, 29/09/2026). Toca com o som e a música ligados nos ajustes, só depois do primeiro toque (o
 * celular não deixa antes), e para quando o jogo sai da frente. O arquivo não entra no cache do
 * aplicativo instalado (é grande): vem do servidor quando toca pela primeira vez.
 */

const ARQUIVO = 'music/tango-de-manzana.mp3';
const VOLUME = 0.22;
const ENTRADA_MS = 2000;

let faixa: Howl | null = null;
let ligada = false;
let destravada = false;

function howl(): Howl {
  faixa ??= new Howl({ src: [`${import.meta.env.BASE_URL}${ARQUIVO}`], html5: true, loop: true, volume: 0 });
  return faixa;
}

function aplicar(): void {
  const tocar = ligada && destravada && document.visibilityState === 'visible';
  try {
    if (tocar) {
      const h = howl();
      if (!h.playing()) {
        h.play();
        h.fade(0, VOLUME, ENTRADA_MS);
      }
    } else if (faixa?.playing()) {
      faixa.pause();
    }
  } catch {
    // sem áudio
  }
}

/** Liga ou desliga a música (som e música ligados nos ajustes). */
export function ligarMusica(on: boolean): void {
  ligada = on;
  aplicar();
}

/** O primeiro toque destrava o áudio no celular: daí a música pode começar. */
export function destravarMusica(): void {
  destravada = true;
  aplicar();
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', aplicar);
