import { describe, expect, it } from 'vitest';
import { CARD_RATIO } from '../cards/Card';
import {
  BID_PANEL,
  cantadasTop,
  cardSizes,
  compactBidPanel,
  isCompact,
  rectAround,
  SEAT_BOX,
  tableGeometry,
  tableRevealLayout,
  trickStacking,
  type Rect,
} from './layout';

const SCREENS = [
  // Área da mesa (entre a barra de cima e a mão) em telas reais.
  { name: 'celular pequeno em pé', w: 360, h: 430, vw: 360, vh: 640 },
  { name: 'celular pequeno em pé (740)', w: 360, h: 514, vw: 360, vh: 740 },
  { name: 'celular em pé', w: 390, h: 560, vw: 390, vh: 844 },
  { name: 'celular em pé (medido)', w: 390, h: 608, vw: 390, vh: 844 },
  { name: 'celular grande em pé', w: 412, h: 673, vw: 412, vh: 915 },
  { name: 'celular deitado', w: 844, h: 190, vw: 844, vh: 390 },
  { name: 'tablet', w: 768, h: 700, vw: 768, vh: 1024 },
  { name: 'desktop', w: 1180, h: 640, vw: 1440, vh: 900 },
];

describe('tableGeometry', () => {
  for (const screen of SCREENS) {
    for (let n = 2; n <= 8; n++) {
      it(`${screen.name}, ${n} jogadores: assentos não se sobrepõem e ficam na tela`, () => {
        const order = Array.from({ length: n }, (_, i) => `p${i}`);
        const box = SEAT_BOX[isCompact(n, screen.vw, screen.vh) ? 'compact' : 'normal'];
        const g = tableGeometry(screen.w, screen.h, order, 'p0', 48, box);
        const SEAT_W = box.w;
        const SEAT_H = box.h;
        const seats = order.slice(1).map((id) => g.seats.get(id)!);
        for (const s of seats) {
          expect(s.x - SEAT_W / 2).toBeGreaterThanOrEqual(0);
          expect(s.x + SEAT_W / 2).toBeLessThanOrEqual(screen.w);
          expect(s.y).toBeGreaterThanOrEqual(0);
          expect(s.y).toBeLessThanOrEqual(screen.h);
        }
        for (let i = 0; i < seats.length; i++) {
          for (let j = i + 1; j < seats.length; j++) {
            const a = seats[i]!;
            const b = seats[j]!;
            const apart = Math.abs(a.x - b.x) >= SEAT_W || Math.abs(a.y - b.y) >= SEAT_H;
            expect(apart, `p${i + 1} × p${j + 1}: ${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(true);
          }
        }
      });
    }
  }

  it('põe o próximo a jogar à direita e segue pelo topo até a esquerda', () => {
    const g = tableGeometry(390, 560, ['eu', 'a', 'b', 'c'], 'eu', 48);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => g.seats.get(id)!);
    expect(a!.x).toBeGreaterThan(195);
    expect(b!.y).toBeLessThan(a!.y);
    expect(c!.x).toBeLessThan(195);
  });

  describe('painel de palpite', () => {
    // Área da mesa medida no navegador (entre a barra de cima e a tua faixa).
    const PHONES = [
      { name: 'celular em pé', w: 390, h: 608, vw: 390, vh: 844 },
      { name: 'celular grande em pé', w: 412, h: 673, vw: 412, vh: 915 },
    ];
    for (const phone of PHONES) {
      for (let n = 2; n <= 8; n++) {
        it(`${phone.name}, ${n} jogadores: nenhum assento fica atrás do painel`, () => {
          const order = Array.from({ length: n }, (_, i) => `p${i}`);
          const box = SEAT_BOX[isCompact(n, phone.vw, phone.vh) ? 'compact' : 'normal'];
          const g = tableGeometry(phone.w, phone.h, order, 'p0', 48, box);
          for (const id of order.slice(1)) {
            const seat = g.seats.get(id)!;
            expect(seat.y + box.h / 2, id).toBeLessThanOrEqual(phone.h - BID_PANEL.band);
          }
        });
      }
    }

    it('em tela larga o painel não chega nos lados e as colunas usam a altura toda', () => {
      const order = Array.from({ length: 8 }, (_, i) => `p${i}`);
      const g = tableGeometry(768, 700, order, 'p0', 48, SEAT_BOX.compact);
      const lowest = Math.max(...order.slice(1).map((id) => g.seats.get(id)!.y));
      expect(lowest).toBeGreaterThan(700 - BID_PANEL.band);
    });
  });

  it('gira a mesa para quem está vendo ficar embaixo', () => {
    const g = tableGeometry(390, 560, ['a', 'b', 'eu', 'c'], 'eu', 48);
    expect(g.seats.get('eu')!.y).toBeGreaterThan(560);
    expect(g.seats.get('c')!.x).toBeGreaterThan(195); // depois de mim vem o "c"
  });
});

describe('cartas à mostra e cartas da vaza', () => {
  // Área da mesa medida no navegador, tela inteira e escala da interface de cada aparelho.
  const TABLES = [
    // `roomy`: há espaço para a carta não encostar em nada do assento (nem no nome).
    { name: 'celular em pé', w: 390, h: 608, vw: 390, vh: 844, s: 1, compactPanel: false, roomy: true },
    { name: 'celular pequeno', w: 360, h: 414, vw: 360, vh: 640, s: 1, compactPanel: false, roomy: false },
    { name: 'celular deitado', w: 844, h: 183, vw: 844, vh: 390, s: 1, compactPanel: true, roomy: false },
    { name: 'celular pequeno deitado', w: 667, h: 168, vw: 667, vh: 375, s: 1, compactPanel: true, roomy: false },
    { name: 'tablet em pé', w: 768, h: 640, vw: 768, vh: 1024, s: 1.4, compactPanel: false, roomy: true },
    { name: 'desktop', w: 1436, h: 485, vw: 1436, vh: 809, s: 1.26, compactPanel: false, roomy: true },
  ];
  // Encostar (até 2 px) não conta.
  const overlap = (a: Rect, b: Rect) => a.l < b.r - 2 && b.l < a.r - 2 && a.t < b.b - 2 && b.t < a.b - 2;

  for (const t of TABLES) {
    for (let n = 2; n <= 8; n++) {
      const order = Array.from({ length: n }, (_, i) => `p${i}`);
      const others = order.slice(1);
      const box = SEAT_BOX[isCompact(n, t.vw / t.s, t.vh / t.s) ? 'compact' : 'normal'];
      const { trick } = cardSizes(t.vw, t.vh, n, t.s);
      const g = tableGeometry(t.w, t.h, order, 'p0', trick, box, t.s);

      it(`${t.name}, ${n} jogadores: carta na testa de todos à vista, sem cobrir ninguém`, () => {
        const compactPanel = compactBidPanel(g, 'p0', t.s, 47 * t.s);
        if (t.compactPanel) expect(compactPanel).toBe(true);
        const r = tableRevealLayout(g, others, { scale: t.s, trickCard: trick, compactPanel, mySeatH: 47 * t.s });
        const cards = others.map((id) => rectAround(r.spots.get(id)!, r.cardWidth, r.cardWidth * CARD_RATIO));
        const seats = others.map((id) => rectAround(g.seats.get(id)!, g.seatBox.w, g.seatBox.h));
        const box = g.seatBox;
        const faces = others.map((id) => {
          const p = g.seats.get(id)!;
          return { l: p.x - box.w * 0.35, t: p.y - box.h / 2, r: p.x + box.w * 0.35, b: p.y + box.h * 0.06 };
        });
        expect(r.cardWidth).toBeGreaterThanOrEqual(30 * t.s);
        cards.forEach((c, i) => {
          expect(c.l, `p${i + 1} fora da mesa`).toBeGreaterThanOrEqual(0);
          expect(c.r).toBeLessThanOrEqual(t.w);
          expect(c.t).toBeGreaterThanOrEqual(0);
          expect(c.b).toBeLessThanOrEqual(t.h);
          faces.forEach((face, j) => expect(overlap(c, face), `carta de p${i + 1} × rosto de p${j + 1}`).toBe(false));
          if (t.roomy) seats.forEach((seat, j) => expect(overlap(c, seat), `carta de p${i + 1} × assento de p${j + 1}`).toBe(false));
          cards.forEach((other, j) => j > i && expect(overlap(c, other), `cartas de p${i + 1} e p${j + 1}`).toBe(false));
          // Nunca acima do próprio assento (encostaria na barra de cima).
          expect(r.spots.get(others[i]!)!.y).toBeGreaterThanOrEqual(g.seats.get(others[i]!)!.y - 1);
        });
      });

      it(`${t.name}, ${n} jogadores: na vaza, o número de cada carta fica à mostra`, () => {
        const spots = order.map((id) => g.tricks.get(id)!);
        const w = trick;
        const h = trick * CARD_RATIO;
        const rank = trickStacking(spots);
        spots.forEach((a, i) => {
          const corner = { l: a.x - w / 2, t: a.y - h / 2, r: a.x - w / 2 + w * 0.26, b: a.y - h / 2 + h * 0.2 };
          spots.forEach((b, j) => {
            if (i === j || rank[j]! < rank[i]!) return; // só quem vai por cima pode cobrir
            const card = rectAround(b, w, h);
            expect(overlap(corner, card), `número de p${i} coberto por p${j}`).toBe(false);
          });
          expect(a.y - h / 2).toBeGreaterThanOrEqual(-1);
          expect(a.y + h / 2).toBeLessThanOrEqual(t.h + 1);
        });
      });
    }
  }

  it('no celular em pé, com até 6 jogadores, as cartas na testa passam de 60 px', () => {
    for (let n = 2; n <= 6; n++) {
      const order = Array.from({ length: n }, (_, i) => `p${i}`);
      const box = SEAT_BOX[isCompact(n, 390, 844) ? 'compact' : 'normal'];
      const { trick } = cardSizes(390, 844, n, 1);
      const g = tableGeometry(390, 608, order, 'p0', trick, box, 1);
      const r = tableRevealLayout(g, order.slice(1), { scale: 1, trickCard: trick, compactPanel: false, mySeatH: 47 });
      expect(r.cardWidth, `${n} jogadores`).toBeGreaterThanOrEqual(60);
    }
  });

  it('no desktop as cartas crescem com a escala da interface', () => {
    const phone = cardSizes(390, 844, 4, 1);
    const desk = cardSizes(1436, 809, 4, 1.26);
    expect(desk.hand).toBeGreaterThan(phone.hand * 1.4);
    expect(desk.trick).toBeGreaterThan(phone.trick * 1.6);
  });
});

describe('mesa de três e a faixa das cantadas', () => {
  it('três na mesa: um de cada lado, no alto (um triângulo contigo embaixo)', () => {
    for (const t of SCREENS.filter((x) => x.h >= 400)) {
      const g = tableGeometry(t.w, t.h, ['p0', 'p1', 'p2'], 'p0', 48, SEAT_BOX.normal);
      const [direita, esquerda] = [g.seats.get('p1')!, g.seats.get('p2')!];
      expect(direita.x).toBeGreaterThan(t.w * 0.7);
      expect(esquerda.x).toBeLessThan(t.w * 0.3);
      expect(direita.y).toBe(esquerda.y);
      expect(direita.y).toBeGreaterThan(62);
    }
  });

  it('as cantadas ficam no espaço livre embaixo dos assentos quando cabem; na mesa cheia, no terço de cima', () => {
    const tres = tableGeometry(390, 608, ['p0', 'p1', 'p2'], 'p0', 48, SEAT_BOX.normal);
    const topo = cantadasTop(tres, null, 3);
    const baixoDosAssentos = Math.max(...[...tres.seats.values()].filter((p) => p.y < tres.height).map((p) => p.y + tres.seatBox.h / 2));
    expect(topo).not.toBeNull();
    expect(topo!).toBeGreaterThan(baixoDosAssentos);
    const oito = Array.from({ length: 8 }, (_, i) => `p${i}`);
    expect(cantadasTop(tableGeometry(360, 430, oito, 'p0', 40, SEAT_BOX.compact), null, 8)).toBeNull();
  });
});
