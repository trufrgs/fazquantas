import { card, isManilha, type Play, type PlayerView, type StrengthCtx } from '@fodinha/engine';

/**
 * O que a noite deixou (3ª leva do caderno de zoeira, 04/10/2026): os troféus que ninguém quer
 * ganhar, o Jornal do Bolicho para mandar no grupo, as datas em que a mesa muda sozinha e os lances
 * raros. Conta pura; quem junta os números da partida é a agenda (`Contas`).
 */

/** O que a agenda conta de cada um durante a partida (o resto sai do histórico). */
export interface Contas {
  /** Cartas dos outros que ele matou. */
  mortes: Record<string, number>;
  /** Mãos em que a carta dele empardou. */
  empates: Record<string, number>;
  /** Frases que mandou. */
  frases: Record<string, number>;
  /** Bitucas: palheiros que a mesa fumou esperando por ele. */
  espera: Record<string, number>;
}

export const CONTAS_VAZIAS: Contas = { mortes: {}, empates: {}, frases: {}, espera: {} };

export interface Trofeu {
  id: 'vidente' | 'cagao' | 'guloso' | 'acougueiro' | 'cumadre' | 'tartaruga' | 'matraca' | 'fenix';
  titulo: string;
  quem: string;
  detalhe: string;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Quem tem o maior número (empate: ninguém leva, para o troféu não sair dividido). */
function campeao(contagem: Record<string, number>, minimo: number): [string, number] | null {
  const ordem = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  const [primeiro, segundo] = ordem;
  if (!primeiro || primeiro[1] < minimo || (segundo && segundo[1] === primeiro[1])) return null;
  return primeiro;
}

/** As contas do histórico: zeros cantados, mãos além da conta, acertos e rodadas no último palito. */
function doHistorico(view: PlayerView) {
  const zeros: Record<string, number> = {};
  const alem: Record<string, number> = {};
  const acertos: Record<string, number> = {};
  const noFio: Record<string, number> = {};
  for (const r of view.history) {
    for (const [id, cantou] of Object.entries(r.bids)) {
      const fez = r.tricks[id] ?? 0;
      if (cantou === 0) zeros[id] = (zeros[id] ?? 0) + 1;
      if (fez > cantou) alem[id] = (alem[id] ?? 0) + (fez - cantou);
      if (fez === cantou) acertos[id] = (acertos[id] ?? 0) + 1;
      if ((r.livesBefore[id] ?? 0) === 1) noFio[id] = (noFio[id] ?? 0) + 1;
    }
  }
  return { zeros, alem, acertos, noFio };
}

/**
 * Os troféus da noite: no máximo quatro, cada um com uma pessoa diferente sempre que dá (o mesmo
 * não leva tudo), na ordem em que a turma mais ri. A fênix (ganhou depois de passar três rodadas no
 * último palito) vem primeiro quando acontece: é o único que dá orgulho, junto com o vidente.
 */
export function trofeusDaNoite(view: PlayerView, contas: Contas): Trofeu[] {
  const nome = (id: string) => view.players.find((p) => p.id === id)?.name ?? '';
  const h = doHistorico(view);
  const vencedor = view.result?.winners.length === 1 ? view.result.winners[0] : undefined;
  const candidatos: (Trofeu | null)[] = [];
  if (vencedor && (h.noFio[vencedor] ?? 0) >= 3) {
    candidatos.push({ id: 'fenix', titulo: 'Fênix do bolicho', quem: vencedor, detalhe: `ganhou depois de ${h.noFio[vencedor]} rodadas no último palito` });
  }
  const regras: [Trofeu['id'], string, Record<string, number>, number, (n: number) => string][] = [
    ['cagao', 'Cagão da noite', h.zeros, 2, (n) => `${plural(n, 'zero cantado', 'zeros cantados')}`],
    ['guloso', 'Guloso', h.alem, 2, (n) => `${plural(n, 'mão', 'mãos')} além da conta`],
    ['acougueiro', 'Açougueiro', contas.mortes, 3, (n) => `matou ${plural(n, 'carta', 'cartas')}`],
    ['tartaruga', 'Tartaruga', contas.espera, 2, (n) => `${plural(n, 'bituca', 'bitucas')} de espera`],
    ['cumadre', 'Cumadre', contas.empates, 2, (n) => `empardou ${plural(n, 'vez', 'vezes')}`],
    ['matraca', 'Matraca', contas.frases, 5, (n) => `${plural(n, 'frase', 'frases')} na mesa`],
    ['vidente', 'Vidente', h.acertos, 3, (n) => `acertou ${plural(n, 'palpite', 'palpites')}`],
  ];
  for (const [id, titulo, contagem, minimo, detalhe] of regras) {
    const c = campeao(contagem, minimo);
    candidatos.push(c ? { id, titulo, quem: c[0], detalhe: detalhe(c[1]) } : null);
  }
  const escolhidos: Trofeu[] = [];
  const usados = new Set<string>();
  for (const t of candidatos) {
    if (!t || usados.has(t.quem) || !nome(t.quem) || escolhidos.length >= 4) continue;
    escolhidos.push(t);
    usados.add(t.quem);
  }
  return escolhidos;
}

/** A primeira página do Jornal do Bolicho: manchete, nota e classificados, tirados da partida. */
export interface Jornal {
  manchete: string;
  nota: string | null;
  classificados: string[];
  data: string;
}

export function jornalDaNoite(view: PlayerView, contas: Contas, agora = new Date()): Jornal | null {
  const result = view.result;
  if (!result) return null;
  const nome = (id: string) => view.players.find((p) => p.id === id)?.name ?? '';
  const [vencedor] = result.winners;
  const primeiroFora = [...view.players].filter((p) => p.eliminatedRound !== null).sort((a, b) => (a.eliminatedRound ?? 0) - (b.eliminatedRound ?? 0))[0];
  const trofeus = trofeusDaNoite(view, contas);
  const cagao = trofeus.find((t) => t.id === 'cagao');
  const acougueiro = trofeus.find((t) => t.id === 'acougueiro');
  const tartaruga = trofeus.find((t) => t.id === 'tartaruga');
  const manchete = vencedor ? `${nome(vencedor).toLocaleUpperCase('pt-BR')} É ${result.winners.length > 1 ? 'DONO' : 'PATRÃO'} DA NOITE` : 'MESA EMPATA E NINGUÉM PAGA';
  const nota = primeiroFora ? `${primeiroFora.name} sai na ${primeiroFora.eliminatedRound}ª rodada e culpa o baralho.` : null;
  const classificados: string[] = [];
  if (acougueiro) classificados.push(`Afia-se faca. Tratar com ${nome(acougueiro.quem)}, que ${acougueiro.detalhe}.`);
  if (cagao) classificados.push(`Procura-se coragem. Recompensa a quem devolver a de ${nome(cagao.quem)}.`);
  if (tartaruga) classificados.push(`Vende-se relógio pouco usado. Falar com ${nome(tartaruga.quem)}.`);
  if (classificados.length === 0 && primeiroFora) classificados.push(`Procura-se a sorte de ${primeiroFora.name}. Sumiu cedo.`);
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return { manchete, nota, classificados: classificados.slice(0, 2), data };
}

/** A data em que a mesa muda sozinha (horário de Brasília). */
export type DataEspecial = 'farroupilha' | 'churrasco' | 'sexta13' | 'madrugada' | null;

export function dataEspecial(agora = new Date()): DataEspecial {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(agora)
    .reduce<Record<string, string>>((m, p) => ((m[p.type] = p.value), m), {});
  const mes = Number(partes.month);
  const dia = Number(partes.day);
  const hora = Number(partes.hour);
  if (mes === 9 && dia >= 13 && dia <= 20) return 'farroupilha';
  if (mes === 4 && dia === 24) return 'churrasco';
  if (partes.weekday === 'Fri' && dia === 13) return 'sexta13';
  if (hora >= 3 && hora < 6) return 'madrugada';
  return null;
}

/** As quatro manilhas na mesma mão. */
export function quatroManilhas(plays: readonly Play[], ctx: StrengthCtx): boolean {
  return plays.filter((p) => isManilha(card(p.cardId), ctx)).length >= 4;
}
