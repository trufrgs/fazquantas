import { Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Card } from '../components/cards/Card';
import { ConfirmNewGame } from '../components/setup/ConfirmNewGame';
import { ApelidoGuardado } from '../components/setup/ApelidoGuardado';
import { ProfileEditor } from '../components/setup/ProfileEditor';
import { Avatar } from '../components/ui/Avatar';
import { Logo } from '../components/ui/Logo';
import { Button, IconButton } from '../components/ui/Button';
import { Sheet } from '../components/ui/Sheet';
import { resumeLocalGame, startLocalGame } from '../lib/game-actions';
import { hasSavedGame, savedGameSummary } from '../lib/local-connection';
import { useUiScale } from '../lib/ui-scale';
import { multiplayer } from '../lib/platform';
import { useApp } from '../stores/app';
import { untilLabel, useTuasSalas } from '../components/setup/TuasSalas';
import { savedSession, useOnline } from '../stores/online';
import { useSettings } from '../stores/settings';

const FAN = ['O7', 'E7', 'P1', 'E1'] as const;

export function Home() {
  const s = useUiScale();
  const go = useApp((s) => s.go);
  const { name, avatar } = useSettings();
  /** Pedindo o apelido antes de seguir; `obrigatorio`: jogar online (ninguém senta sem nome). */
  const [ask, setAsk] = useState<null | { then: () => void; obrigatorio: boolean }>(null);
  const [confirmNew, setConfirmNew] = useState(false);
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

  const withName =
    (then: () => void, obrigatorio = false) =>
    () => {
      if (name.trim()) then();
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
        className="flex items-center justify-between px-4"
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
        <IconButton label="Ajustes" onClick={() => go('settings')}>
          <Settings size={21} />
        </IconButton>
      </header>

      <main
        tabIndex={-1}
        className="sem-barra flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4"
      >
        {/* Centraliza quando cabe e rola quando não cabe; tela deitada e baixa (celular deitado, notebook): duas colunas. */}
        <div className="m-auto flex w-full flex-col items-center gap-6 [@media(orientation:landscape)_and_(max-height:900px)]:flex-row [@media(orientation:landscape)_and_(max-height:900px)]:justify-center [@media(orientation:landscape)_and_(max-height:900px)]:gap-12">
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center text-center">
              <motion.h1
                className="m-0"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                <Logo size="clamp(3.1rem, min(17vw, 14vh), 6rem)" />
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

            <div className="relative h-36 w-64" aria-hidden="true">
              {FAN.map((id, i) => {
                const off = i - (FAN.length - 1) / 2;
                return (
                  <motion.div
                    key={id}
                    className="absolute bottom-0 left-1/2 origin-bottom drop-shadow-[0_10px_14px_rgb(0_0_0/0.5)]"
                    style={{ marginLeft: -40 * s }}
                    initial={{ rotate: 0, x: 0, y: 30, opacity: 0 }}
                    animate={{ rotate: off * 11, x: off * 34 * s, y: Math.abs(off) * 5 * s, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 140,
                      damping: 14,
                      delay: 0.25 + i * 0.07,
                    }}
                  >
                    <Card id={id} width={80 * s} />
                  </motion.div>
                );
              })}
            </div>
          </div>

          <nav className="flex w-full max-w-xs flex-col gap-3" aria-label="Menu principal">
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
        className="flex items-center justify-center gap-6 text-sm font-semibold text-papel/75"
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
          <Button variant="ouro" size="lg" className="mt-4 w-full" disabled={!name.trim()} onClick={seguir}>
            {name.trim() ? 'Pronto' : 'Escreve teu apelido pra jogar online'}
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
