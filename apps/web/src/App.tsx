import { useEffect, useState } from 'react';
import { fullDeck } from '@fodinha/engine';
import { preloadCards } from './components/cards/Card';
import { CardSprite } from './components/cards/sprite';
import { GameScreen } from './components/table/GameScreen';
import { isNative, multiplayer } from './lib/platform';
import { preloadSounds, setSoundEnabled } from './lib/sound';
import { useApp } from './stores/app';
import { savedSession, useOnline } from './stores/online';
import { useSettings } from './stores/settings';
import { Credits } from './screens/Credits';
import { Gallery } from './screens/Gallery';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { NewGame } from './screens/NewGame';
import { Online } from './screens/Online';
import { Ranking } from './screens/Ranking';
import { Rules } from './screens/Rules';
import { Settings } from './screens/Settings';

/** Código de sala vindo de um link de convite (`?sala=ABCD`). */
function inviteCode(): string | undefined {
  const code = new URLSearchParams(window.location.search).get('sala');
  if (code && !multiplayer) window.history.replaceState(null, '', window.location.pathname);
  return code && multiplayer ? code.toUpperCase() : undefined;
}

export function App() {
  const screen = useApp((s) => s.screen);
  const sound = useSettings((s) => s.sound);
  // O código do convite vale uma vez só (depois de usado, não entra de novo sozinho).
  const [code, setCode] = useState(inviteCode);

  useEffect(() => setSoundEnabled(sound), [sound]);

  // Imagens das cartas no cache antes da primeira distribuição.
  useEffect(() => {
    const t = window.setTimeout(() => preloadCards(fullDeck().map((c) => c.id)), 300);
    return () => window.clearTimeout(t);
  }, []);

  // Áudio só destrava depois de um gesto no mobile.
  useEffect(() => {
    const unlock = () => {
      preloadSounds();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Recarregou ou reabriu no meio de uma sala: volta sozinho para o assento (sair de propósito
  // apaga a sessão). Sala que sumiu só deixa a pessoa no início, sem erro.
  useEffect(() => {
    const session = multiplayer ? savedSession() : null;
    if (!session || code) return;
    void useOnline
      .getState()
      .join(session.code)
      .then((ok) => {
        if (ok && useApp.getState().screen === 'home') useApp.getState().reset('lobby');
        else if (!ok) useOnline.getState().clearError();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Link de convite: vai direto para a tela online com o código.
  useEffect(() => {
    if (code) {
      useApp.getState().reset('online');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [code]);

  // Botão voltar do Android.
  useEffect(() => {
    if (!isNative) return undefined;
    let remove: (() => void) | undefined;
    void import('@capacitor/app').then(({ App: CapApp }) =>
      CapApp.addListener('backButton', () => {
        const app = useApp.getState();
        if (app.screen === 'home') void CapApp.exitApp();
        // Mesa e sala tratam o voltar (fechar camada, menu, confirmar saída da sala).
        else if (app.screen === 'game' || app.screen === 'lobby') window.dispatchEvent(new Event('fodinha:voltar'));
        else app.back();
      }).then((h) => (remove = () => void h.remove())),
    );
    void import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide());
    return () => remove?.();
  }, []);

  // Cenas de desenvolvimento: `?cena=empardou`, `?cena=mesa8`…
  useEffect(() => {
    const scene = new URLSearchParams(window.location.search).get('cena');
    if (!import.meta.env.DEV || !scene) return;
    void import('./dev/scenes').then(({ sceneConnection }) => {
      const conn = sceneConnection(scene);
      if (!conn) return;
      void import('./stores/game').then(({ useGame }) => {
        useGame.getState().attach(conn);
        useApp.getState().reset('game');
      });
    });
  }, []);

  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('galeria')) {
    return (
      <>
        <CardSprite />
        <Gallery />
      </>
    );
  }

  return (
    <>
      <CardSprite />
      {screen === 'home' && <Home />}
      {screen === 'setup' && <NewGame />}
      {screen === 'online' && <Online initialCode={code} onCodeUsed={() => setCode(undefined)} />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'game' && <GameScreen />}
      {screen === 'rules' && <Rules />}
      {screen === 'settings' && <Settings />}
      {screen === 'credits' && <Credits />}
      {screen === 'ranking' && <Ranking />}
    </>
  );
}
