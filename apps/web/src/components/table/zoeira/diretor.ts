import { porUmFio, quemMatou, type PlayerView, type ReactionId, type RoundRecord } from '@fodinha/engine';

/**
 * O diretor da zoeira: decide o que a mesa faz sozinha para debochar de quem joga, e principalmente o
 * que ela NÃO faz ao mesmo tempo. O Thomas escolheu dezenas de ideias de uma vez (caderno de zoeira,
 * 02/10/2026) com uma condição: "garanta que o excesso de opções não sobrecarregue ou afete a
 * jogabilidade, com opções se confundindo entre si". Daí as regras, todas neste arquivo:
 *
 * 1. **Cada coisa tem o seu lugar, e cada lugar mostra uma de cada vez.**
 *    - `enfeite`: o estado de um assento (borracho, mão quente, pé-frio, líder, lanterna, lápide, a
 *      galinha de quem só canta zero). Fica enquanto for verdade, cada um num ponto fixo do assento
 *      (ver `Enfeites`).
 *    - `máscara`: o que a rodada deixou no meio do rosto (focinho de porco de quem fez mais do que
 *      cantou, nariz de palhaço de quem fez menos), no avatar ou na câmera. Uma por rosto, do fim da
 *      rodada até a primeira carta da seguinte: nunca enquanto se joga carta (ver `mascarasDe`).
 *    - `cena de assento`: um instante em cima de um rosto (a vaca, a traíra, a chinelada). No máximo
 *      `MAX_CENAS` ao mesmo tempo na mesa, as de maior `PESO`.
 *    - `palco`: o meio da mesa (o cartão do freguês). Uma por vez e só em tempo morto (mão fechada,
 *      fim de rodada): nunca por cima das cartas enquanto alguém decide. A mão que decide (o corte de
 *      novela em quem está por um fio) é do palco também: a mesa espera por ela (`decisiveMs`).
 *    - `faixa`: a voz do narrador (e o coro). Uma por vez, com intervalo, no máximo `FALAS_POR_RODADA`
 *      por rodada. Tudo o que a mesa "diz" passa por ela: não existe segundo tipo de letreiro. O
 *      narrador só fala em tempo morto (cantadas, mão fechada, fim de rodada); o coro entra na hora,
 *      porque é a turma que puxa.
 * 2. **Quando duas coisas pedem o mesmo lugar, a mais importante entra e a outra some.** Nada fica na
 *    fila para aparecer atrasado, fora de contexto.
 * 3. **Nada pega toque nem cobre a mão, o painel de cantar ou as cartas de quem decide.**
 * 4. **Sem letrinha de gibi.** Nada de onomatopeia ("pá!", "cocoricó"): o Thomas achou brega. Palavra
 *    só quando é a piada (o carimbo, o epitáfio, o ditado do narrador).
 * 5. Em câmera rápida não acontece nada; com "reduzir movimento" ficam só os enfeites parados e a
 *    faixa.
 *
 * Aqui só tem conta pura (testada em `diretor.test.ts`); quem agenda e desenha é `useZoeira` e os
 * componentes da pasta.
 */

// ---------------------------------------------------------------------------------------- limites

/** Cenas de assento ao mesmo tempo na mesa. */
export const MAX_CENAS = 2;
/** Falas do narrador por rodada (o coro não conta: é a turma que puxa). */
export const FALAS_POR_RODADA = 2;
/** Intervalo mínimo entre o fim de uma fala e o começo da outra (ms). */
export const INTERVALO_DA_FAIXA_MS = 4000;
/** Quanto cada coisa fica na mesa (ms). */
export const DURACAO = { fala: 3400, coro: 2300, vaca: 2100, traira: 2000, chinelada: 1700, cumadre: 1800, fregues: 3000 } as const;
/** Tantas mortes da carta de um pelo mesmo dono fazem o freguês. */
export const FREGUES_EM = 5;
/** Demorou tanto na vez (ms), o narrador comenta. */
export const DEMORA_DO_NARRADOR_MS = 30000;
/** Tantos mandando a mesma frase em tanto tempo viram coro. */
export const CORO = { vozes: 3, janelaMs: 5000, descansoMs: 20000 } as const;

// --------------------------------------------------------------------------------------- enfeites

/**
 * O estado de um assento, cada coisa no seu ponto: a coroa do líder em cima do rosto, a chama da mão
 * quente atrás dele, o gelo do pé-frio por cima (cor e tremor), o borracho no balanço do rosto, a
 * lanterna ao lado do nome, a lápide atrás de quem saiu. Mão quente e pé-frio nunca andam juntos.
 * "Líder e lanterna", como no campeonato: "patrão" é outra coisa, é quem manda na mesa (a sala).
 */
export interface Enfeites {
  /** Palitos perdidos viram tragos: 0 sóbrio, 1 alegre, 2 soluçando, 3 no último palito. */
  borracho: 0 | 1 | 2 | 3;
  /** Rodadas seguidas acertando (0 se menos de três). */
  quente: number;
  /** Rodadas seguidas errando (0 se menos de três). */
  frio: number;
  /** Sozinho na frente em palitos. */
  lider: boolean;
  /** Sozinho em último entre os vivos. */
  lanterna: boolean;
  /** Saiu do jogo: o que matou ("cantou 3, fez 0"). */
  epitafio: string | null;
  /** Cantou zero nas últimas três rodadas seguidas (ou mais): a galinha cisca no pé do assento. */
  galinha: boolean;
}

const SEM_ENFEITE: Enfeites = { borracho: 0, quente: 0, frio: 0, lider: false, lanterna: false, epitafio: null, galinha: false };

/** Quantas rodadas seguidas, a contar da última que jogou, `id` cantou zero. */
export function zerosSeguidos(history: readonly RoundRecord[], id: string): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const b = history[i]!.bids[id];
    if (b === undefined) continue;
    if (b !== 0) break;
    n++;
  }
  return n;
}

/** As rodadas seguidas, a contar da última, em que `id` acertou e em que errou (só as que ele jogou). */
export function sequencia(history: readonly RoundRecord[], id: string): { acertos: number; erros: number } {
  let acertos = 0;
  let erros = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i]!;
    if (r.bids[id] === undefined) continue;
    const acertou = r.bids[id] === (r.tricks[id] ?? 0);
    if (acertou && erros === 0) acertos++;
    else if (!acertou && acertos === 0) erros++;
    else break;
  }
  return { acertos, erros };
}

/** O que escrever na lápide de quem saiu: a rodada que matou. */
export function epitafioDe(view: PlayerView, id: string): string | null {
  const p = view.players.find((x) => x.id === id);
  if (!p?.eliminated) return null;
  const r = view.history.find((h) => h.eliminated.includes(id)) ?? view.history.find((h) => h.number === p.eliminatedRound);
  if (!r || r.bids[id] === undefined) return 'deu pra ti';
  return `cantou ${r.bids[id]}, fez ${r.tricks[id] ?? 0}`;
}

/** Os enfeites de cada assento, a partir do que a mesa mostra (sem estado guardado). */
export function enfeitesDe(view: PlayerView): Map<string, Enfeites> {
  const vivos = view.players.filter((p) => !p.eliminated);
  const jogou = view.history.length > 0;
  const maior = Math.max(0, ...vivos.map((p) => p.lives));
  const menor = Math.min(...vivos.map((p) => p.lives));
  const naFrente = vivos.filter((p) => p.lives === maior);
  const atras = vivos.filter((p) => p.lives === menor);
  const inicial = view.rules.startingLives;
  const fim = view.phase === 'gameOver';
  return new Map(
    view.players.map((p) => {
      if (p.eliminated) return [p.id, { ...SEM_ENFEITE, epitafio: epitafioDe(view, p.id) }];
      const perdidos = inicial - p.lives;
      const borracho = perdidos <= 0 ? 0 : p.lives <= 1 && inicial > 1 ? 3 : perdidos * 2 >= inicial ? 2 : 1;
      const s = sequencia(view.history, p.id);
      return [
        p.id,
        {
          borracho,
          quente: s.acertos >= 3 ? s.acertos : 0,
          frio: s.erros >= 3 ? s.erros : 0,
          // Líder e lanterna só existem com a mesa desigual e mais de uma pessoa viva.
          lider: jogou && !fim && vivos.length > 1 && maior > menor && naFrente.length === 1 && naFrente[0]!.id === p.id,
          lanterna: jogou && !fim && vivos.length > 2 && maior > menor && atras.length === 1 && atras[0]!.id === p.id,
          epitafio: null,
          galinha: !fim && zerosSeguidos(view.history, p.id) >= 3,
        } satisfies Enfeites,
      ];
    }),
  );
}

// --------------------------------------------------------------------------------------- máscaras

export type Mascara = 'porco' | 'palhaco';

/**
 * O que a última rodada deixou no meio de cada rosto: o focinho de porco de quem fez mais do que
 * cantou (o guloso) e o nariz de palhaço de quem fez menos. Aparece no fim da rodada e fica pela
 * cantada da seguinte, para a mesa debochar; some na primeira carta (jogando, o rosto fica limpo).
 * Quem saiu fica só na lápide.
 */
export function mascarasDe(view: PlayerView): Map<string, Mascara> {
  const r = view.history.at(-1);
  const m = new Map<string, Mascara>();
  if (!r || view.phase === 'gameOver') return m;
  const fimDela = view.phase === 'roundEnd' && view.roundNumber === r.number;
  const semCarta = (view.trick?.plays.length ?? 0) === 0 && view.completedTricks.length === 0;
  const cantadaDaSeguinte = view.roundNumber === r.number + 1 && (view.phase === 'bidding' || (view.phase === 'playing' && semCarta));
  if (!fimDela && !cantadaDaSeguinte) return m;
  for (const [id, cantou] of Object.entries(r.bids)) {
    if (r.eliminated.includes(id)) continue;
    const fez = r.tricks[id] ?? 0;
    if (fez > cantou) m.set(id, 'porco');
    else if (fez < cantou) m.set(id, 'palhaco');
  }
  return m;
}

// ------------------------------------------------------------------------------ a mão que decide

/**
 * A última mão da rodada acabou de fechar e ela decide se alguém sai do jogo: quem está por um fio
 * (a conta é a mesma do anfitrião, `porUmFio`, que segura a mesa `decisiveMs` a mais).
 */
export function maoQueDecide(view: PlayerView): string[] {
  const ultima = view.lastTrick;
  if (view.phase !== 'trickEnd' || !ultima) return [];
  const naRodada = view.players.filter((p) => p.inRound && !p.eliminated);
  if (naRodada.some((p) => p.handCount > 0)) return [];
  return porUmFio(
    view.rules,
    naRodada.map((p) => ({ id: p.id, lives: p.lives, bid: p.bid, tricks: p.tricks - (ultima.winnerId === p.id ? 1 : 0) })),
  );
}

// ------------------------------------------------------------------------------- quem mata quem

/** Quem matou a carta de quem: a conta mora na engine (o mural da vergonha usa a mesma). */
export { quemMatou };

/** O valor de que um "é galo" fala (`galo-3` → `3`); o genérico vale para a carta que estiver levando. */
export function valorDoGalo(id: ReactionId): string | 'qualquer' | null {
  if (id === 'galo') return 'qualquer';
  return id.startsWith('galo-') ? id.slice(5) : null;
}

// ------------------------------------------------------------------------------- fim da rodada

export type CenaDeAssento = 'vaca' | 'traira' | 'chinelada' | 'cumadre';
/** Quando faltam lugares (`MAX_CENAS`), entra a de maior peso. */
export const PESO: Record<CenaDeAssento, number> = { chinelada: 3, traira: 2, vaca: 1, cumadre: 0 };

export interface Fala {
  /** A chave do ditado: o mesmo não sai duas vezes na partida. */
  id: string;
  texto: string;
}

/** As cenas de assento do fim de uma rodada: quem saiu leva a chinelada; quem errou por dois ou mais, a vaca. */
export function cenasDoFimDaRodada(r: RoundRecord): { alvo: string; tipo: CenaDeAssento }[] {
  const cenas: { alvo: string; tipo: CenaDeAssento }[] = [];
  for (const id of Object.keys(r.bids)) {
    if (r.eliminated.includes(id)) cenas.push({ alvo: id, tipo: 'chinelada' });
    else if (Math.abs((r.tricks[id] ?? 0) - r.bids[id]!) >= 2) cenas.push({ alvo: id, tipo: 'vaca' });
  }
  return cenas.sort((a, b) => PESO[b.tipo] - PESO[a.tipo]).slice(0, MAX_CENAS);
}

/**
 * O que o narrador diz no fim da rodada: no máximo uma fala, a do lance mais marcante, com ditado
 * gaúcho de verdade (o banco veio dos ditados comparativos; sem concordância de gênero, que a mesa
 * não sabe quem é quem). `ditas` são as que já saíram na partida.
 */
export function falaDoFimDaRodada(view: PlayerView, ditas: ReadonlySet<string>): Fala | null {
  const r = view.history.at(-1);
  if (!r) return null;
  const nome = (id: string) => view.players.find((p) => p.id === id)?.name ?? '';
  const jogaram = Object.keys(r.bids).filter((id) => !r.eliminated.includes(id));
  const candidatas: Fala[] = [];
  for (const id of jogaram) {
    const cantou = r.bids[id]!;
    const fez = r.tricks[id] ?? 0;
    if (r.cards >= 2 && cantou === r.cards && fez === cantou) {
      candidatas.push({ id: 'ganso', texto: `${nome(id)} fez todas: anda que nem ganso novo em taipa de açude.` });
    }
  }
  for (const id of jogaram) {
    const antes = r.livesBefore[id] ?? 0;
    const depois = r.livesAfter[id] ?? 0;
    if (depois === 1 && antes > 1) candidatas.push({ id: 'potro', texto: `${nome(id)} no último palito: potro com mosca no ouvido.` });
  }
  for (const id of jogaram) {
    const antes = r.livesBefore[id] ?? 0;
    if (antes === 1 && (r.livesAfter[id] ?? 0) === 1 && view.rules.startingLives > 1) {
      candidatas.push({ id: 'palanque', texto: `${nome(id)} segue firme que nem palanque em banhado.` });
    }
  }
  for (const id of jogaram) {
    if (sequencia(view.history, id).erros === 3) candidatas.push({ id: 'cusco', texto: `${nome(id)} se perdeu que nem cusco em procissão.` });
  }
  return candidatas.find((f) => !ditas.has(f.id)) ?? null;
}

/** Cantou todas com três cartas ou mais: o narrador avisa do risco. */
export function falaDaCantada(nome: string, cantou: number, cartas: number): Fala | null {
  return cartas >= 3 && cantou === cartas ? { id: 'bolso', texto: `${nome} cantou todas. Arriscado como correr de mão no bolso.` } : null;
}

/** Jogou depois de muita demora. Duas falas, para não repetir. */
export function falaDaDemora(nome: string, ditas: ReadonlySet<string>): Fala | null {
  const falas: Fala[] = [
    { id: 'viuva', texto: `Devagarzito como enterro de viúva rica, ${nome}.` },
    { id: 'lesma', texto: `${nome} joga no passo de tropeiro de lesma.` },
  ];
  return falas.find((f) => !ditas.has(f.id)) ?? null;
}

// ------------------------------------------------------------------------------------------ coro

/**
 * A mesma frase mandada por `CORO.vozes` pessoas diferentes dentro da janela: devolve a frase que
 * virou coro (a mais recente que fechou a conta), ou `null`.
 */
export function coroDe(frases: readonly { playerId: string; reaction: ReactionId; em: number }[], agora: number): ReactionId | null {
  const recentes = frases.filter((f) => agora - f.em <= CORO.janelaMs);
  const vozes = new Map<ReactionId, Set<string>>();
  for (const f of recentes) {
    const s = vozes.get(f.reaction) ?? new Set<string>();
    s.add(f.playerId);
    vozes.set(f.reaction, s);
  }
  const ultima = recentes.at(-1);
  if (!ultima) return null;
  return (vozes.get(ultima.reaction)?.size ?? 0) >= CORO.vozes ? ultima.reaction : null;
}
