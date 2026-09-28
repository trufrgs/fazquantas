import { createAvatar } from '@dicebear/core';
import * as notionists from '@dicebear/notionists';

const cache = new Map<string, string>();

/** Avatar "Notionists" (DiceBear, CC0) como data URI, memoizado por semente. */
export function avatarUri(seed: string): string {
  let uri = cache.get(seed);
  if (!uri) {
    uri = createAvatar(notionists, { seed, backgroundColor: ['transparent'] }).toDataUri();
    cache.set(seed, uri);
  }
  return uri;
}

/** Fundo do avatar: cores dos naipes e da mesa, estável por semente. */
const BACKGROUNDS = ['#e3a82b', '#c4372d', '#2e5c9c', '#3d7a3a', '#b86b3a', '#7a5cae', '#2f8a86', '#d27a92'];

export function avatarBackground(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BACKGROUNDS[h % BACKGROUNDS.length]!;
}

export function randomAvatarSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
