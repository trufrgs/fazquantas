import { CARD_RATIO } from '../cards/Card';

/**
 * Geometria da mesa. Você fica embaixo; os demais seguem no sentido do jogo (anti-horário): o
 * próximo a jogar fica à sua direita, depois vem o topo e por fim a esquerda. Os assentos são
 * distribuídos em vagas ao longo de um "U" (coluna direita → fileira de cima → coluna esquerda),
 * o que funciona em tela alta (celular em pé) e larga (deitado/desktop).
 */

export interface Point {
  x: number;
  y: number;
}

export interface TableGeometry {
  width: number;
  height: number;
  center: Point;
  /** Posição do assento de cada jogador (inclusive o seu, fora da mesa, embaixo). */
  seats: Map<string, Point>;
  /** Onde cada jogador larga a carta da vaza. */
  tricks: Map<string, Point>;
  /** Monte (de onde as cartas saem ao distribuir). */
  deck: Point;
}

/** Tamanho do assento (widget) na tela; compacto em mesa cheia ou tela pequena. */
export interface SeatBox {
  w: number;
  h: number;
}

export const SEAT_BOX: Readonly<Record<'normal' | 'compact', SeatBox>> = {
  normal: { w: 84, h: 92 },
  compact: { w: 72, h: 80 },
};

export function isCompact(players: number, width: number, height: number): boolean {
  return players >= 6 || width < 380 || height < 640;
}

/**
 * Distribui `m` oponentes em vagas: coluna direita (de baixo para cima), fileira de cima (da
 * direita para a esquerda) e coluna esquerda (de cima para baixo) — o sentido do jogo. A divisão
 * segue o espaço disponível e garante que vizinhos não se sobreponham.
 */
function slots(m: number, L: number, R: number, T: number, B: number, box: SeatBox): Point[] | null {
  if (m <= 0) return [];
  if (m === 1) return [{ x: (L + R) / 2, y: T }];
  const sideLen = Math.max(0, B - (T + box.h));
  const sideCap = Math.floor(sideLen / box.h) + 1;
  const topCap = (sides: boolean) => Math.floor((R - L - (sides ? 2 * box.w : 0)) / box.w) + 1;
  const topLen = Math.max(0, R - L - 2 * box.w);
  let k = Math.round((m * sideLen) / Math.max(1, 2 * sideLen + topLen));
  k = Math.max(0, Math.min(k, sideCap, Math.floor(m / 2)));
  while (m - 2 * k > topCap(k > 0) && k < Math.min(sideCap, Math.floor(m / 2))) k++;
  const t = m - 2 * k;
  if (t > topCap(k > 0)) return null;

  const out: Point[] = [];
  // Coluna direita, de baixo para cima.
  const yMin = t > 0 ? T + box.h : T + box.h * 0.35;
  const sideY = (j: number) => (k === 1 ? (yMin + B) / 2 : B - (j * (B - yMin)) / (k - 1));
  for (let j = 0; j < k; j++) out.push({ x: R, y: sideY(j) });
  // Fileira de cima, da direita para a esquerda.
  const xMin = k > 0 ? L + box.w : L;
  const xMax = k > 0 ? R - box.w : R;
  for (let i = 0; i < t; i++) {
    const x = t === 1 ? (L + R) / 2 : xMax - (i * (xMax - xMin)) / (t - 1);
    out.push({ x: k === 0 && t > 1 ? xMin + ((xMax - xMin) * (t - 1 - i + 0.5)) / t : x, y: T });
  }
  // Coluna esquerda, de cima para baixo.
  for (let j = k - 1; j >= 0; j--) out.push({ x: L, y: sideY(j) });
  return out;
}

/**
 * @param order ids na ordem de jogo; `youId` vai para baixo e os outros seguem a partir dele.
 * @param trickCard largura da carta da vaza (px) — o monte do centro é dimensionado por ela.
 */
export function tableGeometry(
  width: number,
  height: number,
  order: readonly string[],
  youId: string | null,
  trickCard = 56,
  box: SeatBox = SEAT_BOX.normal,
): TableGeometry {
  const start = youId ? Math.max(0, order.indexOf(youId)) : 0;
  const rotated = order.map((_, i) => order[(start + i) % order.length]!);
  const others = rotated.slice(1);
  const n = order.length;

  const L = box.w / 2 + 4;
  const R = Math.max(L + 1, width - box.w / 2 - 4);
  const T = 62;
  const B = Math.max(T + 1, Math.min(height - 46, T + (height - T) * 0.78));
  const places = slots(others.length, L, R, T, B, box) ?? fallbackU(others.length, L, R, T, B);

  // O monte da vaza fica no meio da faixa livre entre os assentos do topo e a sua mão;
  // em tela baixa ele achata (as cartas se espalham mais na horizontal).
  const cardH = trickCard * CARD_RATIO;
  const seatBottom = T + 50;
  const center = { x: width / 2, y: (seatBottom + height) / 2 };
  const trx = Math.min(trickCard * (0.78 + 0.07 * n), (R - L) * 0.3);
  const tr_y = Math.max(6, Math.min(cardH * (0.46 + 0.035 * n), (height - seatBottom - cardH) / 2 - 4));

  const seats = new Map<string, Point>();
  const tricks = new Map<string, Point>();
  others.forEach((id, i) => {
    const seat = places[i] ?? { x: width / 2, y: T };
    seats.set(id, seat);
    const a = Math.atan2(seat.y - center.y, seat.x - center.x);
    tricks.set(id, { x: center.x + trx * Math.cos(a), y: center.y + tr_y * Math.sin(a) });
  });
  const me = rotated[0];
  if (me) {
    seats.set(me, { x: center.x, y: height + 40 });
    tricks.set(me, { x: center.x, y: center.y + tr_y });
  }
  return { width, height, center, seats, tricks, deck: { x: center.x, y: center.y } };
}

/** Último recurso (tela minúscula para a quantidade de gente): espaça igual ao longo do "U". */
function fallbackU(m: number, L: number, R: number, T: number, B: number): Point[] {
  const side = B - T;
  const top = R - L;
  const total = 2 * side + top;
  return Array.from({ length: m }, (_, i) => {
    const d = (total * (i + 0.5)) / m;
    if (d <= side) return { x: R, y: B - d };
    if (d <= side + top) return { x: R - (d - side), y: T };
    return { x: L, y: T + (d - side - top) };
  });
}

/** Rotação levemente "jogada" de cada carta na vaza, estável por id. */
export function tossRotation(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) % 997;
  return (h % 17) - 8;
}
