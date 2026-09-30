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
/** Com a conversa por voz ligada, o tango fica bem baixinho (não abafa ninguém nem volta pelo microfone). */
const VOLUME_NA_CONVERSA = 0.07;
const ENTRADA_MS = 2000;
const SAIDA_MS = 700;

let faixa: Howl | null = null;
let ligada = false;
let destravada = false;
let abaixada = false;

const volumeAlvo = () => (abaixada ? VOLUME_NA_CONVERSA : VOLUME);

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
      if (Math.abs(v - volumeAlvo()) > 0.01) h.fade(v, volumeAlvo(), ENTRADA_MS);
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

/** A conversa por voz ligou ou desligou: o tango abaixa ou volta. */
export function abaixarMusica(on: boolean): void {
  if (abaixada === on) return;
  abaixada = on;
  aplicar();
}

/** Câmera rápida ("acelerar até o fim"): o tango corre junto com a mesa. */
export function acelerarMusica(on: boolean): void {
  try {
    faixa?.rate(on ? 1.6 : 1);
  } catch {
    // sem áudio
  }
}

/** O primeiro toque destrava o áudio no celular: daí a música pode começar. */
export function destravarMusica(): void {
  destravada = true;
  aplicar();
}

/** A faixa está saindo de verdade: algum `<audio>` dela tocando (o Howler não fica sabendo quando o sistema pausa). */
function saindoDeVerdade(h: Howl): boolean {
  const sons = (h as unknown as { _sounds?: { _node?: HTMLAudioElement }[] })._sounds ?? [];
  return sons.some((som) => som._node && !som._node.paused);
}

/**
 * Recomeça a música do zero, de fininho: ao ligar a música nos ajustes ("tem que forçar", o Igor,
 * 29/09/2026) e quando ela parou sem ninguém pedir. Joga a faixa velha fora (com o `<audio>` que o
 * sistema pausou: se ele voltasse sozinho, eram dois tangos) e começa uma nova.
 */
export function forcarMusica(): void {
  destravada = true;
  try {
    faixa?.unload();
  } catch {
    // sem áudio
  }
  faixa = null;
  aplicar();
}

/**
 * A música devia estar tocando e parou (o sistema pausa o áudio numa ligação, num áudio do WhatsApp, e
 * o Howler nem fica sabendo): volta. Chamada a cada toque na tela, que é quando o celular deixa.
 */
export function acordarMusica(): void {
  if (!querTocar() || !faixa || saindoDeVerdade(faixa)) return;
  forcarMusica();
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', aplicar);
