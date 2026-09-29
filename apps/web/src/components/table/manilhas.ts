import { card, cardName, isManilha, specialName, strength, type CardId, type Play, type Rules, type StrengthCtx } from '@fodinha/engine';

/**
 * "Quem mata quem" (escolhido em 29/09/2026): a manilha ataca as cartas que ganha, do jeito dela.
 * - `corta`: o espadão (e a espadilha) varre a mesa e corta as cartas ao meio;
 * - `bate`: o bastião (e o zap) desce o bastão em cada uma;
 * - `fura`: o sete de espadas fura com a espada fina;
 * - `moedas`: o sete belo (e o pica-fumo) derruba a golpe de moeda;
 * - `vinho`: a manilha de copas, que só existe com vira ou na regra mineira, derrama vinho.
 */
export type Golpe = 'corta' | 'bate' | 'fura' | 'moedas' | 'vinho';

export interface Manilha {
  golpe: Golpe;
  /** O grito da mesa: "Espadão!", "Sete belo!", "Zap!". */
  nome: string;
}

export function contextoDaRodada(rules: Pick<Rules, 'hierarchy'>, vira: CardId | null): StrengthCtx {
  return { mode: rules.hierarchy, vira: vira ? card(vira) : null };
}

/** A carta é manilha nesta rodada? Com qual golpe e qual nome. */
export function manilhaDe(id: CardId, ctx: StrengthCtx): Manilha | null {
  const c = card(id);
  if (!isManilha(c, ctx)) return null;
  const nome = specialName(c, ctx) ?? cardName(c);
  if (ctx.mode === 'gaucha' && id === 'E7') return { golpe: 'fura', nome };
  const golpe: Golpe = c.suit === 'E' ? 'corta' : c.suit === 'P' ? 'bate' : c.suit === 'O' ? 'moedas' : 'vinho';
  return { golpe, nome };
}

/** Um golpe na mão: quem bate, em quem, e quando. */
export interface GolpeNaMao {
  golpe: Golpe;
  /** Quem bate: o jogador da manilha que manda na mesa. */
  atacante: string;
  /** Quem apanha, na ordem em que as cartas caíram. */
  vitimas: string[];
  /**
   * `entrada`: a manilha acabou de passar a mandar e ataca as que já estavam; `revide`: uma manilha
   * mais fraca chegou e apanha na hora; `fim`: a mão fechou e a que levou ataca as que chegaram depois.
   */
  momento: 'entrada' | 'revide' | 'fim';
  /** A jogada que dispara o golpe (índice em `plays`; no fim, `plays.length`). */
  gatilho: number;
}

export const chaveDoGolpe = (g: GolpeNaMao) => `${g.momento}:${g.gatilho}`;

/** A mão na mesa: a rodada e a primeira carta (a mesma carta volta em outra rodada). */
export const chaveDaMao = (rodada: number, plays: readonly Play[]) => `${rodada}:${plays[0]?.cardId ?? ''}`;

/**
 * Quem apanha de quem numa mão. A manilha que passa a mandar na mesa (a mais forte até ali) ataca as
 * cartas que já estavam, inclusive a manilha que mandava antes; uma manilha que chega depois de uma
 * mais forte apanha na hora; com a mão fechada, a que levou ataca as que chegaram depois dela. Cada
 * carta apanha uma vez só. As manilhas nunca empardam entre si (cada uma tem a sua força).
 *
 * A última carta fecha a mão na mesma jogada (o motor resolve a mão ali), então a manilha mais fraca
 * que chega por último não tem revide separado: apanha no golpe do fim, junto com as outras.
 */
export function golpesDaMao(plays: readonly Play[], ctx: StrengthCtx, fechada: boolean): GolpeNaMao[] {
  const golpes: GolpeNaMao[] = [];
  const apanhou = new Set<string>();
  let dono: { playerId: string; golpe: Golpe } | null = null;
  let topo = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < plays.length; i++) {
    const play = plays[i]!;
    const forca = strength(card(play.cardId), ctx);
    const manilha = manilhaDe(play.cardId, ctx);
    if (manilha && forca > topo) {
      const vitimas = plays
        .slice(0, i)
        .map((p) => p.playerId)
        .filter((id) => !apanhou.has(id));
      if (vitimas.length > 0) golpes.push({ golpe: manilha.golpe, atacante: play.playerId, vitimas, momento: 'entrada', gatilho: i });
      for (const id of vitimas) apanhou.add(id);
      dono = { playerId: play.playerId, golpe: manilha.golpe };
    } else if (manilha && dono && !(fechada && i === plays.length - 1)) {
      golpes.push({ golpe: dono.golpe, atacante: dono.playerId, vitimas: [play.playerId], momento: 'revide', gatilho: i });
      apanhou.add(play.playerId);
    }
    topo = Math.max(topo, forca);
  }
  if (fechada && dono) {
    const quem = dono.playerId;
    const vitimas = plays.map((p) => p.playerId).filter((id) => id !== quem && !apanhou.has(id));
    if (vitimas.length > 0) golpes.push({ golpe: dono.golpe, atacante: quem, vitimas, momento: 'fim', gatilho: plays.length });
  }
  return golpes;
}

/**
 * A manilha da jogada `i` passa a mandar na mesa quando cai, por ser a mais forte até ali (grito
 * grande). Falso quando ela chega depois de uma mais forte (grito pequeno).
 */
export function mandaNaMesa(plays: readonly Play[], i: number, ctx: StrengthCtx): boolean {
  const forca = strength(card(plays[i]!.cardId), ctx);
  return plays.slice(0, i).every((p) => strength(card(p.cardId), ctx) < forca);
}

/**
 * A ordem em que as vítimas apanham: a espada varre a mesa da esquerda para a direita (`x`: onde está
 * a carta de cada um), as outras armas vão na ordem em que as cartas caíram.
 */
export function vitimasEmOrdem(g: GolpeNaMao, x: (playerId: string) => number): string[] {
  return g.golpe === 'corta' ? [...g.vitimas].sort((a, b) => x(a) - x(b)) : g.vitimas;
}

// ---------------------------------------------------------------------------------------------------
// O que a mesa já mostrou

/** O que a mesa já mostrou de uma mão: as cartas, se fechou e o que entrou sem golpe. */
export interface MesaVista {
  chave: string;
  cartas: ReadonlySet<CardId>;
  fechada: boolean;
  /** Cartas que entraram sem golpe nem grito (já estavam na mesa, ou chegaram várias de uma vez). */
  semGolpe: ReadonlySet<CardId>;
  /** O golpe do fim também não acontece (a mão já estava fechada, ou fechou num pulo). */
  fimSemGolpe: boolean;
}

/** A mesa mudou desde a última visão (entrou carta, fechou ou virou outra mão)? */
export function mesaMudou(mesa: MesaVista, rodada: number, plays: readonly Play[], fechada: boolean): boolean {
  return mesa.chave !== chaveDaMao(rodada, plays) || mesa.fechada !== fechada || mesa.cartas.size !== plays.length || plays.some((p) => !mesa.cartas.has(p.cardId));
}

/**
 * A mesa depois de mais uma visão. Na primeira (`antes` nulo: a mesa acabou de aparecer, voltou para
 * a sala, recarregou) e quando chega mais de uma carta de uma vez (a conexão voltou sem sair da mesa),
 * o que chegou entra sem golpe: o que aconteceu longe da tela não se repete, e várias armas de uma vez
 * viram bagunça.
 */
export function mesaVista(antes: MesaVista | null, rodada: number, plays: readonly Play[], fechada: boolean): MesaVista {
  const chave = chaveDaMao(rodada, plays);
  const cartas = new Set(plays.map((p) => p.cardId));
  const mesma = antes !== null && antes.chave === chave;
  const novas = mesma ? plays.filter((p) => !antes.cartas.has(p.cardId)).map((p) => p.cardId) : [...cartas];
  const pulo = antes === null || novas.length > 1;
  const semGolpe = new Set(mesma ? antes.semGolpe : []);
  if (pulo) for (const id of novas) semGolpe.add(id);
  const fechou = fechada && !(mesma && antes.fechada);
  return { chave, cartas, fechada, semGolpe, fimSemGolpe: (mesma && antes.fimSemGolpe) || (fechou && pulo) };
}

/** O golpe tem direito à animação (e ao som) nesta mesa? */
export function golpeComAnimacao(g: GolpeNaMao, plays: readonly Play[], mesa: MesaVista): boolean {
  if (g.momento === 'fim') return !mesa.fimSemGolpe;
  const gatilho = plays[g.gatilho];
  return !!gatilho && !mesa.semGolpe.has(gatilho.cardId);
}

// ---------------------------------------------------------------------------------------------------
// O tempo

/**
 * O tempo dos golpes, em segundos, no ritmo normal. Todo golpe começa `inicio` depois da jogada que o
 * dispara (a carta pousar; o fim vem na mesma jogada da última carta, então também espera). `passo` é
 * o intervalo entre uma vítima e a seguinte; `acerto`, quando a arma chega nela (o bastão em 55% da
 * descida, a espada fina em 60% da estocada, a moeda e a gota de vinho no fim do voo); `reacao`,
 * quanto a carta leva para reagir; `arma`, quanto dura cada arma inteira; `cadencia`, o intervalo
 * entre as três moedas (ou gotas); `grito`, quanto o grito fica. A mão com manilha fica 2,2 s na mesa
 * no ritmo normal (`MANILHA_PAUSE_FACTOR`; bem menos no rápido): com a mesa cheia, o intervalo encurta
 * até o `espalho`, para a última vítima apanhar antes de as cartas saírem.
 */
export const TEMPO_GOLPE = {
  inicio: 0.3,
  passo: { corta: 0.12, bate: 0.36, fura: 0.3, moedas: 0.27, vinho: 0.27 },
  acerto: { corta: 0.24, bate: 0.41, fura: 0.37, moedas: 0.66, vinho: 0.66 },
  reacao: { corta: 0.55, bate: 0.45, fura: 0.38, moedas: 0.42, vinho: 0.42 },
  arma: { bastao: 0.75, florete: 0.62, lascas: 0.6, depoisDoCorte: 0.3 },
  cadencia: 0.1,
  espalho: 0.6,
  grito: 1.6,
} as const;

/** O ritmo que os golpes usam (1 = normal; o turbo é 4): só protege contra valor estranho. */
export const ritmoDosGolpes = (ritmo = 1) => Math.min(4, Math.max(0.5, ritmo));

/** O intervalo entre uma vítima e a seguinte neste golpe (mais curto quando são muitas). */
export function passoDe(g: GolpeNaMao): number {
  const passo = TEMPO_GOLPE.passo[g.golpe];
  const n = g.vitimas.length;
  return n > 1 ? Math.min(passo, TEMPO_GOLPE.espalho / (n - 1)) : passo;
}

/** Quando a arma acerta a vítima `ordem` do golpe (segundos desde a jogada que o dispara, no ritmo normal). */
export function acertoDe(g: GolpeNaMao, ordem: number): number {
  return TEMPO_GOLPE.inicio + ordem * passoDe(g) + TEMPO_GOLPE.acerto[g.golpe];
}
