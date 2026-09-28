import { CARD_RATIO } from '../cards/Card';

/**
 * Geometria da mesa. Você fica embaixo; os demais seguem no sentido do jogo (anti-horário):
 * o próximo a jogar fica à sua direita, depois vem o topo e por fim a esquerda.
 * Ângulos em graus na tela: 0 = direita, −90 = topo, ±180 = esquerda, 90 = embaixo.
 */
const OPPONENT_ANGLES: Readonly<Record<number, readonly number[]>> = {
  1: [-90],
  2: [-35, -145],
  3: [-2, -90, -178],
  4: [10, -54, -126, -190],
  5: [16, -36, -90, -144, -196],
  6: [22, -18, -62, -118, -162, -202],
  7: [24, -10, -46, -90, -134, -170, -204],
};

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

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * @param order ids na ordem de jogo; `youId` vai para baixo e os outros seguem a partir dele.
 * @param trickCard tamanho da carta da vaza (px) — o monte do centro é dimensionado por ele.
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
  const angles = OPPONENT_ANGLES[others.length] ?? [];
  const n = order.length;

  const center = { x: width / 2, y: height * 0.5 };
  const rx = Math.max(0, Math.min(width / 2 - 46, 560));
  const ry = Math.max(0, height / 2 - 64);
  // Monte da vaza: cada carta um pouco à frente de quem jogou, sem encostar nos assentos.
  const trx = Math.min(trickCard * (0.78 + 0.07 * n), rx * 0.52);
  const tr_y = Math.min(trickCard * CARD_RATIO * (0.46 + 0.035 * n), ry * 0.5);

  const seats = new Map<string, Point>();
  const tricks = new Map<string, Point>();
  others.forEach((id, i) => {
    const a = rad(angles[i] ?? -90);
    seats.set(id, { x: center.x + rx * Math.cos(a), y: center.y + ry * Math.sin(a) });
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
