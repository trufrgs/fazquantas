import { REACTIONS, type ReactionId } from './protocol';

/**
 * A zoeira que um jogador manda para a mesa (caderno de zoeira, 02/10/2026): atirar coisas num amigo,
 * cutucar quem está demorando, carimbar uma frase na testa de alguém, gritar uma frase, bater a carta
 * na mesa e virar a mesa. É só enfeite: nada disso mexe em regra, palito ou carta. Os limites moram
 * aqui (`ControleDaZoeira`), iguais no servidor e no jogo contra bots, para a zoeira não virar chuva.
 */
export const ITENS_DE_ATIRAR = ['tomate', 'ovo', 'chinelo', 'bergamota'] as const;
export type ItemDeAtirar = (typeof ITENS_DE_ATIRAR)[number];

export type Zoeira =
  | { tipo: 'atirar'; alvo: string; item: ItemDeAtirar }
  | { tipo: 'cutucar'; alvo: string }
  | { tipo: 'carimbo'; alvo: string; reaction: ReactionId }
  | { tipo: 'grito'; reaction: ReactionId; forca: 1 | 2 | 3 }
  | { tipo: 'pancada'; forca: 1 | 2 | 3 }
  | { tipo: 'virar' };

/** A zoeira como chega na mesa: quem mandou e quando. */
export type ZoeiraNaMesa = Zoeira & { de: string; at: number };

export const LIMITES_DA_ZOEIRA = {
  /** Tiros por pessoa em cada rodada. */
  tirosPorRodada: 3,
  /** Entre um cutucão e outro de quem cutuca (ms). */
  cutucaoMs: 5000,
  /** Viradas de mesa por pessoa em cada partida. */
  viradasPorPartida: 1,
  /** Entre um carimbo, grito ou pancada e outro da mesma pessoa (ms). */
  intervaloMs: 1500,
} as const;

export const ZOEIRA_ESGOTADA = {
  tiros: 'Acabou a munição desta rodada.',
  virar: 'Tu já virou a mesa nesta partida.',
  cutucao: 'Calma, deixa o vivente respirar.',
  alvo: 'Esse aí não está na mesa.',
  demora: 'Só dá pra cutucar quem está na vez.',
  si: 'Contigo mesmo não vale.',
} as const;

export interface ContextoDaZoeira {
  agora: number;
  /** Rodada e partida em andamento (os contadores zeram quando mudam). */
  rodada: string;
  partida: string;
  /** Quem está na vez agora (só ele leva cutucão). */
  ator: string | null;
  /** Quem pode ser alvo (os jogadores e a plateia). */
  alvos: ReadonlySet<string>;
}

const FRASES = new Set<string>(REACTIONS.map((r) => r.id));

/** Confere e conta a zoeira de cada um. Devolve a mensagem do limite, ou `null` se pode. */
export class ControleDaZoeira {
  private tiros = new Map<string, number>();
  private viradas = new Map<string, number>();
  private ultimo = new Map<string, number>();
  private cutucou = new Map<string, number>();

  pode(de: string, z: Zoeira, c: ContextoDaZoeira): string | null {
    if ('alvo' in z) {
      if (z.alvo === de) return ZOEIRA_ESGOTADA.si;
      if (!c.alvos.has(z.alvo)) return ZOEIRA_ESGOTADA.alvo;
    }
    if (('reaction' in z && !FRASES.has(z.reaction)) || ('forca' in z && ![1, 2, 3].includes(z.forca))) return ZOEIRA_ESGOTADA.alvo;
    switch (z.tipo) {
      case 'atirar':
        return (this.tiros.get(`${c.rodada}:${de}`) ?? 0) >= LIMITES_DA_ZOEIRA.tirosPorRodada ? ZOEIRA_ESGOTADA.tiros : null;
      case 'virar':
        return (this.viradas.get(`${c.partida}:${de}`) ?? 0) >= LIMITES_DA_ZOEIRA.viradasPorPartida ? ZOEIRA_ESGOTADA.virar : null;
      case 'cutucar':
        if (c.ator !== z.alvo) return ZOEIRA_ESGOTADA.demora;
        return c.agora - (this.cutucou.get(de) ?? -Infinity) < LIMITES_DA_ZOEIRA.cutucaoMs ? ZOEIRA_ESGOTADA.cutucao : null;
      default:
        return c.agora - (this.ultimo.get(de) ?? -Infinity) < LIMITES_DA_ZOEIRA.intervaloMs ? ZOEIRA_ESGOTADA.cutucao : null;
    }
  }

  registrar(de: string, z: Zoeira, c: ContextoDaZoeira): void {
    if (z.tipo === 'atirar') this.tiros.set(`${c.rodada}:${de}`, (this.tiros.get(`${c.rodada}:${de}`) ?? 0) + 1);
    else if (z.tipo === 'virar') this.viradas.set(`${c.partida}:${de}`, (this.viradas.get(`${c.partida}:${de}`) ?? 0) + 1);
    else if (z.tipo === 'cutucar') this.cutucou.set(de, c.agora);
    else this.ultimo.set(de, c.agora);
  }

  /** Quantos tiros ainda tem nesta rodada. */
  municao(de: string, rodada: string): number {
    return Math.max(0, LIMITES_DA_ZOEIRA.tirosPorRodada - (this.tiros.get(`${rodada}:${de}`) ?? 0));
  }
}
