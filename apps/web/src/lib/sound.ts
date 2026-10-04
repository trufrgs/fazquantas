import { Howl, Howler } from 'howler';

export type SoundId =
  | 'deal'
  | 'play'
  | 'sweep'
  | 'shuffle'
  | 'bid'
  | 'tick'
  | 'turn'
  | 'made'
  | 'click'
  | 'melou'
  | 'pop'
  | 'lifeLost'
  | 'eliminated'
  | 'win'
  /** Alguém tragando o palheiro enquanto espera quem está demorando. */
  | 'fumo'
  /** A lâmina do espadão saindo para o golpe (o "shing" do aço). */
  | 'espada'
  /** A espada cortando uma carta ao meio. */
  | 'corte'
  /** A madeira do bastão rachando (o espadão partindo o bastião). */
  | 'pau';

const FILES: Record<SoundId, string[]> = {
  deal: ['deal-1.mp3', 'deal-2.mp3', 'deal-3.mp3'],
  play: ['play-1.mp3', 'play-2.mp3', 'play-3.mp3'],
  sweep: ['sweep.mp3'],
  shuffle: ['shuffle.mp3'],
  bid: ['bid.mp3'],
  tick: ['tick.wav'],
  turn: ['turn.mp3'],
  made: ['made.mp3'],
  click: ['click.wav'],
  melou: ['melou.mp3'],
  pop: ['pop.mp3'],
  lifeLost: ['life-lost.mp3'],
  eliminated: ['eliminated.mp3'],
  win: ['win.mp3'],
  fumo: ['fumo.mp3'],
  espada: ['espada.mp3'],
  corte: ['corte-1.mp3', 'corte-2.mp3'],
  pau: ['pau.mp3'],
};

const VOLUME: Partial<Record<SoundId, number>> = {
  deal: 0.55,
  play: 0.8,
  sweep: 0.6,
  shuffle: 0.6,
  bid: 0.7,
  tick: 0.5,
  turn: 0.55,
  click: 0.5,
  melou: 0.8,
  win: 0.8,
  fumo: 0.45,
  espada: 0.75,
  corte: 0.9,
  pau: 1,
};

const howls = new Map<string, Howl>();
let enabled = true;
/** Já houve um toque na tela: antes dele o celular não deixa tocar nada (e o som ia para a fila). */
let tocou = false;

// O Howler suspende o áudio depois de 30 s sem som, e no iPhone ele não volta sozinho fora de um toque:
// o som "se perdia" no meio da partida (o Igor, 29/09/2026). Fica sempre ligado; quem acorda o áudio
// que o sistema parar é `acordarAudio`.
Howler.autoSuspend = false;

/** O contexto de áudio do Howler (só existe depois do primeiro som carregado). */
const contexto = (): AudioContext | undefined => (Howler as { ctx?: AudioContext }).ctx ?? undefined;

/**
 * O jogo saiu da frente: suspende os efeitos. Com o contexto rodando (mesmo em silêncio), o iPhone
 * seguia mostrando o ícone de som na tela de início (30/09/2026). A volta acorda (`acordarAudio`).
 */
export function dormirAudio(): void {
  const ctx = contexto();
  if (!ctx || ctx.state !== 'running') return;
  try {
    void ctx.suspend().catch(() => undefined);
  } catch {
    // sem áudio
  }
}

/**
 * Acorda o áudio parado: o iPhone suspende ou interrompe o áudio quando o jogo sai da frente, numa
 * ligação ou num áudio do WhatsApp, e só deixa voltar dentro de um toque. Chamada a cada toque na tela
 * (e quando o jogo volta para a frente, que às vezes basta). O buffer vazio é o destrave do iPhone.
 */
export function acordarAudio(): void {
  const ctx = contexto();
  if (!ctx || ctx.state === 'running') return;
  try {
    const vazio = ctx.createBufferSource();
    vazio.buffer = ctx.createBuffer(1, 1, 22050);
    vazio.connect(ctx.destination);
    vazio.start(0);
    void ctx.resume().then(
      () => {
        (Howler as unknown as { state: string }).state = 'running';
      },
      () => undefined,
    );
  } catch {
    /* sem áudio */
  }
}

/**
 * Força o áudio de volta, ao ligar os efeitos nos ajustes ("sempre que ligar e desligar o botão do som
 * nas configurações, tem que forçar", o Igor): se o contexto ficou interrompido ou fechado de vez, joga
 * fora e começa um novo, dentro do mesmo toque; depois acorda.
 */
export function forcarAudio(): void {
  tocou = true;
  const ctx = contexto();
  try {
    if (ctx && (ctx.state === 'closed' || (ctx.state as string) === 'interrupted')) {
      Howler.unload();
      howls.clear();
      preloadSounds();
    }
  } catch {
    /* sem áudio */
  }
  acordarAudio();
}

function howl(file: string): Howl {
  let h = howls.get(file);
  if (!h) {
    h = new Howl({ src: [`${import.meta.env.BASE_URL}sounds/${file}`], preload: true, html5: false });
    howls.set(file, h);
  }
  return h;
}

/** Pré-carrega tudo (chamar depois do primeiro toque — o áudio só destrava com gesto no mobile). */
export function preloadSounds(): void {
  tocou = true;
  try {
    for (const files of Object.values(FILES)) for (const f of files) howl(f);
  } catch {
    /* sem áudio */
  }
}

/**
 * Liga ou desliga os efeitos (cartas, golpes, avisos). A música é outra chave (`musica.ts`): o mudo
 * vale só para os efeitos, não para o Howler inteiro, senão calava o tango junto.
 */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    for (const h of howls.values()) h.mute(!on);
  } catch {
    /* sem áudio */
  }
}

export function setMasterVolume(volume: number): void {
  try {
    Howler.volume(Math.max(0, Math.min(1, volume)));
  } catch {
    /* sem áudio */
  }
}

/**
 * O contexto de áudio para quem sintetiza o som na hora (`sintetizado.ts`), com as mesmas regras do
 * `play`: efeitos ligados, já houve um toque e o áudio está rodando (parado, tenta acordar e não toca).
 */
export function contextoParaTocar(): AudioContext | null {
  if (!enabled || !tocou) return null;
  const ctx = contexto();
  if (!ctx) return null;
  if (ctx.state !== 'running') {
    acordarAudio();
    return null;
  }
  return ctx;
}

/** O volume geral dos efeitos (o nó por onde passa todo som do Howler). */
export function saidaDosEfeitos(ctx: AudioContext): AudioNode {
  return (Howler as unknown as { masterGain?: GainNode }).masterGain ?? ctx.destination;
}

/**
 * Toca um som (variação aleatória quando há mais de um arquivo). Nunca lança. Com o áudio parado, o som
 * não toca (iria para a fila do Howler e sairia tudo junto quando o áudio voltasse): tenta acordar.
 */
export function play(id: SoundId, opts: { delayMs?: number; rate?: number } = {}): void {
  if (!enabled || !tocou) return;
  const files = FILES[id];
  const file = files[Math.floor(Math.random() * files.length)]!;
  const fire = () => {
    const ctx = contexto();
    if (ctx && ctx.state !== 'running') {
      acordarAudio();
      return;
    }
    try {
      const h = howl(file);
      const soundId = h.play();
      h.volume(VOLUME[id] ?? 0.7, soundId);
      if (opts.rate) h.rate(opts.rate, soundId);
    } catch {
      /* ignora */
    }
  };
  if (opts.delayMs) window.setTimeout(fire, opts.delayMs);
  else fire();
}
