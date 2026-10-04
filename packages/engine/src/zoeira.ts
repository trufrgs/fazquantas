import { REACTIONS, type ReactionId } from './protocol';
import type { Rules } from './rules';

/**
 * A zoeira que um jogador manda para a mesa (caderno de zoeira, 02/10/2026): atirar coisas num amigo,
 * cutucar quem está demorando, carimbar uma frase na testa de alguém, gritar uma frase, bater a carta
 * na mesa e virar a mesa. É só enfeite: nada disso mexe em regra, palito ou carta. Os limites moram
 * aqui (`ControleDaZoeira`), iguais no servidor e no jogo contra bots, para a zoeira não virar chuva.
 */
export const ITENS_DE_ATIRAR = ['tomate', 'ovo', 'chinelo', 'bergamota'] as const;
export type ItemDeAtirar = (typeof ITENS_DE_ATIRAR)[number];

/**
 * O golpe de cada avatar (caderno de zoeira, refinado em 04/10/2026): quem joga com um destes manda o
 * golpe da casa, desenhado no estilo da turma e sem palavra (a vó atira o chinelo de volta e vem de
 * novo, o zorrilho solta a nuvem, o bugio sacode o assento, o garnisé bica, o quero-quero dá o rasante,
 * o gringo joga o vinho). Conta como tiro (os mesmos três por rodada). A capivara não tem golpe: nela,
 * o que se atira escorrega sem sujar (isso é só da mesa, não passa por aqui).
 */
export const GOLPES_DOS_AVATARES = ['g-vo-do-chinelo', 'g-zorrilho', 'g-bugio', 'g-garnise', 'g-quero-quero', 'g-gringo-do-vinho'] as const;
export type AvatarComGolpe = (typeof GOLPES_DOS_AVATARES)[number];
export const temGolpe = (avatar: string | undefined): avatar is AvatarComGolpe => GOLPES_DOS_AVATARES.includes(avatar as AvatarComGolpe);

export type Zoeira =
  | { tipo: 'atirar'; alvo: string; item: ItemDeAtirar }
  | { tipo: 'golpe'; alvo: string }
  | { tipo: 'cutucar'; alvo: string }
  /** Quem espera no fumo sopra o palheiro na cara de quem demora (só em quem está na vez). */
  | { tipo: 'baforada'; alvo: string }
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
  golpe: 'Teu avatar não tem golpe.',
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
  /** O avatar de quem manda (o golpe é do avatar). */
  avatar?: string;
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
      case 'golpe':
        if (!temGolpe(c.avatar)) return ZOEIRA_ESGOTADA.golpe;
        return (this.tiros.get(`${c.rodada}:${de}`) ?? 0) >= LIMITES_DA_ZOEIRA.tirosPorRodada ? ZOEIRA_ESGOTADA.tiros : null;
      case 'atirar':
        return (this.tiros.get(`${c.rodada}:${de}`) ?? 0) >= LIMITES_DA_ZOEIRA.tirosPorRodada ? ZOEIRA_ESGOTADA.tiros : null;
      case 'virar':
        return (this.viradas.get(`${c.partida}:${de}`) ?? 0) >= LIMITES_DA_ZOEIRA.viradasPorPartida ? ZOEIRA_ESGOTADA.virar : null;
      case 'cutucar':
      case 'baforada':
        if (c.ator !== z.alvo) return ZOEIRA_ESGOTADA.demora;
        return c.agora - (this.cutucou.get(`${z.tipo}:${de}`) ?? -Infinity) < LIMITES_DA_ZOEIRA.cutucaoMs ? ZOEIRA_ESGOTADA.cutucao : null;
      default:
        return c.agora - (this.ultimo.get(de) ?? -Infinity) < LIMITES_DA_ZOEIRA.intervaloMs ? ZOEIRA_ESGOTADA.cutucao : null;
    }
  }

  registrar(de: string, z: Zoeira, c: ContextoDaZoeira): void {
    if (z.tipo === 'atirar' || z.tipo === 'golpe') this.tiros.set(`${c.rodada}:${de}`, (this.tiros.get(`${c.rodada}:${de}`) ?? 0) + 1);
    else if (z.tipo === 'virar') this.viradas.set(`${c.partida}:${de}`, (this.viradas.get(`${c.partida}:${de}`) ?? 0) + 1);
    else if (z.tipo === 'cutucar' || z.tipo === 'baforada') this.cutucou.set(`${z.tipo}:${de}`, c.agora);
    else this.ultimo.set(de, c.agora);
  }

  /** Quantos tiros ainda tem nesta rodada. */
  municao(de: string, rodada: string): number {
    return Math.max(0, LIMITES_DA_ZOEIRA.tirosPorRodada - (this.tiros.get(`${rodada}:${de}`) ?? 0));
  }
}

/**
 * A mão que decide (caderno de zoeira, "A mão que decide" com o "Corte de novela"): na última mão da
 * rodada, quem sai do jogo ou fica conforme leve ou não esta mão. A conta é só a pública (cantadas,
 * mãos feitas antes desta e palitos), sem olhar carta de ninguém. `tricks` é o que cada um fez ANTES
 * da mão em jogo. Devolve os ids em ordem.
 */
export function porUmFio(
  rules: Pick<Rules, 'penalty'>,
  jogadores: readonly { id: string; lives: number; bid: number | null; tricks: number }[],
): string[] {
  const perde = (bid: number, fez: number) => {
    const d = Math.abs(bid - fez);
    return rules.penalty === 'difference' ? d : d > 0 ? 1 : 0;
  };
  return jogadores
    .filter((j) => j.bid !== null && j.lives > 0)
    .filter((j) => j.lives - perde(j.bid!, j.tricks + 1) <= 0 !== j.lives - perde(j.bid!, j.tricks) <= 0)
    .map((j) => j.id);
}
