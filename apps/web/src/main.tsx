import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isNative } from './lib/platform';
import { startUiScale } from './lib/ui-scale';
import './styles/index.css';

// PWA: instala e deixa jogar contra bots offline (só no build web de produção).
if (import.meta.env.PROD && !isNative) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

startUiScale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
