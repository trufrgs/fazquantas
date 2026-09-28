// Gera os avatares gaúchos a partir de brand/avatares.js (fonte única): um SVG estático por
// personagem em apps/web/public/avatars/g/<slug>.svg e a lista de ids e nomes em
// apps/web/src/lib/avatares-gauchos.ts. Não precisa de navegador: o script da marca monta as strings.
//
// Uso: node scripts/make-avatares.mjs   (a prévia fica em brand/avatares.html)
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({});
vm.runInContext(readFileSync(path.join(root, 'brand/avatares.js'), 'utf8'), ctx, {
  filename: 'avatares.js',
});
const { AVATARES, avatarSvg } = ctx;

const LIMITE = 6 * 1024;
const out = path.join(root, 'apps/web/public/avatars/g');
mkdirSync(out, { recursive: true });
// Personagem que saiu da fonte não fica esquecido na pasta.
for (const f of readdirSync(out)) if (f.endsWith('.svg')) rmSync(path.join(out, f));

let total = 0;
for (const { slug } of AVATARES) {
  const svg = avatarSvg(slug);
  if (svg.length > LIMITE)
    console.warn(`aviso: ${slug}.svg tem ${(svg.length / 1024).toFixed(1)} KB`);
  writeFileSync(path.join(out, `${slug}.svg`), svg + '\n');
  total += svg.length;
}

const linhas = AVATARES.map(
  ({ slug, label }) => `  { id: 'g-${slug}', label: '${label.replace(/'/g, "\\'")}' },`,
);
writeFileSync(
  path.join(root, 'apps/web/src/lib/avatares-gauchos.ts'),
  `/**
 * Avatares gaúchos desenhados à mão (a turma do Gaudério), em \`public/avatars/g/<slug>.svg\`.
 * Gerado por \`scripts/make-avatares.mjs\` a partir de \`brand/avatares.js\` — edite lá.
 * O id é \`g-<slug>\`; a ordem é a da escolha no perfil, os mais carismáticos primeiro.
 */
export const GAUCHO_AVATARS: readonly { id: string; label: string }[] = [
${linhas.join('\n')}
];
`,
);
console.log(`${AVATARES.length} avatares gaúchos, ${(total / 1024).toFixed(0)} KB`);
