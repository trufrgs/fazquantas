import { describe, expect, it } from 'vitest';
import { alturaDoApp } from './altura';

// iPhone 16 Pro: 874 pt de tela, 62 pt de barra de status (com a ilha dinâmica).
describe('altura do app instalado no iPhone', () => {
  it('a janela vem sem a barra de status (o defeito do iOS): usa a tela inteira', () => {
    expect(alturaDoApp({ tela: 874, janela: 812, barra: 62 })).toBe(874);
    expect(alturaDoApp({ tela: 874, janela: 811, barra: 62 })).toBe(874);
  });

  it('a janela já vem inteira (iOS sem o defeito): fica como está', () => {
    expect(alturaDoApp({ tela: 874, janela: 874, barra: 62 })).toBe(874);
  });

  it('teclado aberto encolhe a janela: segue a janela, para o campo não ficar embaixo do teclado', () => {
    expect(alturaDoApp({ tela: 874, janela: 520, barra: 62 })).toBe(520);
  });

  it('sem barra de status (celular deitado): segue a janela', () => {
    expect(alturaDoApp({ tela: 402, janela: 402, barra: 0 })).toBe(402);
    expect(alturaDoApp({ tela: 402, janela: 380, barra: 0 })).toBe(380);
  });
});
