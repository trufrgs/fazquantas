import { card, cardName, isManilha, specialName, type CardId, type Rules, type StrengthCtx, type TrickRecord } from '@fodinha/engine';

/**
 * Cada manilha tem o seu efeitinho quando cai na mesa (pedido de quem jogou, 29/09/2026):
 * - `corte`: o espadão (e a espadilha) corta a mesa;
 * - `aco`: o sete de espadas brilha como lâmina;
 * - `pancada`: o bastião (e o zap) bate na mesa;
 * - `ouro`: o sete belo (e o pica-fumo) solta faísca dourada;
 * - `brasa`: a manilha de copas pega fogo.
 */
export type EfeitoManilha = 'corte' | 'aco' | 'pancada' | 'ouro' | 'brasa';

export interface Manilha {
  efeito: EfeitoManilha;
  /** O grito da mesa: "Espadão!", "Sete belo!", "Zap!". */
  nome: string;
}

export function contextoDaRodada(rules: Pick<Rules, 'hierarchy'>, vira: CardId | null): StrengthCtx {
  return { mode: rules.hierarchy, vira: vira ? card(vira) : null };
}

/** A carta é manilha nesta rodada? Com qual efeito e qual nome. */
export function manilhaDe(id: CardId, ctx: StrengthCtx): Manilha | null {
  const c = card(id);
  if (!isManilha(c, ctx)) return null;
  const nome = specialName(c, ctx) ?? cardName(c);
  if (ctx.mode === 'gaucha' && id === 'E7') return { efeito: 'aco', nome };
  const efeito: EfeitoManilha = c.suit === 'E' ? 'corte' : c.suit === 'P' ? 'pancada' : c.suit === 'O' ? 'ouro' : 'brasa';
  return { efeito, nome };
}

/**
 * Manilhas que "queimaram" na mão: jogadas e batidas por uma mais forte (as que empardaram têm o
 * carimbo delas). Devolve os jogadores de cada uma.
 */
export function manilhasQueimadas(trick: Pick<TrickRecord, 'plays' | 'winnerId' | 'cancelled'>, ctx: StrengthCtx): string[] {
  if (!trick.winnerId) return [];
  return trick.plays
    .filter((p) => p.playerId !== trick.winnerId && !trick.cancelled.includes(p.playerId) && manilhaDe(p.cardId, ctx) !== null)
    .map((p) => p.playerId);
}
