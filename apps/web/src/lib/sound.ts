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
  | 'fumo';

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
  fumo: 0.7,
};

const howls = new Map<string, Howl>();
let enabled = true;

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
  try {
    for (const files of Object.values(FILES)) for (const f of files) howl(f);
  } catch {
    /* sem áudio */
  }
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    Howler.mute(!on);
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

/** Toca um som (variação aleatória quando há mais de um arquivo). Nunca lança. */
export function play(id: SoundId, opts: { delayMs?: number; rate?: number } = {}): void {
  if (!enabled) return;
  const files = FILES[id];
  const file = files[Math.floor(Math.random() * files.length)]!;
  const fire = () => {
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
