import { describe, expect, it } from 'vitest';
import { CARD_RATIO } from '../cards/Card';
import {
  AVATAR_FAIXA,
  BID_PANEL,
  caixaDoAssento,
  cantadasTop,
  cardSizes,
  compactBidPanel,
  isCompact,
  mesaDimensionada,
  numerosAMostra,
  pilulaDeFrases,
  pisoDoAvatar,
  rectAround,
  SEAT_BOX,
  tableGeometry,
  tableRevealLayout,
  trickCardFor,
  trickStacking,
  type Rect,
} from './layout';

/** Encostar (até 1 px) não conta. */
const overlapRect = (a: Rect, b: Rect) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;

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

/** Como na GameScreen: avatar (ou rosto) e carta da mesa do tamanho do espaço que sobra. */
function mesaComo(t: { w: number; h: number; vw: number; vh: number; s?: number }, n: number, video: boolean) {
  const s = t.s ?? 1;
  const order = Array.from({ length: n }, (_, i) => `p${i}`);
  const base = cardSizes(t.vw, t.vh, n, s).trick;
  const piso = pisoDoAvatar(n, t.vw / s, t.vh / s, video);
  // O canto das frases favoritas, reservado como na GameScreen (na mesa baixa elas sobem para o alto).
  const reservas = t.h < 330 * s ? [] : [pilulaDeFrases(t.w, t.h, s)];
  const m = mesaDimensionada({ width: t.w, height: t.h, order, youId: 'p0', trickBase: base, scale: s, video, mySeatH: 47 * s, piso, reservas });
  const g = tableGeometry(t.w, t.h, order, 'p0', m.trickCard, m.box, s, reservas, true);
  return { m, g, order, base, piso };
}

describe('tableGeometry', () => {
  for (const screen of SCREENS) {
    for (let n = 2; n <= 8; n++) for (const video of [false, true]) {
      it(`${screen.name}, ${n} jogadores${video ? ', com câmera' : ''}: assentos não se sobrepõem e ficam na tela`, () => {
        const { g, order } = mesaComo(screen, n, video);
        const box = g.seatBox;
        const SEAT_W = box.w;
        const SEAT_H = box.h;
        const seats = order.slice(1).map((id) => g.seats.get(id)!);
        for (const s of seats) {
          expect(s.x - SEAT_W / 2).toBeGreaterThanOrEqual(0);
          expect(s.x + SEAT_W / 2).toBeLessThanOrEqual(screen.w);
          expect(s.y - SEAT_H / 2).toBeGreaterThanOrEqual(-1);
          expect(s.y + SEAT_H / 2).toBeLessThanOrEqual(screen.h + 1);
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
      for (let n = 2; n <= 8; n++) for (const video of [false, true]) {
        it(`${phone.name}, ${n} jogadores${video ? ', com câmera' : ''}: nenhum assento fica atrás do painel`, () => {
          const { g } = mesaComo(phone, n, video);
          // O painel inteiro (não a barra de uma linha) cabe sem cobrir ninguém.
          expect(compactBidPanel(g, 'p0', 1, 47)).toBe(false);
        });
      }
      it(`${phone.name}: com o assento de referência, os assentos ficam acima da faixa do painel`, () => {
        for (let n = 2; n <= 8; n++) {
          const order = Array.from({ length: n }, (_, i) => `p${i}`);
          const box = SEAT_BOX[isCompact(n, phone.vw, phone.vh) ? 'compact' : 'normal'];
          const g = tableGeometry(phone.w, phone.h, order, 'p0', 48, box);
          for (const id of order.slice(1)) expect(g.seats.get(id)!.y + box.h / 2, `${n}: ${id}`).toBeLessThanOrEqual(phone.h - BID_PANEL.band);
        }
      });
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
    for (let n = 2; n <= 8; n++) for (const video of [false, true]) {
      // Como na GameScreen: avatar e carta da mesa do tamanho do espaço.
      const { m, g, order } = mesaComo(t, n, video);
      const others = order.slice(1);
      const trick = m.trickCard;

      it(`${t.name}, ${n} jogadores${video ? ', com câmera' : ''}: carta na testa de todos à vista, sem cobrir ninguém`, () => {
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

      it(`${t.name}, ${n} jogadores${video ? ', com câmera' : ''}: na vaza, o número de cada carta fica à mostra`, () => {
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

  it('no celular em pé, com até 7 jogadores, as cartas na testa ficam legíveis, 56 px ou mais (com câmera também)', () => {
    for (let n = 2; n <= 7; n++) for (const video of [false, true]) {
      const { m, g, order } = mesaComo({ w: 390, h: 608, vw: 390, vh: 844 }, n, video);
      const r = tableRevealLayout(g, order.slice(1), { scale: 1, trickCard: m.trickCard, compactPanel: false, mySeatH: 47 });
      expect(r.cardWidth, `${n} jogadores${video ? ', com câmera' : ''}`).toBeGreaterThanOrEqual(56);
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

describe('carta da mesa do tamanho do espaço', () => {
  it('quando cresce, as cartas da mão ficam dentro da mesa, longe dos assentos e com o número à mostra (podem encavalar)', () => {
    for (const t of SCREENS) {
      for (let n = 2; n <= 8; n++) for (const video of [false, true]) {
        const { m, g, base } = mesaComo(t, n, video);
        const w = m.trickCard;
        const box = g.seatBox;
        expect(w).toBeGreaterThanOrEqual(base);
        expect(w).toBeLessThanOrEqual(base * 1.6 + 1);
        if (w === base) continue; // na base, a mesa é a de sempre (cheia: encavaladas, com o número à mostra)
        const h = w * CARD_RATIO;
        const cartas = [...g.tricks.values()];
        const assentos = [...g.seats.values()].filter((p) => p.y < t.h).map((p) => rectAround(p, box.w, box.h));
        for (const p of cartas) {
          const r = rectAround(p, w, h);
          expect(r.l >= 0 && r.r <= t.w && r.t >= 0 && r.b <= t.h, `${t.name}, ${n}: carta fora da mesa`).toBe(true);
          for (const a of assentos) expect(r.l < a.r && a.l < r.r && r.t < a.b && a.t < r.b, `${t.name}, ${n}: carta no assento`).toBe(false);
        }
        expect(numerosAMostra(cartas, w, h), `${t.name}, ${n}: número coberto`).toBe(true);
      }
    }
  });

  it('cresce de verdade no celular em pé com quatro, e também na mesa cheia e pequena (encavalada)', () => {
    const quatro = ['p0', 'p1', 'p2', 'p3'];
    const base = cardSizes(390, 844, 4, 1).trick;
    expect(trickCardFor(390, 608, quatro, 'p0', base, SEAT_BOX.normal)).toBeGreaterThan(base * 1.15);
    const oito = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const baseOito = cardSizes(360, 640, 8, 1).trick;
    expect(trickCardFor(360, 430, oito, 'p0', baseOito, SEAT_BOX.compact)).toBeGreaterThan(baseOito * 1.3);
  });

  it('cada carta vai para perto de quem jogou (nunca para longe), com o número de todas à mostra', () => {
    const MESAS = [
      { name: 'iPhone com entalhe', w: 402, h: 545, vw: 402, vh: 874 },
      { name: 'celular em pé', w: 390, h: 604, vw: 390, vh: 844 },
      { name: 'celular pequeno', w: 360, h: 430, vw: 360, vh: 640 },
    ];
    let andaram = 0;
    for (const t of MESAS) for (let n = 3; n <= 8; n++) for (const video of [false, true]) {
      const { m, g, order } = mesaComo(t, n, video);
      const antes = tableGeometry(t.w, t.h, order, 'p0', m.trickCard, m.box, 1, g.reservas, false);
      for (const id of order.slice(1)) {
        const dono = g.seats.get(id)!;
        const d = (p: { x: number; y: number }) => Math.hypot(p.x - dono.x, p.y - dono.y);
        expect(d(g.tricks.get(id)!), `${t.name}, ${n}: ${id}`).toBeLessThanOrEqual(d(antes.tricks.get(id)!) + 0.5);
        if (d(g.tricks.get(id)!) < d(antes.tricks.get(id)!) - 5) andaram++;
      }
      expect(numerosAMostra([...g.tricks.values()], m.trickCard, m.trickCard * CARD_RATIO), `${t.name}, ${n}`).toBe(true);
    }
    expect(andaram).toBeGreaterThan(20);
  });
});

describe('as frases favoritas no canto de baixo', () => {
  for (const t of SCREENS) {
    it(`${t.name}: a pílula das frases não cobre assento, carta da mesa nem carta na testa`, () => {
      for (let n = 2; n <= 8; n++) for (const video of [false, true]) {
        const { m, g, order } = mesaComo(t, n, video);
        const pilula = g.reservas[0];
        if (!pilula) {
          expect(t.h, `${t.name}: sem a pílula na mesa, só na mesa baixa`).toBeLessThan(330);
          continue;
        }
        const nome = `${t.name}, ${n}${video ? ', câmera' : ''}`;
        for (const id of order.slice(1)) expect(overlapRect(rectAround(g.seats.get(id)!, g.seatBox.w, g.seatBox.h), pilula), `${nome}: assento ${id}`).toBe(false);
        for (const [id, p] of g.tricks) expect(overlapRect(rectAround(p, m.trickCard, m.trickCard * CARD_RATIO), pilula), `${nome}: carta de ${id}`).toBe(false);
        const r = tableRevealLayout(g, order.slice(1), { scale: 1, trickCard: m.trickCard, compactPanel: compactBidPanel(g, 'p0', 1, 47), mySeatH: 47 });
        if (r.cabe !== false) for (const [id, p] of r.spots) expect(overlapRect(rectAround(p, r.cardWidth, r.cardWidth * CARD_RATIO), pilula), `${nome}: testa de ${id}`).toBe(false);
      }
    });
  }
});

describe('cartas na testa com quatro na mesa', () => {
  // Mesas medidas no navegador: iPhone com entalhe (mesa baixa), celular comum e celular pequeno.
  const MESAS = [
    { name: 'iPhone com entalhe', w: 395, h: 526, vw: 395, vh: 768 },
    { name: 'iPhone de 402', w: 402, h: 534, vw: 402, vh: 780 },
    { name: 'celular em pé', w: 390, h: 604, vw: 390, vh: 844 },
    { name: 'celular grande', w: 412, h: 662, vw: 412, vh: 915 },
    { name: 'celular pequeno', w: 360, h: 410, vw: 360, vh: 640 },
  ];
  for (const t of MESAS) {
    it(`${t.name}: cada carta fica com o dono (a de cima embaixo do assento, nenhuma para fora) e longe do alto`, () => {
      const { m, g, order } = mesaComo(t, 4, false);
      const others = order.slice(1);
      const r = tableRevealLayout(g, others, { scale: 1, trickCard: m.trickCard, compactPanel: compactBidPanel(g, 'p0', 1, 47), mySeatH: 47 });
      const h = r.cardWidth * CARD_RATIO;
      // p2 senta no alto: a carta dele vai embaixo do assento, não para o lado (encostava no alto da mesa).
      const alto = g.seats.get('p2')!;
      const cartaAlto = r.spots.get('p2')!;
      expect(Math.abs(cartaAlto.x - alto.x), `${t.name}: carta de quem senta no alto`).toBeLessThan(1);
      expect(cartaAlto.y).toBeGreaterThan(alto.y);
      for (const id of others) {
        const a = g.seats.get(id)!;
        const c = r.spots.get(id)!;
        expect(c.y - h / 2, `${t.name}: ${id} encostada no alto`).toBeGreaterThanOrEqual(10 - 0.5);
        // Nunca para fora da mesa (do lado da borda de quem senta na coluna).
        if (a.x < g.width / 3) expect(c.x, `${t.name}: ${id}`).toBeGreaterThanOrEqual(a.x - 0.5);
        if (a.x > (g.width * 2) / 3) expect(c.x, `${t.name}: ${id}`).toBeLessThanOrEqual(a.x + 0.5);
      }
      expect(r.cardWidth).toBeGreaterThanOrEqual(56);
    });
  }
});

describe('assento do tamanho do espaço', () => {
  const PHONE = { w: 390, h: 608, vw: 390, vh: 844 };

  it('o assento acompanha o avatar: selos dos lados, nome e palitos embaixo', () => {
    for (let a = AVATAR_FAIXA.avatar.min; a <= AVATAR_FAIXA.video.max; a += 2) {
      const box = caixaDoAssento(a);
      expect(box.w).toBeGreaterThanOrEqual(a + 24);
      expect(box.w).toBeGreaterThanOrEqual(70); // o nome precisa de largura
      expect(box.h).toBeGreaterThanOrEqual(a + 42);
    }
  });

  it('com espaço sobrando, o avatar cresce (celular em pé, quatro na mesa) e o rosto com câmera cresce mais', () => {
    const avatar = mesaComo(PHONE, 4, false).m;
    const rosto = mesaComo(PHONE, 4, true).m;
    expect(avatar.avatar).toBeGreaterThanOrEqual(64);
    expect(rosto.rosto).toBeGreaterThanOrEqual(96);
    // Quem não abriu a câmera fica no teto do avatar.
    expect(rosto.avatar).toBeLessThanOrEqual(AVATAR_FAIXA.avatar.max);
  });

  it('nunca fica (quase) menor que o assento fixo de antes, e a carta da mesa encolhe pouco em troca', () => {
    for (const t of SCREENS) {
      for (let n = 2; n <= 8; n++) for (const video of [false, true]) {
        const { m, base, piso, order } = mesaComo(t, n, video);
        const nome = `${t.name}, ${n}${video ? ', câmera' : ''}`;
        expect(m.rosto, nome).toBeGreaterThanOrEqual(piso - 4);
        expect(m.trickCard, nome).toBeGreaterThanOrEqual(base);
        if (video) continue; // com câmera, o rosto vem antes (a carta pode ficar até 20% menor)
        const antes = trickCardFor(t.w, t.h, order, 'p0', base, SEAT_BOX[isCompact(n, t.vw, t.vh) ? 'compact' : 'normal'], 1, t.h < 330 ? [] : [pilulaDeFrases(t.w, t.h)]);
        // Até 8% menor que a maior possível; no celular deitado com a mesa cheia, cede mais para a carta
        // na testa ficar legível (59 px em vez de 39).
        expect(m.trickCard, nome).toBeGreaterThanOrEqual(antes * 0.8);
      }
    }
  });

  it('no celular em pé com a mesa cheia, o painel de palpite continua inteiro', () => {
    for (const n of [6, 7, 8]) expect(compactBidPanel(mesaComo(PHONE, n, false).g, 'p0', 1, 47), `${n}`).toBe(false);
  });
});
