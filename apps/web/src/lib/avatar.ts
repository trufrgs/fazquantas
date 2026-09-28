/**
 * Avatares "Notionists" (DiceBear, CC0) pré-gerados em `public/avatars` por
 * `scripts/make-avatars.mjs` — assim o gerador não entra no bundle.
 */
export const AVATAR_COUNT = 40;

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** Índice do avatar: `av-7` escolhe direto; qualquer outra semente cai num avatar fixo. */
export function avatarIndex(seed: string): number {
  const m = /^av-(\d+)$/.exec(seed);
  return m ? Number(m[1]) % AVATAR_COUNT : hash(seed) % AVATAR_COUNT;
}

export function avatarUri(seed: string): string {
  return `${import.meta.env.BASE_URL}avatars/${String(avatarIndex(seed)).padStart(2, '0')}.svg`;
}

/** Fundo do avatar: cores dos naipes e da mesa, estável por semente. */
const BACKGROUNDS = ['#e3a82b', '#c4372d', '#2e5c9c', '#3d7a3a', '#b86b3a', '#7a5cae', '#2f8a86', '#d27a92'];

export function avatarBackground(seed: string): string {
  return BACKGROUNDS[hash(seed) % BACKGROUNDS.length]!;
}

export function randomAvatarSeed(): string {
  return `av-${Math.floor(Math.random() * AVATAR_COUNT)}`;
}

/** `count` avatares diferentes entre si e do atual, para escolher. */
export function avatarChoices(current: string, count: number): string[] {
  const taken = new Set([avatarIndex(current)]);
  const out = [current];
  while (out.length < count && taken.size < AVATAR_COUNT) {
    const i = Math.floor(Math.random() * AVATAR_COUNT);
    if (taken.has(i)) continue;
    taken.add(i);
    out.push(`av-${i}`);
  }
  return out;
}
