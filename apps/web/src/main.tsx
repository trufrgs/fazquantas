import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isNative } from './lib/platform';
import { startAltura } from './lib/altura';
import { startInstalar } from './lib/instalar';
import { startUiScale } from './lib/ui-scale';
import './styles/index.css';

// PWA: instala e deixa jogar contra bots offline (só no build web de produção); versão nova
// entra sozinha (ver lib/atualizacao.ts).
if (import.meta.env.PROD && !isNative) {
  void Promise.all([import('virtual:pwa-register'), import('./lib/atualizacao')]).then(([{ registerSW }, { startUpdates }]) =>
    startUpdates(registerSW),
  );
}

// Build desta aba, à vista para diagnóstico (e para o teste de atualização).
document.documentElement.dataset.build = __BUILD_ID__;

startAltura();
startUiScale();
// O pedido de instalação do navegador pode chegar logo no começo: guarda para o botão dos ajustes.
startInstalar();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
