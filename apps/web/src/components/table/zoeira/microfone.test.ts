import { describe, expect, it, vi } from 'vitest';

// O módulo da conversa (WebRTC) não importa aqui: os detectores são conta pura.
vi.mock('../../../lib/midia', () => ({ midia: { aoVolume: () => () => undefined } }));

const { DetectorDeGargalhada, DetectorDeSopro, GARGALHADA, SOPRO } = await import('./microfone');

/** Medidas a cada 120 ms (o ritmo do medidor da conversa). */
const PASSO = 120;

describe('o microfone na mesa (só volume)', () => {
  it('sopro: três medidas bem acima do fundo; a TV alta ligada não conta', () => {
    const d = new DetectorDeSopro();
    let t = 0;
    for (let i = 0; i < 40; i++) expect(d.medir(0.02, true, (t += PASSO))).toBe(false);
    expect(d.medir(0.3, true, (t += PASSO))).toBe(false);
    expect(d.medir(0.3, true, (t += PASSO))).toBe(false);
    expect(d.medir(0.3, true, (t += PASSO))).toBe(true);
    // Descanso: soprando de novo logo em seguida, não repete.
    for (let i = 0; i < 3; i++) expect(d.medir(0.3, true, (t += PASSO))).toBe(false);
    // Microfone fechado não sopra.
    const fechado = new DetectorDeSopro();
    for (let i = 0; i < 10; i++) expect(fechado.medir(0.5, false, i * PASSO)).toBe(false);
    // Barulho alto e constante (a TV): vira o fundo, e o mesmo volume não é salto.
    const tv = new DetectorDeSopro();
    let n = 0;
    for (let i = 0; i < 200; i++) n += tv.medir(0.2 + (i % 2) * 0.02, true, i * PASSO) ? 1 : 0;
    expect(n).toBe(0);
    expect(SOPRO.medidas).toBe(3);
  });

  it('gargalhada: dois saltando juntos logo depois da mão; um sozinho não basta', () => {
    const d = new DetectorDeGargalhada();
    let t = 0;
    for (let i = 0; i < 30; i++) for (const id of ['a', 'b', 'c']) d.medir(id, 0.02, true, (t += 40));
    d.abrir(t);
    let riu = false;
    for (let i = 0; i < GARGALHADA.medidas; i++) {
      riu = d.medir('a', 0.2, true, (t += 40)) || riu;
      riu = d.medir('b', 0.18, true, (t += 40)) || riu;
    }
    expect(riu).toBe(true);
    // Uma vez por mão.
    expect(d.medir('c', 0.3, true, t + 40)).toBe(false);

    const so = new DetectorDeGargalhada();
    for (let i = 0; i < 30; i++) for (const id of ['a', 'b']) so.medir(id, 0.02, true, i * 40);
    so.abrir(2000);
    let sozinho = false;
    for (let i = 0; i < 20; i++) sozinho = so.medir('a', 0.4, true, 2000 + i * 40) || sozinho;
    expect(sozinho).toBe(false);
    // Quem acabou de abrir o microfone (sem fundo conhecido) não conta para a gargalhada.
    const novo = new DetectorDeGargalhada();
    novo.abrir(0);
    let comNovos = false;
    for (let i = 0; i < 10; i++) for (const id of ['a', 'b']) comNovos = novo.medir(id, 0.5, true, i * 40) || comNovos;
    expect(comNovos).toBe(false);
  });

  it('gargalhada: fundo alto (bar de verdade) não dispara; fora da janela também não', () => {
    const d = new DetectorDeGargalhada();
    let t = 0;
    for (let i = 0; i < 60; i++) for (const id of ['a', 'b']) d.medir(id, 0.12, true, (t += 60));
    d.abrir(t);
    let riu = false;
    for (let i = 0; i < 10; i++) for (const id of ['a', 'b']) riu = d.medir(id, 0.14, true, (t += 60)) || riu;
    expect(riu).toBe(false);
    // A janela fechou: o mesmo salto depois dela não conta.
    const tarde = new DetectorDeGargalhada();
    tarde.abrir(0);
    let depois = false;
    for (let i = 0; i < 10; i++) for (const id of ['a', 'b']) depois = tarde.medir(id, 0.5, true, GARGALHADA.janelaMs + 100 + i * 40) || depois;
    expect(depois).toBe(false);
  });
});
