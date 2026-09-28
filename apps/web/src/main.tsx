import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isNative } from './lib/platform';
import { startUiScale } from './lib/ui-scale';
import './styles/index.css';

// PWA: instala e deixa jogar contra bots offline (só no build web de produção); versão nova
// entra sozinha (ver lib/atualizacao.ts).
if (import.meta.env.PROD && !isNative) {
  void Promise.all([import('virtual:pwa-register'), import('./lib/atualizacao')]).then(([{ registerSW }, { startUpdates }]) =>
    startUpdates(registerSW),
  );
}

startUiScale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
