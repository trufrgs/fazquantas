import { card, cardName, isManilha, specialName, strength, type CardId, type Play, type PlayerView, type Rules, type StrengthCtx } from '@fodinha/engine';

/**
 * "Quem mata quem" (escolhido em 29/09/2026): a manilha ataca as cartas que ganha, do jeito dela, com a
 * arma saindo de dentro da própria carta (pedido do Thomas em 29/09/2026):
 * - `corta`: o espadão (e a espadilha) sai da carta, varre a mesa e corta as cartas ao meio;
 * - `bate`: o bastão sai do bastião (e do zap) e desce em cada uma;
 * - `fura`: os punhais saem do sete de espadas e cravam nas outras;
 * - `brilha`: o ouro do sete belo (e do pica-fumo) se levanta da carta, brilha e ofusca as outras (a
 *   moeda atirada saiu: "o belo tem que brilhar, apagando as demais", o Igor, 29/09/2026);
 * - `vinho`: a copa sai da manilha de copas, que só existe com vira ou na regra mineira, e joga vinho.
 */
export type Golpe = 'corta' | 'bate' | 'fura' | 'brilha' | 'vinho';

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
  const golpe: Golpe = c.suit === 'E' ? 'corta' : c.suit === 'P' ? 'bate' : c.suit === 'O' ? 'brilha' : 'vinho';
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
 * dispara (a carta pousar; o fim vem na mesma jogada da última carta, então também espera). Primeiro a
 * arma sai de dentro da carta de quem ataca (`sai`: a carta acende e o espadão, o bastão, os punhais,
 * o ouro ou a copa se levantam do desenho dela); depois vai às vítimas. `passo` é o intervalo entre uma
 * vítima e a seguinte; `acerto`, quanto a arma leva de erguida até chegar nela (o fio da espada, o
 * bastão no fim da descida, o punhal cravando, a luz do ouro, a gota de vinho no fim do voo);
 * `punhal`, o intervalo entre os punhais cravados na mesma vítima; `reacao`, quanto a carta leva para
 * reagir; `arma`, quanto duram as lascas, a espada depois do último corte e a luz do ouro;
 * `cadencia`, o intervalo entre as gotas de vinho; `grito`, quanto o grito fica. A mão com manilha
 * fica 2,2 s na mesa no ritmo normal (`MANILHA_PAUSE_FACTOR`; bem menos no rápido): com a mesa cheia,
 * o intervalo encurta até o `espalho`, para a última vítima apanhar antes de as cartas saírem.
 */
export const TEMPO_GOLPE = {
  inicio: 0.3,
  sai: { corta: 0.4, bate: 0.38, fura: 0.38, brilha: 0.4, vinho: 0.32 },
  passo: { corta: 0.12, bate: 0.36, fura: 0.3, brilha: 0.12, vinho: 0.27 },
  acerto: { corta: 0.26, bate: 0.36, fura: 0.3, brilha: 0.34, vinho: 0.56 },
  punhal: 0.12,
  reacao: { corta: 0.6, bate: 0.5, fura: 0.42, brilha: 0.7, vinho: 0.42 },
  arma: { lascas: 0.6, depoisDoCorte: 0.3, luz: 1.5 },
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
  return TEMPO_GOLPE.inicio + TEMPO_GOLPE.sai[g.golpe] + ordem * passoDe(g) + TEMPO_GOLPE.acerto[g.golpe];
}

/**
 * Quantos punhais saem do sete de espadas para cada vítima: três numa só, dois em cada uma de duas e
 * um em cada a partir de três (nunca mais que as sete espadas desenhadas na carta).
 */
export function punhaisPorVitima(vitimas: number): number {
  return vitimas <= 1 ? 3 : vitimas === 2 ? 2 : 1;
}

/** Quando o punhal `n` (0 é o primeiro) crava na vítima `ordem` do sete de espadas. */
export function acertoDoPunhal(g: GolpeNaMao, ordem: number, n: number): number {
  return acertoDe(g, ordem) + n * TEMPO_GOLPE.punhal;
}

/** Quanto a mesa treme em cada pancada (em 1/60 da largura da carta): o bastão sacode; a luz, não. */
export const TREMOR: Readonly<Record<Golpe, number>> = { corta: 5, bate: 10, fura: 6, brilha: 0, vinho: 3 };

/**
 * As pancadas deste golpe: quando (segundos desde a jogada, no ritmo normal) e com que força. `ordem`:
 * as vítimas na ordem em que apanham (a espada corta da esquerda para a direita); `forte`: quem
 * apanha feio (o bastião partido pelo espadão sacode a mesa bem mais).
 */
export function impactosDoGolpe(
  g: GolpeNaMao,
  ordem: readonly string[] = g.vitimas,
  forte: (playerId: string) => boolean = () => false,
): { t: number; forca: number }[] {
  const forca = TREMOR[g.golpe];
  if (!forca) return [];
  if (g.golpe === 'fura') {
    // Cada punhal cravado dá um tranco; o último, que joga a carta para trás, o maior.
    const k = punhaisPorVitima(g.vitimas.length);
    return ordem.flatMap((_, i) => Array.from({ length: k }, (__, n) => ({ t: acertoDoPunhal(g, i, n), forca: n === k - 1 ? forca : forca * 0.55 })));
  }
  return ordem.map((id, i) => ({ t: acertoDe(g, i), forca: forte(id) ? forca * 2.4 : forca }));
}

/**
 * O duelo das duas maiores: a espada que corta a manilha de paus (o espadão partindo o bastião, "a faca
 * cortando o pau que já tava na mesa", o Igor, 29/09/2026). Devolve quem teve o bastião partido.
 */
export function bastiaoCortado(g: GolpeNaMao, cartaDe: (playerId: string) => CardId | undefined, ctx: StrengthCtx): string | null {
  if (g.golpe !== 'corta') return null;
  return (
    g.vitimas.find((id) => {
      const c = cartaDe(id);
      return !!c && manilhaDe(c, ctx)?.golpe === 'bate';
    }) ?? null
  );
}

/**
 * Rodada da carta na testa: quem levou a mão tinha cantado zero e a carta dele era manilha (na testa,
 * ele não via). Perde o palito por ter a maior carta ("o cara perder a testa porque tava com manilha").
 */
export function manilhaNaTesta(view: PlayerView): { playerId: string; nome: string } | null {
  if (!view.blind || view.phase !== 'trickEnd' || !view.lastTrick?.winnerId) return null;
  const quem = view.lastTrick.winnerId;
  if (view.players.find((p) => p.id === quem)?.bid !== 0) return null;
  const carta = view.lastTrick.plays.find((p) => p.playerId === quem)?.cardId;
  const m = carta ? manilhaDe(carta, contextoDaRodada(view.rules, view.vira)) : null;
  return m ? { playerId: quem, nome: m.nome } : null;
}

/**
 * A mesa tremendo com as pancadas: um solavanco para um lado, para o outro e de volta em cada uma.
 * Devolve os quadros (`x`, `y` na força de cada pancada, `times` de 0 a 1) e a duração em segundos.
 */
export function tremor(impactos: readonly { t: number; forca: number }[]): { x: number[]; y: number[]; times: number[]; duracao: number } | null {
  if (impactos.length === 0) return null;
  const SOLAVANCO = [
    [0, 0, 0],
    [0.03, 1, 0.6],
    [0.07, -0.8, -0.45],
    [0.11, 0.45, 0.25],
    [0.16, 0, 0],
  ] as const;
  const pontos: [number, number, number][] = [[0, 0, 0]];
  for (const { t, forca } of impactos) for (const [dt, fx, fy] of SOLAVANCO) pontos.push([t + dt, fx * forca, fy * forca]);
  pontos.sort((a, b) => a[0] - b[0]);
  const duracao = pontos.at(-1)![0];
  return { x: pontos.map((p) => p[1]), y: pontos.map((p) => p[2]), times: pontos.map((p) => p[0] / duracao), duracao };
}
