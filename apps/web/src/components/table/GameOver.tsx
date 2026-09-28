import { seriesTable, type PlayerView, type SeriesState } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import type { SeatInfo } from '../../lib/connection';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';

export interface GameOverProps {
  view: PlayerView;
  seats: SeatInfo[];
  onAgain?: () => void;
  againLabel?: string;
  onExit: () => void;
  /** Online, anfitrião: volta a sala para o lobby. */
  onLobby?: () => void;
  waitingText?: string;
  /** Online, série "melhor de X" (a partida que acabou já está contada). */
  series?: SeriesState | null;
}

async function celebrate() {
  const { default: confetti } = await import('canvas-confetti');
  const colors = ['#e3a82b', '#c4372d', '#2e5c9c', '#3d7a3a', '#f7efde'];
  confetti({
    particleCount: 140,
    spread: 80,
    origin: { y: 0.35 },
    colors,
    disableForReducedMotion: true,
  });
  window.setTimeout(
    () =>
      confetti({
        particleCount: 90,
        angle: 60,
        spread: 60,
        origin: { x: 0, y: 0.6 },
        colors,
        disableForReducedMotion: true,
      }),
    250,
  );
  window.setTimeout(
    () =>
      confetti({
        particleCount: 90,
        angle: 120,
        spread: 60,
        origin: { x: 1, y: 0.6 },
        colors,
        disableForReducedMotion: true,
      }),
    400,
  );
}

export function GameOver({
  view,
  seats,
  onAgain,
  againLabel = 'Mais uma?',
  onExit,
  onLobby,
  waitingText,
  series,
}: GameOverProps) {
  const result = view.result;
  const youWon = !!result && !!view.you && result.winners.includes(view.you);
  const draw = (result?.winners.length ?? 0) > 1;
  const champion = series?.champion ?? null;
  const youChampion = !!champion && !!view.you && champion.includes(view.you);

  useEffect(() => {
    if (youWon || youChampion) void celebrate();
  }, [youWon, youChampion]);

  if (!result) return null;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? series?.names[id] ?? id;
  const gameTitle = draw
    ? `Empate entre ${result.winners.map(name).join(' e ')}`
    : youWon
      ? 'Bah, tu ganhou!'
      : `${name(result.winners[0]!)} ganhou`;
  const title = champion
    ? youChampion
      ? champion.length > 1
        ? 'Série dividida!'
        : 'Tu levou a série!'
      : `${champion.map(name).join(' e ')} ${champion.length > 1 ? 'dividiram' : 'levou'} a série`
    : gameTitle;
  const kicker = series
    ? champion
      ? `fim da série · melhor de ${series.bestOf}`
      : `partida ${series.games.length} · melhor de ${series.bestOf}`
    : 'fim de jogo';

  const mine = view.you ? view.history.filter((r) => r.bids[view.you!] !== undefined) : [];
  const exact = mine.filter((r) => r.bids[view.you!] === r.tricks[view.you!]).length;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex overflow-y-auto bg-noite/70 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        role="dialog"
        aria-modal="true"
        aria-label="Fim de jogo"
      >
        <motion.div
          className="papel m-auto w-full max-w-sm rounded-[1.75rem] p-5 shadow-2xl"
          initial={{ y: 40, scale: 0.9, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}
        >
          <p className="text-center font-hand text-2xl text-tinta-2">{kicker}</p>
          <h2
            className="text-center font-display text-4xl font-bold leading-tight"
            style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
          >
            {title}
          </h2>
          {series && (
            <div className="mt-4 rounded-2xl bg-tinta/5 p-3" aria-label="Placar da série">
              <p className="mb-2 flex items-baseline justify-between text-sm font-semibold text-tinta-2">
                <span>Placar da série</span>
                <span>
                  {champion ? `${series.games.length} partidas` : `leva quem fizer ${series.target}`}
                </span>
              </p>
              <ol className="flex flex-col gap-1">
                {seriesTable(series).map((row) => (
                  <li
                    key={row.id}
                    className={`flex items-center gap-2 rounded-xl px-2 py-1 ${champion?.includes(row.id) ? 'bg-ouros/35' : ''} ${row.id === view.you ? 'font-bold' : ''}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <span className="flex gap-0.5" aria-label={`${row.wins} ${row.wins === 1 ? 'vitória' : 'vitórias'}`}>
                      {Array.from({ length: Math.max(series.target, row.wins) }, (_, i) => (
                        <span
                          key={i}
                          aria-hidden="true"
                          className={`h-3 w-3 rounded-full ring-1 ring-tinta/25 ${i < row.wins ? 'bg-ouros-escuro' : 'bg-transparent'}`}
                        />
                      ))}
                    </span>
                    <span className="w-14 text-right text-sm tabular-nums text-tinta-2">{row.points} pts</span>
                  </li>
                ))}
              </ol>
              {champion && champion.some((id) => (series.wins[id] ?? 0) < series.target) && (
                <p className="mt-2 text-center text-sm text-tinta-2">
                  {champion.length > 1
                    ? 'Empate em vitórias e em pontos: o título fica dividido.'
                    : 'Ninguém chegou às vitórias que decidem: desempatou nos pontos.'}
                </p>
              )}
            </div>
          )}
          {series && (
            <p className="mt-4 text-sm font-semibold text-tinta-2">
              {champion ? 'Última partida' : 'Esta partida'}: {gameTitle.replace('Bah, tu ganhou!', 'tu ganhou')}
            </p>
          )}
          <ol className={`${series ? 'mt-2' : 'mt-4'} flex flex-col gap-2`}>
            {result.ranking.map((id, i) => {
              const seat = seats.find((s) => s.id === id);
              const p = view.players.find((x) => x.id === id);
              const winner = result.winners.includes(id);
              return (
                <li
                  key={id}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${winner ? 'bg-ouros/35 ring-1 ring-ouros-escuro/40' : 'bg-tinta/5'} ${id === view.you ? 'font-bold' : ''}`}
                >
                  <span className="w-5 text-center font-display text-lg font-bold tabular-nums">
                    {i + 1}
                  </span>
                  <Avatar seed={seat?.avatar ?? id} size={32} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{p?.name ?? id}</span>
                  <span className="text-sm text-tinta-2">
                    {winner ? '🏆' : p?.eliminatedRound ? `saiu na ${p.eliminatedRound}ª` : ''}
                  </span>
                </li>
              );
            })}
          </ol>
          {mine.length > 0 && (
            <p className="mt-3 text-center text-sm text-tinta-2">
              Tu acertou <strong className="text-tinta">{exact}</strong> de {mine.length}{' '}
              {mine.length === 1 ? 'palpite' : 'palpites'}.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {onAgain ? (
              <Button variant="ouro" size="lg" onClick={onAgain}>
                {againLabel}
              </Button>
            ) : (
              waitingText && <p className="text-center text-sm text-tinta-2">{waitingText}</p>
            )}
            {onLobby && (
              <Button variant="papel" onClick={onLobby}>
                Voltar pra sala
              </Button>
            )}
            <Button variant="papel" onClick={onExit}>
              {onLobby || waitingText ? 'Sair da sala' : 'Voltar ao início'}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
