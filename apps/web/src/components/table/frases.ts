import { card, GALOS, isManilha, strength, type CardId, type Galo, type ReactionId, type StrengthCtx } from '@fodinha/engine';

/** O valor de uma carta como se diz no "é galo" (ex.: `O4` → `4`; `E1` → `1`, o ás). */
function galoDe(id: CardId): Galo | null {
  const valor = String(card(id).rank);
  return GALOS.some((g) => g.valor === valor) ? (valor as Galo) : null;
}

/** As cartas da mesa da mais forte para a mais fraca (a primeira é a que está levando a mão). */
const daMaisForte = (naMesa: readonly CardId[], ctx: StrengthCtx) =>
  [...naMesa].sort((a, b) => strength(card(b), ctx) - strength(card(a), ctx));

/**
 * As sugestões do "é galo" com as cartas que estão na mesa ("combinar de deixar uma carta baixa
 * passar", o Igor, 29/09/2026): o valor de cada uma, da mais forte para a mais fraca, porque a que
 * está levando a mão é a que passa se ninguém cobrir. Manilha não conta (ninguém deixa manilha
 * passar). No fim, o "é galo" sem carta, que a mesa entende pelo contexto.
 */
export function sugestoesDeGalo(naMesa: readonly CardId[], ctx: StrengthCtx): ReactionId[] {
  const vistos = new Set<Galo>();
  const cartas = daMaisForte(naMesa, ctx).filter((id) => !isManilha(card(id), ctx));
  for (const id of cartas) {
    const g = galoDe(id);
    if (g) vistos.add(g);
  }
  return [...[...vistos].map((g) => `galo-${g}` as const), 'galo'];
}

/**
 * O "é galo" de um toque (a favorita no alto da mesa): a carta que está levando a mão; com manilha
 * levando (aí nenhuma carta baixa passa) ou com a mesa vazia, o genérico.
 */
export function galoDeUmToque(naMesa: readonly CardId[], ctx: StrengthCtx): ReactionId {
  const levando = daMaisForte(naMesa, ctx)[0];
  if (!levando || isManilha(card(levando), ctx)) return 'galo';
  const g = galoDe(levando);
  return g ? `galo-${g}` : 'galo';
}

/** Marca ou desmarca uma favorita (no máximo três: a mais antiga sai para a nova entrar). */
export function alternarFavorita(favoritas: readonly ReactionId[], id: ReactionId): ReactionId[] {
  if (favoritas.includes(id)) return favoritas.filter((f) => f !== id);
  return [...favoritas, id].slice(-3);
}
