import { card, REACTIONS, resolveTrick, type CardId, type PlayerView, type ReactionId } from '@fodinha/engine';
import { create } from 'zustand';
import { chaveDaMao, contextoDaRodada } from '../manilhas';
import {
  cenasDoFimDaRodada,
  CORO,
  coroDe,
  DEMORA_DO_NARRADOR_MS,
  DURACAO,
  falaDaCantada,
  falaDaDemora,
  falaDoFimDaRodada,
  FALAS_POR_RODADA,
  FREGUES_EM,
  INTERVALO_DA_FAIXA_MS,
  MAX_CENAS,
  PESO,
  quemMatou,
  valorDoGalo,
  type CenaDeAssento,
  type Fala,
} from './diretor';

/** O que está em cena agora, cada coisa no seu lugar (as regras estão em `diretor.ts`). */
export interface Quadro {
  /** Cena em cima de um rosto, por jogador. */
  cenas: Record<string, { tipo: CenaDeAssento; chave: number }>;
  /** A voz do narrador ou o coro da turma. */
  faixa: { chave: number; texto: string; coro: boolean } | null;
  /** O meio da mesa: o cartão fidelidade do freguês. */
  palco: { chave: number; fregues: string; dono: string } | null;
  /** As bitucas da espera: quantas, e por conta de quem. */
  cinzeiro: { total: number; por: Record<string, number> };
  /** Quem mais teve a carta morta pelo mesmo dono na partida. */
  fregues: { fregues: string; dono: string; vezes: number } | null;
}

const VAZIO: Quadro = { cenas: {}, faixa: null, palco: null, cinzeiro: { total: 0, por: {} }, fregues: null };

export const useZoeira = create<Quadro>(() => VAZIO);

export interface Contexto {
  /** O avatar de cada um (a rixa de lenço só existe entre o Maragato e o Chimango). */
  avatarDe: (id: string) => string | undefined;
  /** Falso em câmera rápida: não acontece nada. */
  ativa: boolean;
  /** "Reduzir movimento": sem cenas, só a faixa. */
  calma: boolean;
  /** Sala em que se espera ao vivo (na de vez longa, demorar é o normal). */
  aoVivo: boolean;
}

const RIVAIS = ['g-maragato', 'g-chimango'] as const;

/**
 * A agenda de uma partida: olha cada visão e cada frase que chegam e põe em cena o que couber,
 * respeitando os lugares e os limites do diretor. Uma por mesa (a mesa remonta a cada partida).
 */
export class Agenda {
  private n = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private antes: PlayerView | null = null;
  private ctx: Contexto = { avatarDe: () => undefined, ativa: true, calma: false, aoVivo: true };
  private ditas = new Set<string>();
  private falas = { rodada: 0, n: 0 };
  private faixaLivreEm = 0;
  private coroLivreEm = 0;
  private mortes = new Map<string, number>();
  private jaFregues = new Set<string>();
  private mao = { chave: '', n: 0 };
  private galos: { chave: string; carta: CardId }[] = [];
  private frases: { playerId: string; reaction: ReactionId; em: number }[] = [];
  private pendente: { chave: string; fregues: string; dono: string } | null = null;
  private rixa: { chave: string; texto: string } | null = null;
  /** Fala que espera o tempo morto (com carta na mesa, o narrador não fala por cima dela). */
  private guardada: Fala | null = null;
  private vezDesde = 0;

  /** Entra em cena com a mesa limpa (chamar num efeito: limpar a loja no render atualiza outros componentes). */
  comecar(): void {
    useZoeira.setState(VAZIO, true);
  }

  /** Sai de cena: nada agendado continua. */
  parar(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    useZoeira.setState({ cenas: {}, faixa: null, palco: null });
  }

  private depois(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  /** Uma visão nova da mesa. */
  ver(view: PlayerView, ctx: Contexto, agora = Date.now()): void {
    const p = this.antes;
    this.antes = view;
    this.ctx = ctx;
    const fechada = view.phase === 'trickEnd';
    const plays = (fechada ? view.lastTrick?.plays : view.trick?.plays) ?? [];
    const chave = plays.length > 0 ? chaveDaMao(view.roundNumber, plays) : '';
    if (!p) {
      // Primeira visão (chegou agora, ou recarregou): o que já está na mesa não vira cena.
      this.mao = { chave, n: plays.length };
      this.falas = { rodada: view.roundNumber, n: 0 };
      this.vezDesde = agora;
      return;
    }
    if (view.seq === p.seq) return;
    if (view.roundNumber !== this.falas.rodada) this.falas = { rodada: view.roundNumber, n: 0 };
    const nome = (id: string) => view.players.find((x) => x.id === id)?.name ?? '';

    // Quem acabou de agir demorou muito.
    const agiu = p.actor?.playerId ?? null;
    if (ctx.aoVivo && agiu && (p.phase === 'bidding' || p.phase === 'playing') && agora - this.vezDesde >= DEMORA_DO_NARRADOR_MS) {
      const f = falaDaDemora(nome(agiu), this.ditas);
      // Com carta na mesa, a fala espera a mão fechar: a faixa não cobre as cartas de quem decide.
      if (f && view.phase === 'playing' && plays.length > 0) this.guardada = f;
      else if (f) this.fala(f, agora);
    }
    this.vezDesde = agora;

    // Cantou todas.
    if (view.roundNumber === p.roundNumber) {
      for (const j of view.players) {
        const a = p.players.find((x) => x.id === j.id);
        if (!a || a.bid !== null || j.bid === null) continue;
        const f = falaDaCantada(j.name, j.bid, view.cardsThisRound);
        if (f) this.fala(f, agora);
      }
    }

    // As cartas que chegaram: quem tomou a mão de quem.
    if (chave !== this.mao.chave) this.mao = { chave, n: 0 };
    const sctx = contextoDaRodada(view.rules, view.vira);
    for (let i = this.mao.n; i < plays.length; i++) {
      const k = quemMatou(plays.slice(0, i + 1), sctx, view.rules.tieRule);
      if (!k) continue;
      const par = `${k.matador}>${k.vitima}`;
      const vezes = (this.mortes.get(par) ?? 0) + 1;
      this.mortes.set(par, vezes);
      const maior = useZoeira.getState().fregues;
      if (!maior || vezes > maior.vezes) useZoeira.setState({ fregues: { fregues: k.vitima, dono: k.matador, vezes } });
      // Só a carta que acabou de cair vira cena (as outras chegaram de uma vez, na volta da conexão).
      if (i !== plays.length - 1) continue;
      if (this.galos.some((g) => g.chave === chave && g.carta === k.carta)) {
        this.cena(k.matador, 'traira');
        this.galos = this.galos.filter((g) => g.chave !== chave);
      }
      if (vezes === FREGUES_EM && !this.jaFregues.has(par)) {
        this.jaFregues.add(par);
        this.pendente = { chave, fregues: k.vitima, dono: k.matador };
      }
      const avatares = [ctx.avatarDe(k.matador), ctx.avatarDe(k.vitima)];
      if (RIVAIS.every((r) => avatares.includes(r))) {
        const [m, c] = RIVAIS.map((r) => (ctx.avatarDe(k.matador) === r ? k.matador : k.vitima)) as [string, string];
        const placar = `Maragato ${this.mortes.get(`${m}>${c}`) ?? 0} × ${this.mortes.get(`${c}>${m}`) ?? 0} Chimango`;
        this.rixa = { chave, texto: `Peleia de lenço: ${placar}.` };
      }
    }
    this.mao.n = plays.length;

    // Mão fechada: tempo morto, o meio da mesa está livre.
    if (fechada && p.phase !== 'trickEnd') {
      if (this.pendente?.chave === chave) this.mostraPalco(this.pendente);
      else if (this.rixa?.chave === chave) this.fala({ id: `rixa:${chave}`, texto: this.rixa.texto }, agora);
      else if (this.guardada) this.fala(this.guardada, agora);
      this.pendente = null;
      this.rixa = null;
      this.guardada = null;
    }

    // Fim da rodada: a chinelada em quem saiu, a vaca em quem errou feio, e uma fala.
    if (view.phase === 'roundEnd' && p.phase !== 'roundEnd') {
      const r = view.history.at(-1);
      if (r) for (const c of cenasDoFimDaRodada(r)) this.cena(c.alvo, c.tipo);
      const f = falaDoFimDaRodada(view, this.ditas) ?? this.guardada;
      if (f) this.fala(f, agora);
      this.guardada = null;
    }
  }

  /** Uma frase mandada na mesa: o "é galo" marca a carta que está levando; três iguais viram coro. */
  ouvir(playerId: string, reaction: ReactionId, agora = Date.now()): void {
    const view = this.antes;
    this.frases = [...this.frases.filter((f) => agora - f.em <= CORO.janelaMs), { playerId, reaction, em: agora }];
    const valor = valorDoGalo(reaction);
    const plays = view?.phase === 'playing' ? (view.trick?.plays ?? []) : [];
    if (view && valor && plays.length > 0) {
      const levando = resolveTrick(plays, contextoDaRodada(view.rules, view.vira), view.rules.tieRule).winnerId;
      const carta = plays.find((x) => x.playerId === levando)?.cardId;
      if (carta && (valor === 'qualquer' || String(card(carta).rank) === valor)) {
        this.galos.push({ chave: chaveDaMao(view.roundNumber, plays), carta });
      }
    }
    const coro = coroDe(this.frases, agora);
    if (coro && this.ctx.ativa && agora >= this.coroLivreEm) {
      this.coroLivreEm = agora + CORO.descansoMs;
      this.frases = [];
      const frase = REACTIONS.find((r) => r.id === coro)?.label ?? '';
      this.mostraFaixa(frase, true, DURACAO.coro, agora);
    }
  }

  /** Os palheiros acenderam esperando `ator`: uma bituca por quem espera, na conta dele. */
  demorou(ator: string, esperando: number): void {
    if (esperando <= 0) return;
    const c = useZoeira.getState().cinzeiro;
    useZoeira.setState({ cinzeiro: { total: c.total + esperando, por: { ...c.por, [ator]: (c.por[ator] ?? 0) + esperando } } });
  }

  private cena(alvo: string, tipo: CenaDeAssento): void {
    if (!this.ctx.ativa || this.ctx.calma) return;
    const atuais = useZoeira.getState().cenas;
    const novo = { ...atuais };
    const aqui = atuais[alvo];
    if (aqui && PESO[aqui.tipo] >= PESO[tipo]) return;
    if (!aqui && Object.keys(atuais).length >= MAX_CENAS) {
      const [mais, leve] = Object.entries(atuais).sort((a, b) => PESO[a[1].tipo] - PESO[b[1].tipo])[0]!;
      if (PESO[leve.tipo] >= PESO[tipo]) return;
      delete novo[mais];
    }
    const chave = ++this.n;
    novo[alvo] = { tipo, chave };
    useZoeira.setState({ cenas: novo });
    this.depois(DURACAO[tipo], () => {
      const c = useZoeira.getState().cenas;
      if (c[alvo]?.chave !== chave) return;
      const { [alvo]: _fim, ...resto } = c;
      useZoeira.setState({ cenas: resto });
    });
  }

  private fala(f: Fala, agora: number): void {
    if (!this.ctx.ativa) return;
    if (useZoeira.getState().palco || agora < this.faixaLivreEm || this.falas.n >= FALAS_POR_RODADA || this.ditas.has(f.id)) return;
    this.ditas.add(f.id);
    this.falas.n++;
    this.mostraFaixa(f.texto, false, DURACAO.fala, agora);
  }

  private mostraFaixa(texto: string, coro: boolean, ms: number, agora: number): void {
    const chave = ++this.n;
    this.faixaLivreEm = agora + ms + INTERVALO_DA_FAIXA_MS;
    useZoeira.setState({ faixa: { chave, texto, coro } });
    this.depois(ms, () => {
      if (useZoeira.getState().faixa?.chave === chave) useZoeira.setState({ faixa: null });
    });
  }

  private mostraPalco(p: { fregues: string; dono: string }): void {
    if (!this.ctx.ativa || this.ctx.calma) return;
    const chave = ++this.n;
    // O meio da mesa é de uma coisa só: com o cartão, a faixa sai.
    useZoeira.setState({ palco: { chave, fregues: p.fregues, dono: p.dono }, faixa: null });
    this.depois(DURACAO.fregues, () => {
      if (useZoeira.getState().palco?.chave === chave) useZoeira.setState({ palco: null });
    });
  }
}
