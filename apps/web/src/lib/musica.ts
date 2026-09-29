import { Howl } from 'howler';

/**
 * A música de fundo: um tango, baixinho, em volta da mesa ("falta um tango ou um gaiteiro no fundo",
 * o Igor, 29/09/2026). Toca na sala e na mesa (não nos menus), com a música ligada (uma chave só
 * dela, separada dos efeitos), só depois do primeiro toque (o celular não deixa antes), e para quando
 * o jogo sai da frente. Entra e sai de fininho. O arquivo não entra no cache do aplicativo instalado
 * (é grande): vem do servidor quando toca pela primeira vez.
 */

const ARQUIVO = 'music/tango-de-manzana.mp3';
const VOLUME = 0.22;
const ENTRADA_MS = 2000;
const SAIDA_MS = 700;

let faixa: Howl | null = null;
let ligada = false;
let destravada = false;

function querTocar(): boolean {
  return ligada && destravada && document.visibilityState === 'visible';
}

function howl(): Howl {
  if (!faixa) {
    const h = new Howl({ src: [`${import.meta.env.BASE_URL}${ARQUIVO}`], html5: true, loop: true, volume: 0 });
    // Acabou de sumir: pausa (a não ser que tenha voltado a querer tocar no meio do caminho).
    h.on('fade', () => {
      if (!querTocar() && h.playing()) h.pause();
    });
    faixa = h;
  }
  return faixa;
}

/**
 * Entra ou sai de fininho. O Howler só termina uma subida ou descida que muda o volume de verdade
 * (de 0 para 0 o intervalo roda para sempre e a música nunca pausava): só pede o que muda.
 */
function aplicar(): void {
  try {
    if (querTocar()) {
      const h = howl();
      if (!h.playing()) h.play();
      const v = h.volume();
      if (Math.abs(v - VOLUME) > 0.01) h.fade(v, VOLUME, ENTRADA_MS);
    } else if (faixa?.playing()) {
      const v = faixa.volume();
      if (v > 0.01) faixa.fade(v, 0, SAIDA_MS);
      else faixa.pause();
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
