import { CARD_RATIO } from '../cards/Card';

/**
 * Geometria da mesa. Você fica embaixo; os demais seguem no sentido do jogo (anti-horário): o
 * próximo a jogar fica à sua direita, depois vem o topo e por fim a esquerda. Os assentos são
 * distribuídos com espaçamento igual ao longo de um "U" (lado direito → topo → lado esquerdo,
 * com cantos arredondados), o que funciona em tela alta (celular em pé) e larga (deitado/desktop).
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

/** Ponto a uma distância `d` ao longo do "U" (começa embaixo à direita). */
function alongU(d: number, L: number, R: number, T: number, B: number, r: number): Point {
  const side = B - (T + r);
  const arc = (Math.PI / 2) * r;
  const top = R - L - 2 * r;
  let t = d;
  if (t <= side) return { x: R, y: B - t };
  t -= side;
  if (t <= arc) {
    const a = t / r; // 0 → π/2
    return { x: R - r + r * Math.cos(a), y: T + r - r * Math.sin(a) };
  }
  t -= arc;
  if (t <= top) return { x: R - r - t, y: T };
  t -= top;
  if (t <= arc) {
    const a = t / r;
    return { x: L + r - r * Math.sin(a), y: T + r - r * Math.cos(a) };
  }
  t -= arc;
  return { x: L, y: T + r + Math.min(t, side) };
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
): TableGeometry {
  const start = youId ? Math.max(0, order.indexOf(youId)) : 0;
  const rotated = order.map((_, i) => order[(start + i) % order.length]!);
  const others = rotated.slice(1);
  const n = order.length;

  const L = 46;
  const R = Math.max(L + 1, width - 46);
  const T = 62;
  const B = Math.max(T + 1, Math.min(height - 46, T + (height - T) * 0.72));
  const r = Math.max(0, Math.min(90, (R - L) / 4, (B - T) / 2));
  const side = B - (T + r);
  const total = 2 * side + 2 * (Math.PI / 2) * r + (R - L - 2 * r);

  // O monte da vaza fica no meio da faixa livre entre os assentos do topo e a sua mão;
  // em tela baixa ele achata (as cartas se espalham mais na horizontal).
  const cardH = trickCard * CARD_RATIO;
  const seatBottom = T + 50;
  const center = { x: width / 2, y: (seatBottom + height) / 2 };
  const trx = Math.min(trickCard * (0.78 + 0.07 * n), (R - L) * 0.3);
  const tr_y = Math.max(
    6,
    Math.min(cardH * (0.46 + 0.035 * n), (height - seatBottom - cardH) / 2 - 4),
  );

  const seats = new Map<string, Point>();
  const tricks = new Map<string, Point>();
  others.forEach((id, i) => {
    const seat = others.length === 1 ? { x: width / 2, y: T } : alongU((total * (i + 0.5)) / others.length, L, R, T, B, r);
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

/** Rotação levemente "jogada" de cada carta na vaza, estável por id. */
export function tossRotation(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) % 997;
  return (h % 17) - 8;
}
