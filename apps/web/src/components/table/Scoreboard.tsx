import type { PlayerView } from '@fodinha/engine';
import { useEffect, useRef } from 'react';
import type { SeatInfo } from '../../lib/connection';
import { Avatar } from '../ui/Avatar';
import { Matches } from '../ui/Matches';
import { Sheet } from '../ui/Sheet';

/** Caderneta: o placar anotado à mão, rodada a rodada. */
export function Scoreboard({ open, onClose, view, seats }: { open: boolean; onClose: () => void; view: PlayerView; seats: SeatInfo[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) window.setTimeout(() => scroller.current?.scrollTo({ top: 1e6 }), 50);
  }, [open]);
  const players = view.players;
  return (
    <Sheet open={open} onClose={onClose} label="Caderneta">
      <h2 className="font-display text-2xl font-bold" style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
        Caderneta
      </h2>
      <p className="text-sm text-tinta-2">Palpite / vazas feitas em cada rodada.</p>
      <div
        ref={scroller}
        tabIndex={0}
        aria-label="Rodadas anotadas"
        className="sem-barra mt-3 max-h-[55dvh] overflow-auto rounded-xl ring-1 ring-tinta/10"
        style={{
          backgroundImage:
            'linear-gradient(90deg, transparent 38px, rgb(196 55 45 / 0.45) 38px, rgb(196 55 45 / 0.45) 39.5px, transparent 39.5px), repeating-linear-gradient(180deg, transparent 0, transparent 35px, rgb(46 92 156 / 0.18) 35px, rgb(46 92 156 / 0.18) 36px)',
        }}
      >
        <table className="w-full border-collapse text-center">
          <thead className="sticky top-0 bg-papel">
            <tr>
              <th className="w-10" />
              {players.map((p) => {
                const seat = seats.find((s) => s.id === p.id);
                return (
                  <th key={p.id} className="px-1 py-2 align-bottom font-normal">
                    <div className="flex flex-col items-center gap-1">
                      <Avatar seed={seat?.avatar ?? p.id} size={26} dim={p.eliminated} />
                      <span className={`max-w-16 truncate text-xs font-bold ${p.eliminated ? 'line-through opacity-50' : ''}`}>{p.name}</span>
                      {p.eliminated ? (
                        <span className="text-[11px] font-bold text-copas">fora</span>
                      ) : (
                        <Matches lives={p.lives} starting={view.rules.startingLives} size={10} />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="font-hand text-2xl leading-none">
            {view.history.map((r) => (
              <tr key={r.number} className="h-9">
                <td className="text-left text-lg text-tinta-2">
                  <span className="pl-1">{r.cards}</span>
                </td>
                {players.map((p) => {
                  if (r.bids[p.id] === undefined) return <td key={p.id} className="text-tinta/25">·</td>;
                  const bid = r.bids[p.id]!;
                  const took = r.tricks[p.id] ?? 0;
                  const lost = (r.livesBefore[p.id] ?? 0) - (r.livesAfter[p.id] ?? 0);
                  return (
                    <td key={p.id} className={lost > 0 ? 'text-copas' : 'text-tinta'}>
                      {bid}/{took}
                      {lost > 0 && <span className="ml-0.5 text-lg">−{lost}</span>}
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
      <p className="mt-2 text-xs text-tinta-2">A primeira coluna é o número de cartas da rodada.</p>
    </Sheet>
  );
}
