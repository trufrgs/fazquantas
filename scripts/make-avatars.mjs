// Gera os avatares (DiceBear "Notionists", CC0) como SVGs estáticos em apps/web/public/avatars.
// Uso: node scripts/make-avatars.mjs   (rodar da raiz; usa as dependências do apps/web)
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'apps/web/package.json'));
const { createAvatar } = await import(require.resolve('@dicebear/core'));
const notionists = await import(require.resolve('@dicebear/notionists'));

export const AVATAR_COUNT = 40;
const out = path.join(root, 'apps/web/public/avatars');
mkdirSync(out, { recursive: true });
let total = 0;
for (let i = 0; i < AVATAR_COUNT; i++) {
  const svg = createAvatar(notionists, { seed: `fodinha-${i}`, backgroundColor: ['transparent'] }).toString();
  const name = `${String(i).padStart(2, '0')}.svg`;
  writeFileSync(path.join(out, name), svg);
  total += svg.length;
}
console.log(`${AVATAR_COUNT} avatares, ${(total / 1024).toFixed(0)} KB`);
