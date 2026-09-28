/**
 * Simulação de rodadas por nível de força (1–14). Na Fodinha o naipe só importa pela força,
 * então cartas de mesma força são intercambiáveis — isso deixa rollouts de Monte Carlo baratos.
 */
import type { PenaltyMode, TieRule } from '../rules';

/** Níveis de força possíveis (com desempate por naipe chegam a 14 × 4 + 3). */
export const LEVELS = 60;

export interface SeatPlay {
  seat: number;
  s: number;
}

/** Assento vencedor da vaza (ou `null` se ninguém leva). Sem alocação: n ≤ 8. */
export function trickWinner(plays: readonly SeatPlay[], tieRule: TieRule): number | null {
  const n = plays.length;
  if (n === 0) return null;
  if (tieRule === 'nobody' || tieRule === 'suit') {
    let best = plays[0]!;
    let tied = false;
    for (let i = 1; i < n; i++) {
      const p = plays[i]!;
      if (p.s > best.s) {
        best = p;
        tied = false;
      } else if (p.s === best.s) tied = true;
    }
    return tied ? null : best.seat;
  }
  let winner: SeatPlay | null = null;
  for (let i = 0; i < n; i++) {
    const p = plays[i]!;
    if (winner && p.s <= winner.s) continue;
    let unique = true;
    for (let j = 0; j < n; j++) {
      if (j !== i && plays[j]!.s === p.s) {
        unique = false;
        break;
      }
    }
    if (unique) winner = p;
  }
  return winner ? winner.seat : null;
}

export interface Opponent {
  handCount: number;
  /** Vazas que ainda quer (aposta − feitas). */
  need: number;
}

export interface PolicyInput {
  /** Forças da minha mão, em ordem crescente. */
  hand: readonly number[];
  plays: readonly SeatPlay[];
  me: number;
  /** Quem ainda joga nesta vaza depois de mim. */
  after: readonly Opponent[];
  need: number;
  /** Quantidade de cartas desconhecidas (para mim) por nível de força. */
  unknown: ArrayLike<number>;
  unknownTotal: number;
  tieRule: TieRule;
}

/** Chance aproximada de uma carta de força `s` segurar a vaza contra quem joga depois. */
export function holdProbability(s: number, inp: PolicyInput): number {
  let beat = 0;
  for (let x = s + 1; x < LEVELS; x++) beat += inp.unknown[x] ?? 0;
  if (inp.tieRule !== 'suit') beat += inp.unknown[s] ?? 0;
  const q = inp.unknownTotal > 0 ? Math.min(1, beat / inp.unknownTotal) : 0;
  let hold = 1;
  for (const a of inp.after) {
    const h = Math.max(1, a.handCount);
    // Quem quer vaza cobre se puder; quem não quer só cobre se for obrigado.
    const pBeat = a.need > 0 ? 1 - (1 - q) ** h : q ** h;
    hold *= 1 - pBeat;
  }
  return hold;
}

function winsWith(plays: readonly SeatPlay[], me: number, s: number, tieRule: TieRule): boolean {
  return trickWinner([...plays, { seat: me, s }], tieRule) === me;
}

/** Política "média": índice da carta a jogar na mão ordenada. */
export function choosePlayIndex(inp: PolicyInput): number {
  const { hand, plays, me, need, tieRule } = inp;
  const n = hand.length;
  if (n <= 1) return 0;
  const leading = plays.length === 0;

  if (need > 0) {
    if (leading) {
      if (need >= n) return n - 1;
      for (let i = 0; i < n; i++) if (holdProbability(hand[i]!, inp) >= 0.6) return i;
      return 0;
    }
    const winning: number[] = [];
    for (let i = 0; i < n; i++) if (winsWith(plays, me, hand[i]!, tieRule)) winning.push(i);
    if (winning.length === 0) return 0;
    if (inp.after.length === 0) return winning[0]!;
    if (need >= n) return winning[winning.length - 1]!;
    for (const i of winning) if (holdProbability(hand[i]!, inp) >= 0.5) return i;
    return need >= n - 1 ? winning[winning.length - 1]! : 0;
  }

  if (leading) return 0;
  for (let i = n - 1; i >= 0; i--) if (!winsWith(plays, me, hand[i]!, tieRule)) return i;
  return 0;
}

export function penaltyFor(bid: number, won: number, mode: PenaltyMode): number {
  const diff = Math.abs(bid - won);
  return mode === 'difference' ? diff : diff > 0 ? 1 : 0;
}

/** Custo de um resultado para o bot: vidas perdidas, com aversão extra a ser eliminado. */
export function lossFor(bid: number, won: number, lives: number, mode: PenaltyMode): number {
  const loss = penaltyFor(bid, won, mode);
  return loss + (loss > 0 && loss >= lives ? 2.5 : 0);
}

export interface RolloutSeat {
  /** Forças em ordem crescente (mutável). */
  hand: number[];
  bid: number;
  won: number;
}

export interface Rollout {
  seats: RolloutSeat[];
  /** Assento que puxou a vaza em andamento. */
  leader: number;
  /** Jogadas já feitas na vaza em andamento. */
  plays: SeatPlay[];
  tieRule: TieRule;
  /** Composição do baralho por nível de força. */
  totals: ArrayLike<number>;
  /** Cartas públicas (jogadas + vira) por nível de força (mutável). */
  seen: Uint8Array;
}

function removeAt(hand: number[], i: number): number {
  const s = hand[i]!;
  hand.splice(i, 1);
  return s;
}

/** Completa a rodada com todos jogando a política média; `forced` fixa a próxima jogada. */
export function simulate(r: Rollout, forced?: SeatPlay): void {
  const n = r.seats.length;
  const unknown = new Int16Array(LEVELS);
  let pendingForced = forced;
  for (;;) {
    while (r.plays.length < n) {
      const seat = (r.leader + r.plays.length) % n;
      const me = r.seats[seat]!;
      if (me.hand.length === 0) return;
      let s: number;
      if (pendingForced && pendingForced.seat === seat) {
        const idx = me.hand.indexOf(pendingForced.s);
        s = removeAt(me.hand, idx >= 0 ? idx : 0);
        pendingForced = undefined;
      } else {
        let total = 0;
        for (let x = 0; x < LEVELS; x++) unknown[x] = (r.totals[x] ?? 0) - r.seen[x]!;
        for (const h of me.hand) unknown[h]! -= 1;
        for (let x = 0; x < LEVELS; x++) total += unknown[x]!;
        const after: Opponent[] = [];
        for (let k = r.plays.length + 1; k < n; k++) {
          const o = r.seats[(r.leader + k) % n]!;
          after.push({ handCount: o.hand.length, need: o.bid - o.won });
        }
        const idx = choosePlayIndex({
          hand: me.hand,
          plays: r.plays,
          me: seat,
          after,
          need: me.bid - me.won,
          unknown,
          unknownTotal: total,
          tieRule: r.tieRule,
        });
        s = removeAt(me.hand, idx);
      }
      r.plays.push({ seat, s });
      r.seen[s]! += 1;
    }
    const winner = trickWinner(r.plays, r.tieRule);
    if (winner !== null) r.seats[winner]!.won += 1;
    r.leader = winner ?? r.leader;
    r.plays = [];
    if (r.seats.every((x) => x.hand.length === 0)) return;
  }
}
