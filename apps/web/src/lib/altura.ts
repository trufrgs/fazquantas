/**
 * Altura do app. No iPhone, com o jogo instalado na Tela de Início (tela cheia, barra de status
 * translúcida), o iOS desenha o app a partir do topo da tela, por baixo da barra de status, mas a
 * altura que informa para a página (`100%`, `vh`) desconta a barra: sobrava embaixo uma faixa vazia
 * do tamanho dela, na cor do fundo da página (print de 29/09/2026). Aqui a altura é medida: a da
 * janela, ou a da tela inteira quando o que falta é exatamente a barra de status. Fora do app
 * instalado no iPhone, não mexe em nada.
 */
/**
 * A altura que o app usa: a da tela inteira quando o que falta na janela é exatamente a barra de
 * status (o defeito do iOS); senão, a da janela (inclusive com o teclado aberto, que encolhe a janela).
 */
export function alturaDoApp({ tela, janela, barra }: { tela: number; janela: number; barra: number }): number {
  return barra > 0 && Math.abs(tela - janela - barra) <= 2 ? tela : janela;
}

export function startAltura(): void {
  if (typeof window === 'undefined') return;
  const instaladoNoIos = (navigator as { standalone?: boolean }).standalone === true;
  if (!instaladoNoIos) return;
  document.documentElement.classList.add('app-ios');
  const topo = document.createElement('div');
  topo.setAttribute('aria-hidden', 'true');
  topo.style.cssText = 'position:fixed;left:0;top:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
  document.documentElement.appendChild(topo);
  const aplicar = () => {
    const barra = topo.getBoundingClientRect().height;
    const retrato = window.matchMedia('(orientation: portrait)').matches;
    const tela = retrato ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const janela = Math.max(window.innerHeight, document.documentElement.clientHeight);
    document.documentElement.style.setProperty('--app-h', `${alturaDoApp({ tela, janela, barra })}px`);
  };
  aplicar();
  window.addEventListener('resize', aplicar);
  window.addEventListener('orientationchange', () => window.setTimeout(aplicar, 300));
}
