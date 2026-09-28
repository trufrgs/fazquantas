/**
 * Geometria da mesa. Você fica embaixo; os demais seguem no sentido do jogo (anti-horário):
 * o próximo a jogar fica à sua direita, depois vem o topo e por fim a esquerda.
 * Ângulos em graus na tela: 0 = direita, −90 = topo, ±180 = esquerda, 90 = embaixo.
 */
const OPPONENT_ANGLES: Readonly<Record<number, readonly number[]>> = {
  1: [-90],
  2: [-32, -148],
  3: [-4, -90, -176],
  4: [6, -54, -126, -186],
  5: [12, -38, -90, -142, -192],
  6: [16, -24, -64, -116, -156, -196],
  7: [20, -14, -50, -90, -130, -166, -200],
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
 */
export function tableGeometry(width: number, height: number, order: readonly string[], youId: string | null): TableGeometry {
  const start = youId ? Math.max(0, order.indexOf(youId)) : 0;
  const rotated = order.map((_, i) => order[(start + i) % order.length]!);
  const others = rotated.slice(1);
  const angles = OPPONENT_ANGLES[others.length] ?? [];

  // Topo com folga para a carta "na testa" e o chip de manilhas; base livre para o painel de palpite.
  const center = { x: width / 2, y: height * 0.5 + 10 };
  const rx = Math.min(width / 2 - 46, Math.max(width * 0.4, 0), 560);
  const ry = Math.min(height / 2 - 78, height * 0.36);
  const trx = Math.min(width * 0.17, 150, rx * 0.5);
  const tr_y = Math.min(height * 0.17, 110, ry * 0.55);

  const seats = new Map<string, Point>();
  const tricks = new Map<string, Point>();
  others.forEach((id, i) => {
    const a = rad(angles[i] ?? -90);
    seats.set(id, { x: center.x + rx * Math.cos(a), y: center.y + ry * Math.sin(a) });
    tricks.set(id, { x: center.x + trx * Math.cos(a), y: center.y + tr_y * Math.sin(a) * 0.95 });
  });
  const me = rotated[0];
  if (me) {
    seats.set(me, { x: center.x, y: height + 40 });
    tricks.set(me, { x: center.x, y: center.y + tr_y * 0.95 });
  }
  return { width, height, center, seats, tricks, deck: { x: center.x, y: center.y } };
}

/** Rotação levemente "jogada" de cada carta na vaza, estável por id. */
export function tossRotation(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) % 997;
  return (h % 17) - 8;
}
