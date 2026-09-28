import { describe, expect, it } from 'vitest';
import { isCompact, SEAT_BOX, tableGeometry } from './layout';

const SCREENS = [
  // Área da mesa (entre a barra de cima e a mão) em telas reais.
  { name: 'celular pequeno em pé', w: 360, h: 430, vw: 360, vh: 640 },
  { name: 'celular em pé', w: 390, h: 560, vw: 390, vh: 844 },
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

  it('gira a mesa para quem está vendo ficar embaixo', () => {
    const g = tableGeometry(390, 560, ['a', 'b', 'eu', 'c'], 'eu', 48);
    expect(g.seats.get('eu')!.y).toBeGreaterThan(560);
    expect(g.seats.get('c')!.x).toBeGreaterThan(195); // depois de mim vem o "c"
  });
});
