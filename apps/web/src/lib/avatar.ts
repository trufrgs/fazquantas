import { GAUCHO_AVATARS } from './avatares-gauchos';

/**
 * Duas turmas de avatar: a do Gaudério (`g-<slug>`, desenhada à mão, em `public/avatars/g`) e a
 * antiga "Notionists" (DiceBear, CC0, `av-<n>`), que continua valendo para quem já escolheu.
 */
export const AVATAR_COUNT = 40;
const GAUCHO_IDS = new Set(GAUCHO_AVATARS.map((a) => a.id));

export function isGauchoAvatar(seed: string): boolean {
  return GAUCHO_IDS.has(seed);
}

/** Nome engraçado do avatar gaúcho (para leitores de tela e a galeria). */
export function avatarLabel(seed: string): string | null {
  return GAUCHO_AVATARS.find((a) => a.id === seed)?.label ?? null;
}

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
  if (isGauchoAvatar(seed)) return `${import.meta.env.BASE_URL}avatars/g/${seed.slice(2)}.svg`;
  return `${import.meta.env.BASE_URL}avatars/${String(avatarIndex(seed)).padStart(2, '0')}.svg`;
}

/** Fundo do avatar: cores dos naipes e da mesa, estável por semente. */
const BACKGROUNDS = ['#e3a82b', '#c4372d', '#2e5c9c', '#3d7a3a', '#b86b3a', '#7a5cae', '#2f8a86', '#d27a92'];

export function avatarBackground(seed: string): string {
  return BACKGROUNDS[hash(seed) % BACKGROUNDS.length]!;
}

/** Avatar de quem chega: sempre da turma do Gaudério. */
export function randomAvatarSeed(): string {
  return GAUCHO_AVATARS[Math.floor(Math.random() * GAUCHO_AVATARS.length)]!.id;
}
