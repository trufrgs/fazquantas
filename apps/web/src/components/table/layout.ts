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
  /** Tamanho do assento já na escala da interface. */
  seatBox: SeatBox;
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
 * Painel "Quantas tu faz?": largura máxima, margem lateral e quanto ele avança sobre a mesa no pior
 * caso de mesa cheia (duas fileiras de números e o aviso do pé; a base dele fica sobre a tua faixa).
 * Em tela estreita ele cobre as colunas dos lados, então os assentos laterais param acima dessa
 * faixa sempre que couber — a mesa não muda de lugar entre o palpite e as mãos.
 */
export const BID_PANEL = { maxWidth: 448, margin: 12, band: 170 } as const;
/** Altura que a dica da primeira vez (ex.: "Carta na testa…") soma ao painel de palpite. */
export const BID_TIP_H = 104;

/**
 * Distribui `m` oponentes em vagas: coluna direita (de baixo para cima), fileira de cima (da
 * direita para a esquerda) e coluna esquerda (de cima para baixo) — o sentido do jogo. A divisão
 * segue o espaço disponível e garante que vizinhos não se sobreponham.
 */
function slots(
  m: number,
  L: number,
  R: number,
  T: number,
  B: number,
  box: SeatBox,
): Point[] | null {
  if (m <= 0) return [];
  if (m === 1) return [{ x: (L + R) / 2, y: T }];
  if (m === 2) {
    // Três na mesa: um de cada lado, no alto (um triângulo contigo embaixo). Lado a lado na fileira
    // de cima, os balões e as cartas na testa se trombavam e o meio da mesa ficava vazio (29/09/2026).
    const y = Math.max(T + box.h * 0.6, T + (B - T) * 0.3);
    if (y <= B && R - L >= 3 * box.w) return [{ x: R, y }, { x: L, y }];
  }
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
  // Sem colunas, a fileira fica em células centralizadas (mais bonito); se elas não cabem, vai de
  // ponta a ponta, que é o que `topCap` conta.
  const cells = k === 0 && t > 1 && (xMax - xMin) / t >= box.w;
  for (let i = 0; i < t; i++) {
    const x = t === 1 ? (L + R) / 2 : xMax - (i * (xMax - xMin)) / (t - 1);
    out.push({ x: cells ? xMin + ((xMax - xMin) * (t - 1 - i + 0.5)) / t : x, y: T });
  }
  // Coluna esquerda, de cima para baixo.
  for (let j = k - 1; j >= 0; j--) out.push({ x: L, y: sideY(j) });
  return out;
}

/**
 * @param order ids na ordem de jogo; `youId` vai para baixo e os outros seguem a partir dele.
 * @param trickCard largura da carta da vaza (px) — o monte do centro é dimensionado por ela.
 * @param box assento na escala 1; `scale` (escala da interface) aumenta assento e margens juntos.
 */
export function tableGeometry(
  width: number,
  height: number,
  order: readonly string[],
  youId: string | null,
  trickCard = 56,
  baseBox: SeatBox = SEAT_BOX.normal,
  scale = 1,
): TableGeometry {
  const start = youId ? Math.max(0, order.indexOf(youId)) : 0;
  const rotated = order.map((_, i) => order[(start + i) % order.length]!);
  const others = rotated.slice(1);
  const box = { w: baseBox.w * scale, h: baseBox.h * scale };

  const L = box.w / 2 + 4 * scale;
  const R = Math.max(L + 1, width - box.w / 2 - 4 * scale);
  const T = 62 * scale;
  const B = Math.max(T + 1, Math.min(height - 46 * scale, T + (height - T) * 0.78));
  const panelW = Math.min(width - 2 * BID_PANEL.margin * scale, BID_PANEL.maxWidth * scale);
  const panelOverSides = (width - panelW) / 2 < box.w + 4 * scale;
  const limit = panelOverSides ? height - BID_PANEL.band * scale - box.h / 2 - 12 * scale : null;
  // Se nem assim couber, pelo menos acima da barra de uma linha (o painel vira barra: `compactBidPanel`).
  const barLimit = panelOverSides ? height - 52 * scale - box.h / 2 - 6 * scale : null;
  const places = placeSeats(others.length, L, R, T, B, box, limit, barLimit);

  // O monte da vaza fica no meio da faixa livre entre os assentos do topo e a sua mão.
  const seatBottom = T + 50 * scale;
  const center = { x: width / 2, y: (seatBottom + height) / 2 };

  const seats = new Map<string, Point>();
  others.forEach((id, i) => seats.set(id, places[i] ?? { x: width / 2, y: T }));
  const me = rotated[0];
  if (me) seats.set(me, { x: center.x, y: height + 40 * scale });
  const seatRects = others.map((id) => rectAround(seats.get(id)!, box.w, box.h));
  const tricks = trickSpots(
    rotated,
    seats,
    center,
    trickCard,
    trickCard * CARD_RATIO,
    seatRects,
    width,
    height,
  );
  return { width, height, center, seats, tricks, deck: { x: center.x, y: center.y }, seatBox: box };
}

/**
 * Onde cada um larga a carta da vaza: na linha entre o centro e o próprio assento. Se couber, as
 * cartas não se tocam; em mesa cheia elas se encavalam, mas o canto com o número fica sempre à
 * mostra (quem está mais embaixo, ou à direita na mesma altura, vai por cima — ver
 * `trickStacking`). Carta nenhuma passa por cima de assento nem sai da mesa.
 */
function trickSpots(
  ids: readonly string[],
  seats: ReadonlyMap<string, Point>,
  center: Point,
  w: number,
  h: number,
  seatRects: readonly Rect[],
  width: number,
  height: number,
): Map<string, Point> {
  const place = (t: number) =>
    new Map(
      ids.map((id) => {
        const s = seats.get(id) ?? center;
        return [
          id,
          { x: center.x + (s.x - center.x) * t, y: center.y + (s.y - center.y) * t },
        ] as const;
      }),
    );
  const fits = (p: Point) => {
    const r = rectAround(p, w, h);
    return (
      r.l >= 0 &&
      r.r <= width &&
      r.t >= 0 &&
      r.b <= height &&
      !seatRects.some((o) => overlaps(r, o))
    );
  };
  const clear = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) >= w + 4 || Math.abs(a.y - b.y) >= h + 4;
  const cornerShows = (a: Point, b: Point) =>
    Math.abs(a.y - b.y) >= h * 0.28 || Math.abs(a.x - b.x) >= w * 0.36;
  const all = (pts: Point[], ok: (a: Point, b: Point) => boolean) =>
    pts.every((a, i) => pts.every((b, j) => j <= i || ok(a, b)));

  const tries: { t: number; spots: Map<string, Point>; pts: Point[] }[] = [];
  for (let t = 0.18; t <= 0.8; t += 0.02) {
    const spots = place(t);
    const pts = [...spots.values()];
    if (!pts.every(fits)) break;
    tries.push({ t, spots, pts });
  }
  if (tries.length === 0) return trickRow(ids, seats, center, w, h, seatRects, width, height);
  return (
    tries.find((c) => c.t <= 0.56 && all(c.pts, clear)) ??
    tries.find((c) => all(c.pts, cornerShows)) ??
    tries[tries.length - 1]!
  ).spots;
}

/**
 * O painel de palpite vira a barra de uma linha em mesa baixa (celular deitado) e quando o painel
 * normal cobriria o rosto de alguém (mesa pequena e cheia). `mySeatH` é a altura da tua faixa,
 * por cima da qual o painel desce.
 */
export function compactBidPanel(
  g: TableGeometry,
  youId: string | null,
  scale: number,
  mySeatH: number,
  /** Altura a mais dentro do painel (a dica da primeira vez). */
  extra = 0,
): boolean {
  if (g.height < 330 * scale) return true;
  const panelW = Math.min(g.width - 2 * BID_PANEL.margin * scale, BID_PANEL.maxWidth * scale);
  const panelTop = g.height - ((142 + extra) * scale - mySeatH);
  const box = g.seatBox;
  return [...g.seats.entries()].some(
    ([id, p]) =>
      id !== youId &&
      Math.abs(p.x - g.width / 2) < panelW / 2 + box.w / 2 &&
      p.y + box.h * 0.3 > panelTop,
  );
}

/**
 * Cartas à mostra na mesa de verdade: `revealLayout` evitando o painel de palpite (que desce por
 * cima da tua faixa, de altura `mySeatH`; em mesa baixa é a barra de uma linha) e o chip da vira,
 * no canto de baixo à esquerda (só na regra com vira).
 */
export function tableRevealLayout(
  g: TableGeometry,
  ids: readonly string[],
  o: { scale: number; trickCard: number; compactPanel: boolean; mySeatH: number; fan?: number; chip?: boolean },
): RevealLayout {
  const s = o.scale;
  const panelW = Math.min(
    g.width - 2 * BID_PANEL.margin * s,
    o.compactPanel ? Infinity : BID_PANEL.maxWidth * s,
  );
  // Barra de uma linha (larga) ou de duas linhas curtas (estreita), como no BidPanel.
  const barH = g.width >= 600 * s ? 64 : 90;
  const panelH = (o.compactPanel ? barH : 142) * s - o.mySeatH;
  const obstacles: Rect[] = [
    { l: (g.width - panelW) / 2, t: g.height - panelH, r: (g.width + panelW) / 2, b: g.height },
  ];
  const chip = rectAround({ x: 92 * s, y: g.height - 30 * s }, 160 * s, 44 * s);
  return revealLayout(g, ids, {
    maxWidth: Math.min(100 * s, o.trickCard * 1.6),
    minWidth: 30 * s,
    fan: o.fan,
    obstacles,
    // O chip só existe na regra com vira (a vira muda a cada rodada); com manilhas fixas, não.
    softObstacles: o.chip === false ? [] : [chip],
  });
}

/**
 * Mesa baixa demais para espalhar (celular deitado): cada carta numa fileira só, logo abaixo do
 * assento do dono, e a tua no lugar livre mais perto do meio.
 */
function trickRow(
  ids: readonly string[],
  seats: ReadonlyMap<string, Point>,
  center: Point,
  w: number,
  h: number,
  seatRects: readonly Rect[],
  width: number,
  height: number,
): Map<string, Point> {
  const seatsBottom = Math.max(0, ...seatRects.map((r) => r.b));
  const y = Math.max(h / 2 + 2, Math.min(height - h / 2 - 2, (seatsBottom + height) / 2));
  const spots = new Map<string, Point>();
  for (const id of ids) {
    const s = seats.get(id);
    if (s && s.y <= height) spots.set(id, { x: s.x, y }); // a tua fica para o fim
  }
  const taken = [...spots.values()].map((p) => p.x);
  const freeAt = (x: number) =>
    x >= w / 2 && x <= width - w / 2 && taken.every((o) => Math.abs(o - x) >= w + 6);
  const step = w / 2 + 4;
  let mine: Point = { x: center.x, y: y + h * 0.34 }; // último recurso: um pouco abaixo, por cima
  for (let k = 0; k < 40; k++) {
    const x = center.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step;
    if (freeAt(x)) {
      mine = { x, y };
      break;
    }
  }
  for (const id of ids) if (!spots.has(id)) spots.set(id, mine);
  return spots;
}

/** Ordem de empilhar as cartas da vaza: mais embaixo por cima; na mesma altura, a da direita. */
export function trickStacking(spots: readonly Point[]): number[] {
  const order = spots.map((p, i) => ({ p, i })).sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
  const rank = new Array<number>(spots.length);
  order.forEach(({ i }, k) => (rank[i] = k));
  return rank;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Tamanho das cartas (px) pela tela (`vw`×`vh`), pela gente na mesa e pela escala da interface:
 * a da mão e a da vaza.
 */
export function cardSizes(
  vw: number,
  vh: number,
  players: number,
  scale: number,
): { hand: number; trick: number } {
  return {
    hand: clamp(Math.min(vw * 0.19, vh * 0.14), 56, 108 * scale),
    trick: clamp(
      Math.min(vw * 0.14, vh * 0.12) * (players >= 7 ? 0.84 : players >= 5 ? 0.92 : 1),
      38,
      96 * scale,
    ),
  };
}

/** Retângulo por bordas (px da mesa). */
export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export function rectAround(c: Point, w: number, h: number): Rect {
  return { l: c.x - w / 2, t: c.y - h / 2, r: c.x + w / 2, b: c.y + h / 2 };
}

function overlaps(a: Rect, b: Rect, slack = 0): boolean {
  return a.l < b.r - slack && b.l < a.r - slack && a.t < b.b - slack && b.t < a.b - slack;
}

export interface RevealLayout {
  /** Largura de cada carta (px); com mais de uma carta por pessoa, é a largura do leque. */
  cardWidth: number;
  /** Centro das cartas de cada jogador. */
  spots: Map<string, Point>;
}

/**
 * Cartas à mostra dos outros — a da testa, na rodada às cegas, ou a mão toda, para quem saiu e
 * assiste: na frente de cada assento, viradas para o centro, do maior tamanho que não cobre
 * assento, outra carta, a borda da mesa nem os `obstacles` (painel de palpite, chip das manilhas).
 * Nunca ficam acima do assento, onde encostariam na barra de cima.
 *
 * @param fan largura do bloco de cada jogador em cartas (1 = uma carta; leque = mais largo).
 */
export function revealLayout(
  g: TableGeometry,
  ids: readonly string[],
  opts: {
    maxWidth: number;
    minWidth: number;
    fan?: number;
    obstacles?: readonly Rect[];
    /** Evitados quando dá; no aperto, a carta pode cobrir (ex.: o chip das manilhas). */
    softObstacles?: readonly Rect[];
    gap?: number;
  },
): RevealLayout {
  const box = g.seatBox;
  const gap = opts.gap ?? 6;
  const seatRects = [...g.seats.values()].map((p) => rectAround(p, box.w, box.h));
  // Aperto (mesa minúscula para tanta gente): a carta pode cobrir nome e palitos, nunca o rosto.
  const faceRects = [...g.seats.values()].map((p) => ({
    l: p.x - box.w * 0.35,
    t: p.y - box.h / 2,
    r: p.x + box.w * 0.35,
    b: p.y + box.h * 0.06,
  }));
  const place = (w: number, uniform: boolean, tight = false) => {
    const h = w * CARD_RATIO;
    const fw = w * (opts.fan ?? 1);
    const spots = new Map<string, Point>();
    const rects: Rect[] = [];
    let ok = true;
    const g2 = tight ? Math.min(gap, 3) : gap;
    const at = (seat: Point, ux: number, uy: number) => {
      const needX = (tight ? box.w * 0.35 : box.w / 2) + fw / 2 + g2;
      const needY = (tight ? box.h * 0.06 : box.h / 2) + h / 2 + g2;
      const d = Math.min(
        ux ? needX / Math.abs(ux) : Infinity,
        uy ? needY / Math.abs(uy) : Infinity,
      );
      return { x: seat.x + ux * d, y: seat.y + uy * d };
    };
    const free = (rect: Rect) =>
      rect.l >= 0 &&
      rect.r <= g.width &&
      rect.t >= 0 &&
      rect.b <= g.height &&
      !(tight ? faceRects : seatRects).some((o) => overlaps(rect, o)) &&
      !rects.some((o) => overlaps(rect, o, -4)) && // uma folga entre cartas (a inclinação come um pouco)
      !(opts.obstacles ?? []).some((o) => overlaps(rect, o)) &&
      (tight || !(opts.softObstacles ?? []).some((o) => overlaps(rect, o)));
    // Direções candidatas para cada assento: de frente para o centro, ao lado (para dentro),
    // embaixo, à esquerda e à direita.
    const candidates = (seat: Point) => {
      let ux = g.center.x - seat.x;
      let uy = g.center.y - seat.y;
      const len = Math.hypot(ux, uy) || 1;
      ux /= len;
      uy /= len;
      // Quase na horizontal ou na vertical: alinha com o assento (fica mais arrumado).
      if (Math.abs(uy) < 0.3) [ux, uy] = [Math.sign(ux) || 1, 0];
      else if (Math.abs(ux) < 0.3) [ux, uy] = [0, Math.sign(uy) || 1];
      if (uy < 0) uy = 0; // nunca para cima do assento (encostaria na barra de cima)
      const inward = Math.sign(g.center.x - seat.x) || 1;
      return [
        at(seat, ux, uy),
        at(seat, inward, 0),
        at(seat, 0, 1),
        at(seat, -1, 0),
        at(seat, 1, 0),
      ];
    };
    const placed = ids.flatMap((id) => {
      const seat = g.seats.get(id);
      return seat ? [{ id, options: candidates(seat) }] : [];
    });
    const commit = (pick: (options: Point[]) => Point | undefined) => {
      spots.clear();
      rects.length = 0;
      for (const { id, options } of placed) {
        const c = pick(options);
        if (!c) return false;
        spots.set(id, c);
        rects.push(rectAround(c, fw, h));
      }
      return true;
    };
    const fitsHere = (c: Point | undefined) => c !== undefined && free(rectAround(c, fw, h));
    if (uniform) {
      // Todo mundo do mesmo jeito (fica mais arrumado).
      for (let mode = 0; mode < 5; mode++) {
        if (commit((options) => (fitsHere(options[mode]) ? options[mode] : undefined)))
          return { ok, spots };
      }
      return { ok: false, spots };
    }
    // Cada um onde couber.
    if (!commit((options) => options.find(fitsHere))) {
      ok = false;
      commit((options) => options[0]);
    }
    return { ok, spots };
  };
  // O maior tamanho com todos do mesmo jeito; cada um para um lado só se isso render cartas bem maiores.
  const largest = (uniform: boolean, tight: boolean) => {
    for (let w = Math.floor(opts.maxWidth); w >= opts.minWidth; w -= 2) {
      const r = place(w, uniform, tight);
      if (r.ok) return { cardWidth: w, spots: r.spots };
    }
    return null;
  };
  const best = (tight: boolean) => {
    const neat = largest(true, tight);
    const mixed = neat && neat.cardWidth >= opts.maxWidth - 1 ? null : largest(false, tight);
    if (neat && (!mixed || neat.cardWidth >= mixed.cardWidth * 0.85)) return neat;
    return mixed;
  };
  return (
    best(false) ??
    best(true) ?? { cardWidth: opts.minWidth, spots: place(opts.minWidth, false, true).spots }
  );
}

/**
 * Vagas dos oponentes com o pé das colunas laterais em `B`. Se o assento lateral mais baixo cairia
 * atrás do painel de palpite (abaixo de `limit`), sobe as colunas: primeiro até o limite, depois até
 * acima da barra de uma linha (`barLimit`), depois até o meio do caminho; se nem isso cabe, fica como
 * estava.
 */
function placeSeats(
  m: number,
  L: number,
  R: number,
  T: number,
  B: number,
  box: SeatBox,
  limit: number | null,
  barLimit: number | null = null,
): Point[] {
  const base = slots(m, L, R, T, B, box);
  const lowestSide = (places: Point[]) =>
    Math.max(-Infinity, ...places.filter((p) => p.y > T).map((p) => p.y));
  if (limit === null || limit >= B || (base && lowestSide(base) <= limit))
    return base ?? fallbackU(m, L, R, T, B);
  for (const b of [
    limit,
    ...(barLimit !== null && barLimit < B ? [barLimit] : []),
    (limit + B) / 2,
  ]) {
    const places = b > T ? slots(m, L, R, T, b, box) : null;
    if (places) return places;
  }
  return base ?? fallbackU(m, L, R, T, B);
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

/**
 * Onde a faixa "As cantadas" fica (o topo dela, em px na mesa): no espaço livre abaixo dos assentos e
 * das cartas na testa, se ela couber ali; `null` quando não cabe (mesa cheia: fica no terço de cima,
 * por cima de quem estiver ali, que é inevitável). Numa mesa de três, ela ficava em cima das cartas
 * com meia mesa vazia embaixo (29/09/2026).
 */
export function cantadasTop(
  g: TableGeometry,
  reveal: { spots: ReadonlyMap<string, Point>; cardWidth: number } | null,
  players: number,
  s = 1,
): number | null {
  const embaixo = [...g.seats.values()].filter((p) => p.y < g.height).map((p) => p.y + g.seatBox.h / 2);
  if (reveal) embaixo.push(...[...reveal.spots.values()].map((p) => p.y + (reveal.cardWidth * CARD_RATIO) / 2));
  const baixo = Math.max(0, ...embaixo);
  // Altura da faixa: título, uma linha a cada três jogadores (em tela estreita) e o recado embaixo.
  const largura = Math.min(g.width - 24 * s, 448 * s);
  const porLinha = Math.max(1, Math.floor((largura - 32 * s) / (110 * s)));
  const altura = (86 + Math.ceil(players / porLinha) * 34) * s;
  const livre = g.height - baixo;
  return livre >= altura + 8 * s ? baixo + (livre - altura) / 2 : null;
}

/** Rotação levemente "jogada" de cada carta na vaza, estável por id. */
export function tossRotation(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) % 997;
  return (h % 17) - 8;
}
