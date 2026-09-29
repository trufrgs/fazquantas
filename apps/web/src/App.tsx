import { lazy, Suspense, useEffect, useState } from 'react';
import { fullDeck } from '@fodinha/engine';
import { preloadCards } from './components/cards/Card';
import { CardSprite } from './components/cards/sprite';
import { GameScreen } from './components/table/GameScreen';
import { aoAbrir } from './lib/conta';
import { destravarMusica, ligarMusica } from './lib/musica';
import { isNative, multiplayer } from './lib/platform';
import { preloadSounds, setSoundEnabled } from './lib/sound';
import { useApp } from './stores/app';
import { abaSubstituida, savedSession, useOnline } from './stores/online';
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

const Admin = lazy(() => import('./screens/Admin').then((m) => ({ default: m.Admin })));
/** `/admin`: o painel do dono do jogo (fora do app, carregado à parte). */
const isAdminPath = multiplayer && window.location.pathname.replace(/\/+$/, '') === '/admin';

/** Código de sala vindo de um link de convite (`?sala=ABCD`). */
function inviteCode(): string | undefined {
  const code = new URLSearchParams(window.location.search).get('sala');
  if (code && !multiplayer) window.history.replaceState(null, '', window.location.pathname);
  return code && multiplayer ? code.toUpperCase() : undefined;
}

export function App() {
  const screen = useApp((s) => s.screen);
  const sound = useSettings((s) => s.sound);
  const musica = useSettings((s) => s.musica);
  // O código do convite vale uma vez só (depois de usado, não entra de novo sozinho).
  const [code, setCode] = useState(inviteCode);

  useEffect(() => setSoundEnabled(sound), [sound]);
  // O tango de fundo toca só na sala (esperando) e na mesa; nos menus, não (nem no admin).
  const naSala = screen === 'lobby' || screen === 'game';
  useEffect(() => ligarMusica(musica && naSala && !isAdminPath), [musica, naSala]);

  // Imagens das cartas no cache antes da primeira distribuição.
  useEffect(() => {
    const t = window.setTimeout(() => preloadCards(fullDeck().map((c) => c.id)), 300);
    return () => window.clearTimeout(t);
  }, []);

  // Áudio só destrava depois de um gesto no mobile.
  useEffect(() => {
    const unlock = () => {
      preloadSounds();
      destravarMusica();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Abriu o jogo: conta a visita e confere o apelido guardado.
  useEffect(() => {
    if (multiplayer && !isAdminPath) void aoAbrir();
  }, []);

  // Recarregou ou reabriu no meio de uma sala: volta sozinho para o assento (sair de propósito
  // apaga a sessão). Vai direto para a sala, que mostra "Voltando pra sala…" enquanto isso; sem rede,
  // a volta segue tentando (o lugar fica guardado no servidor) até dar certo ou a pessoa desistir.
  useEffect(() => {
    const session = multiplayer ? savedSession() : null;
    // Esta aba perdeu o lugar para outro aparelho ou aba: não toma de volta sozinha ao recarregar.
    if (!session || code || isAdminPath || abaSubstituida(session.code)) return;
    useApp.getState().reset('lobby');
    void useOnline
      .getState()
      .join(session.code, { auto: true })
      .then((ok) => {
        if (ok) return; // o estado da sala (ou a mesa, no meio da partida) chega pelo socket
        // Não deu para voltar: mostra o porquê (sala acabou, lugar liberado) em vez de largar calado.
        const screen = useApp.getState().screen;
        if (useOnline.getState().error && (screen === 'lobby' || screen === 'home')) useApp.getState().reset('online');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tocou numa notificação com o jogo aberto: vai para a sala do aviso, se não estiver em nenhuma.
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!multiplayer || !sw) return undefined;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { tipo?: string; url?: string } | null;
      if (data?.tipo !== 'abrir' || !data.url) return;
      const sala = new URL(data.url, window.location.origin).searchParams.get('sala')?.toUpperCase();
      const online = useOnline.getState();
      if (!sala || online.room || online.status !== 'idle') return;
      void online.join(sala).then((ok) => {
        if (ok) useApp.getState().reset('lobby');
        else useApp.getState().reset('online');
      });
    };
    sw.addEventListener('message', onMessage);
    return () => sw.removeEventListener('message', onMessage);
  }, []);

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

  if (isAdminPath) {
    return (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    );
  }

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
