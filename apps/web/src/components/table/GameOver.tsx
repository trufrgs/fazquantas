import type { PlayerView } from '@fodinha/engine';
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
}

async function celebrate() {
  const { default: confetti } = await import('canvas-confetti');
  const colors = ['#e3a82b', '#c4372d', '#2e5c9c', '#3d7a3a', '#f7efde'];
  confetti({ particleCount: 140, spread: 80, origin: { y: 0.35 }, colors, disableForReducedMotion: true });
  window.setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, colors, disableForReducedMotion: true }), 250);
  window.setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, colors, disableForReducedMotion: true }), 400);
}

export function GameOver({ view, seats, onAgain, againLabel = 'Mais uma?', onExit, onLobby, waitingText }: GameOverProps) {
  const result = view.result;
  const youWon = !!result && !!view.you && result.winners.includes(view.you);
  const draw = (result?.winners.length ?? 0) > 1;

  useEffect(() => {
    if (youWon) void celebrate();
  }, [youWon]);

  if (!result) return null;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? id;
  const title = draw
    ? `Empate entre ${result.winners.map(name).join(' e ')}`
    : youWon
      ? 'Bah, tu ganhou!'
      : `${name(result.winners[0]!)} ganhou`;

  const mine = view.you
    ? view.history.filter((r) => r.bids[view.you!] !== undefined)
    : [];
  const exact = mine.filter((r) => r.bids[view.you!] === r.tricks[view.you!]).length;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-noite/70 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        role="dialog"
        aria-modal="true"
        aria-label="Fim de jogo"
      >
        <motion.div
          className="papel w-full max-w-sm rounded-[28px] p-5 shadow-2xl"
          initial={{ y: 40, scale: 0.9, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}
        >
          <p className="text-center font-hand text-2xl text-tinta-2">fim de jogo</p>
          <h2
            className="text-center font-display text-4xl font-bold leading-tight"
            style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
          >
            {title}
          </h2>
          <ol className="mt-4 flex flex-col gap-2">
            {result.ranking.map((id, i) => {
              const seat = seats.find((s) => s.id === id);
              const p = view.players.find((x) => x.id === id);
              const winner = result.winners.includes(id);
              return (
                <li
                  key={id}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${winner ? 'bg-ouros/35 ring-1 ring-ouros-escuro/40' : 'bg-tinta/5'} ${id === view.you ? 'font-bold' : ''}`}
                >
                  <span className="w-5 text-center font-display text-lg font-bold tabular-nums">{i + 1}</span>
                  <Avatar seed={seat?.avatar ?? id} size={32} />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {p?.name ?? id}

                  </span>
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
