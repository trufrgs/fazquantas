import { Download, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Card } from '../components/cards/Card';
import { ConfirmNewGame } from '../components/setup/ConfirmNewGame';
import { convitePendente, InstalarAppSheet, mostraBotaoInstalar } from '../components/setup/InstalarApp';
import { ApelidoGuardado } from '../components/setup/ApelidoGuardado';
import { ProfileEditor } from '../components/setup/ProfileEditor';
import { Avatar } from '../components/ui/Avatar';
import { Logo } from '../components/ui/Logo';
import { Button, IconButton } from '../components/ui/Button';
import { Sheet } from '../components/ui/Sheet';
import { resumeLocalGame, startLocalGame } from '../lib/game-actions';
import { hasSavedGame, savedGameSummary } from '../lib/local-connection';
import { useMedia, useUiScale } from '../lib/ui-scale';
import { useSize } from '../components/table/useSize';
import { useDonoDoApelido } from '../lib/conta';
import { useComoInstalar } from '../lib/instalar';
import { multiplayer } from '../lib/platform';
import { useApp } from '../stores/app';
import { untilLabel, useTuasSalas } from '../components/setup/TuasSalas';
import { savedSession, useOnline } from '../stores/online';
import { useSettings } from '../stores/settings';

const FAN = ['O7', 'E7', 'P1', 'E1'] as const;
/** Leque de cartas no tamanho cheio (escala 1) e o menor que ainda vale mostrar. */
const FAN_H = 144;
const FAN_MIN_H = 64;

export function Home() {
  const s = useUiScale();
  const go = useApp((s) => s.go);
  const { name, avatar, claimed } = useSettings();
  /** Pedindo o apelido antes de seguir; `obrigatorio`: jogar online (ninguém senta sem nome). */
  const [ask, setAsk] = useState<null | { then: () => void; obrigatorio: boolean }>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  // No navegador, o botão dourado ao lado dos ajustes chama para instalar como app.
  const comoInstalar = useComoInstalar();
  const [instalando, setInstalando] = useState(false);
  const saved = hasSavedGame();
  const session = multiplayer ? savedSession() : null;
  const joining = useOnline((s) => s.status === 'connecting');
  // Numa sala assíncrona, a tua vez pode estar esperando: o início mostra primeiro.
  const rooms = useTuasSalas();
  const myTurn = multiplayer ? rooms?.find((r) => r.yourTurn) : undefined;
  const openRoom = async (code: string) => {
    if (await useOnline.getState().join(code)) useApp.getState().reset('lobby');
    else go('online');
  };

  // Cabe tudo na altura visível, sem rolar (barra do Safari, partida salva, "Tua vez"): o leque de
  // cartas fica com o que sobra depois do logo e dos botões, e some se não sobrar.
  const [mainRef, mainSize] = useSize<HTMLElement>();
  const [textoRef, textoSize] = useSize<HTMLDivElement>();
  const [navRef, navSize] = useSize<HTMLElement>();
  const deitado = useMedia('(orientation: landscape) and (max-height: 900px)');
  const gap = 20 * s;
  const livre =
    mainSize.height === 0
      ? FAN_H * s
      : mainSize.height - 32 * s - textoSize.height - gap - (deitado ? 0 : navSize.height + gap);
  const fanH = Math.floor(Math.min(FAN_H * s, livre));
  const showFan = fanH >= FAN_MIN_H * s;
  const cardW = fanH / 1.8;
  const k = cardW / 80;

  // Apelido guardado por outra pessoa não senta em sala: antes de jogar online, PIN ou outro apelido.
  const apelidoDeOutro = useDonoDoApelido(name) === 'outro' && !claimed;
  const withName =
    (then: () => void, obrigatorio = false) =>
    () => {
      if (name.trim() && !(obrigatorio && apelidoDeOutro)) then();
      else setAsk({ then, obrigatorio });
    };
  const seguir = () => {
    const then = ask?.then;
    setAsk(null);
    then?.();
  };

  return (
    <div className="mesa flex h-full flex-col overflow-hidden">
      <header
        className="px-seguro flex items-center justify-between"
        style={{ paddingTop: 'calc(0.75rem + var(--safe-top))' }}
      >
        <button
          type="button"
          onClick={() => go('settings')}
          className="flex items-center gap-2 rounded-full bg-noite/40 py-1 pl-1 pr-3 ring-1 ring-papel/15 backdrop-blur-sm"
          aria-label="Perfil e ajustes"
        >
          <Avatar seed={avatar} size={34} />
          <span className="max-w-40 truncate text-sm font-bold">
            {name.trim() ? `Buenas, ${name.trim()}!` : 'Buenas!'}
          </span>
        </button>
        <div className="flex items-center gap-2">
          {mostraBotaoInstalar(comoInstalar) && (
            <IconButton
              label="Instalar o jogo como app"
              onClick={() => setInstalando(true)}
              className={`bg-ouros! text-tinta! ring-ouros-escuro/60! ${!instalando && convitePendente() ? 'chamar-atencao' : ''}`}
            >
              <Download size={21} strokeWidth={2.4} />
            </IconButton>
          )}
          <IconButton label="Ajustes" onClick={() => go('settings')}>
            <Settings size={21} />
          </IconButton>
        </div>
      </header>
      <InstalarAppSheet open={instalando} onClose={() => setInstalando(false)} />

      <main
        ref={mainRef}
        tabIndex={-1}
        className="sem-barra px-seguro-6 flex min-h-0 flex-1 flex-col overflow-y-auto py-4"
      >
        {/* Centraliza quando cabe e rola quando não cabe; tela deitada e baixa (celular deitado, notebook): duas colunas. */}
        <div className="m-auto flex w-full flex-col items-center gap-5 [@media(orientation:landscape)_and_(max-height:900px)]:flex-row [@media(orientation:landscape)_and_(max-height:900px)]:justify-center [@media(orientation:landscape)_and_(max-height:900px)]:gap-12">
          <div className="flex flex-col items-center gap-5">
            <div ref={textoRef} className="flex flex-col items-center text-center">
              <motion.h1
                className="logo-inicio m-0"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                <Logo size="var(--logo)" />
              </motion.h1>
              <motion.p
                className="mt-3 max-w-72 text-balance text-lg leading-snug text-papel/85"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.5 }}
              >
                Diz quantas faz. Faz quantas disse.
              </motion.p>
            </div>

            {showFan && (
              <div className="relative" style={{ height: fanH, width: fanH * 1.78 }} aria-hidden="true">
                {FAN.map((id, i) => {
                  const off = i - (FAN.length - 1) / 2;
                  return (
                    <motion.div
                      key={id}
                      className="absolute bottom-0 left-1/2 origin-bottom drop-shadow-[0_10px_14px_rgb(0_0_0/0.5)]"
                      style={{ marginLeft: -cardW / 2 }}
                      initial={{ rotate: 0, x: 0, y: 30, opacity: 0 }}
                      animate={{ rotate: off * 11, x: off * 34 * k, y: Math.abs(off) * 5 * k, opacity: 1 }}
                      transition={{
                        type: 'spring',
                        stiffness: 140,
                        damping: 14,
                        delay: 0.25 + i * 0.07,
                      }}
                    >
                      <Card id={id} width={cardW} />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          <nav ref={navRef} className="flex w-full max-w-xs flex-col gap-3" aria-label="Menu principal">
            {myTurn && (
              <Button variant="ouro" size="lg" disabled={joining} onClick={() => void openRoom(myTurn.code)} className="flex-col !gap-0">
                <span>Tua vez na sala {myTurn.code}</span>
                {myTurn.info.turn?.deadline && myTurn.info.async ? (
                  <span className="text-xs font-semibold opacity-75">{untilLabel(myTurn.info.turn.deadline)}</span>
                ) : null}
              </Button>
            )}
            {saved && (
              <Button
                variant="ouro"
                size="lg"
                onClick={() => resumeLocalGame()}
                className="flex-col !gap-0"
              >
                <span>Continuar partida</span>
                <span className="text-xs font-semibold opacity-75">{savedGameSummary()}</span>
              </Button>
            )}
            {multiplayer && (
              <Button variant={saved || myTurn ? 'papel' : 'ouro'} size="lg" onClick={withName(() => go('online'), true)}>
                Jogar com a gurizada
              </Button>
            )}
            <Button
              variant={saved || multiplayer ? 'papel' : 'ouro'}
              size="lg"
              onClick={withName(() => (saved ? setConfirmNew(true) : startLocalGame()))}
            >
              Jogar contra bots
            </Button>
            {/* Os ajustes da partida contra bots (quantos, dificuldade, regras) ficam num link só. */}
            <button
              type="button"
              onClick={withName(() => go('setup'))}
              className="self-center text-sm font-bold text-papel/80 underline-offset-4 hover:underline"
            >
              Mudar bots e regras
            </button>
            {session && session.code !== myTurn?.code && (
              <Button variant="vidro" disabled={joining} onClick={() => void openRoom(session.code)}>
                Voltar pra sala {session.code}
              </Button>
            )}
          </nav>
        </div>
      </main>

      <footer
        className="px-seguro flex items-center justify-center gap-6 text-sm font-semibold text-papel/75"
        style={{ paddingBottom: 'calc(1rem + var(--safe-bottom))' }}
      >
        <button
          type="button"
          onClick={() => go('rules')}
          className="underline-offset-4 hover:underline"
        >
          Como jogar
        </button>
        {multiplayer && (
          <button
            type="button"
            onClick={() => go('ranking')}
            className="underline-offset-4 hover:underline"
          >
            Ranking
          </button>
        )}
        <button
          type="button"
          onClick={() => go('credits')}
          className="underline-offset-4 hover:underline"
        >
          Créditos
        </button>
      </footer>

      <ConfirmNewGame
        open={confirmNew}
        onCancel={() => setConfirmNew(false)}
        onConfirm={() => {
          setConfirmNew(false);
          startLocalGame();
        }}
      />

      <Sheet open={ask !== null} onClose={() => setAsk(null)} label="Teu apelido">
        <ProfileEditor />
        {multiplayer && (
          <div className="mt-3">
            <ApelidoGuardado compact />
          </div>
        )}
        {ask?.obrigatorio ? (
          <Button variant="ouro" size="lg" className="mt-4 w-full" disabled={!name.trim() || apelidoDeOutro} onClick={seguir}>
            {!name.trim() ? 'Escreve teu apelido pra jogar online' : apelidoDeOutro ? 'Entra com o PIN ou troca o apelido' : 'Pronto'}
          </Button>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={seguir}>Pular</Button>
            <Button variant="ouro" onClick={seguir}>
              Pronto
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
