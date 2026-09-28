import type { Rng } from './rng';

/** Nomes curtos (cabem no assento) para os bots. */
export const BOT_NAMES: readonly string[] = [
  'Bento',
  'Neca',
  'Juca',
  'Lurdes',
  'Tonho',
  'Zeca',
  'Cida',
  'Nena',
  'Dito',
  'Quinha',
  'Tião',
  'Dora',
  'Chico',
  'Lia',
  'Jair',
  'Nice',
  'Duda',
  'Rosa',
  'Beto',
  'Iara',
];

/** Sorteia `count` nomes de bot que não colidem com os já usados. */
export function pickBotNames(count: number, taken: readonly string[], rng: Rng): string[] {
  const used = new Set(taken.map((n) => n.toLocaleLowerCase('pt-BR')));
  const pool = BOT_NAMES.filter((n) => !used.has(n.toLocaleLowerCase('pt-BR')));
  const out: string[] = [];
  while (out.length < count) {
    if (pool.length === 0) {
      out.push(`Bot ${out.length + 1}`);
      continue;
    }
    out.push(pool.splice(rng.int(pool.length), 1)[0]!);
  }
  return out;
}
