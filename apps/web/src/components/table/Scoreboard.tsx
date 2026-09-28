import type { PlayerView } from '@fodinha/engine';
import { useEffect, useRef } from 'react';
import type { SeatInfo } from '../../lib/connection';
import { Avatar } from '../ui/Avatar';
import { Matches } from '../ui/Matches';
import { Sheet } from '../ui/Sheet';

/** Visto de caneta (acertou na mosca). */
function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="ml-0.5 inline-block h-[0.7em] w-[0.7em] align-baseline"
      aria-hidden="true"
    >
      <path
        d="M2.5 8.5 6.2 12.4 13.8 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Caderneta: o placar anotado à mão, rodada a rodada. */
export function Scoreboard({
  open,
  onClose,
  view,
  seats,
}: {
  open: boolean;
  onClose: () => void;
  view: PlayerView;
  seats: SeatInfo[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) window.setTimeout(() => scroller.current?.scrollTo({ top: 1e6 }), 50);
  }, [open]);
  const players = view.players;
  const mine = (id: string) => (id === view.you ? 'bg-ouros/15' : '');
  // Mesa cheia: cabeçalho enxuto para todas as colunas caberem no celular.
  const crowded = players.length >= 6;
  return (
    <Sheet open={open} onClose={onClose} label="Caderneta">
      <h2
        className="font-display text-2xl font-bold"
        style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
      >
        Caderneta
      </h2>
      <p className="pr-10 text-sm text-tinta-2">
        Quanto cada um pediu → quanto fez.{' '}
        <span className="font-semibold text-paus">✓ na mosca</span>; em{' '}
        <span className="font-semibold text-copas">vermelho</span>, os palitos que queimou.
      </p>
      <div
        ref={scroller}
        tabIndex={0}
        aria-label="Rodadas anotadas"
        className="sem-barra mt-3 max-h-[55dvh] overflow-auto rounded-xl ring-1 ring-tinta/10"
      >
        <table className="w-full border-collapse text-center">
          <thead className="sticky top-0 z-10 bg-papel">
            <tr className="border-b border-espadas/25">
              <th
                scope="col"
                className="sticky left-0 z-[1] w-10 border-r border-copas/45 bg-papel px-1 pb-2 align-bottom text-[0.6875rem] font-semibold text-tinta-2"
              >
                cartas
              </th>
              {players.map((p) => {
                const seat = seats.find((s) => s.id === p.id);
                return (
                  <th
                    key={p.id}
                    scope="col"
                    className={`px-1 py-2 align-bottom font-normal ${mine(p.id)}`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Avatar seed={seat?.avatar ?? p.id} size={26} dim={p.eliminated} />
                      <span
                        className={`${crowded ? 'max-w-11' : 'max-w-16'} truncate text-xs font-bold ${p.eliminated ? 'line-through opacity-50' : ''}`}
                      >
                        {p.name}
                      </span>
                      {p.eliminated ? (
                        <span className="text-[0.6875rem] font-bold text-copas">fora</span>
                      ) : (
                        <span
                          className="flex items-center gap-1"
                          title={`${p.lives} ${p.lives === 1 ? 'palito' : 'palitos'}`}
                        >
                          <Matches lives={p.lives} starting={view.rules.startingLives} size={10} compact={crowded} />
                          {!crowded && view.rules.startingLives <= 6 && (
                            <span className="text-[0.6875rem] font-bold tabular-nums">
                              {p.lives}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody
            className={`font-hand leading-none ${players.length >= 7 ? 'text-lg' : players.length >= 5 ? 'text-xl' : 'text-2xl'}`}
          >
            {view.history.map((r) => (
              <tr key={r.number} className="h-9 border-b border-espadas/20">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] border-r border-copas/45 bg-papel pl-1.5 text-left text-[0.8em] font-normal text-tinta-2"
                  title={`Rodada ${r.number}`}
                >
                  {r.cards}
                </th>
                {players.map((p) => {
                  if (r.bids[p.id] === undefined) {
                    return (
                      <td key={p.id} className={`text-tinta/25 ${mine(p.id)}`}>
                        ·
                      </td>
                    );
                  }
                  const bid = r.bids[p.id]!;
                  const took = r.tricks[p.id] ?? 0;
                  const lost = (r.livesBefore[p.id] ?? 0) - (r.livesAfter[p.id] ?? 0);
                  const out = r.eliminated.includes(p.id);
                  const label = `pediu ${bid}, fez ${took}${lost > 0 ? `, queimou ${lost}` : ', na mosca'}${out ? ', saiu' : ''}`;
                  return (
                    <td
                      key={p.id}
                      className={`whitespace-nowrap px-0.5 ${lost > 0 ? 'text-copas' : 'text-tinta'} ${mine(p.id)}`}
                      aria-label={label}
                    >
                      {lost > 0 ? (
                        <>
                          {bid}
                          <span className="mx-px text-[0.75em] opacity-70">→</span>
                          {took}
                          <sup className="ml-0.5 text-[0.65em]">−{lost}</sup>
                        </>
                      ) : (
                        <>
                          {bid}
                          <span className="text-paus">
                            <Check />
                          </span>
                        </>
                      )}
                      {out && (
                        <span className="ml-1 align-middle font-sans text-[0.6875rem] font-bold text-copas">
                          saiu
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {view.history.length === 0 && (
              <tr>
                <td colSpan={players.length + 1} className="py-6 text-xl text-tinta-2">
                  Nada anotado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
