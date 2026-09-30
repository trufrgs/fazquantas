import { maxCardsFor, nextProgression, type PlayerView } from '@fodinha/engine';
import { motion } from 'motion/react';
import type { SeatInfo } from '../../lib/connection';
import { Avatar } from '../ui/Avatar';
import { Matches } from '../ui/Matches';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

function nextCards(view: PlayerView): number | null {
  const rec = view.history.at(-1);
  if (!rec || view.result) return null;
  const alive = view.players.filter((p) => !p.eliminated).length;
  // Alguém saiu e a regra manda recomeçar: do começo (1 carta, ou o máximo quando é descendo).
  if (rec.eliminated.length > 0 && view.rules.restartOnElimination) return view.rules.progression === 'down' ? maxCardsFor(alive, view.rules) : 1;
  return nextProgression(
    view.cardsThisRound,
    view.direction,
    maxCardsFor(alive, view.rules),
    view.rules.progression,
  ).cards;
}

export interface RoundSummaryProps {
  open: boolean;
  view: PlayerView;
  seats: SeatInfo[];
  autoMs: number;
  onContinue?: () => void;
  /** Só sobraram bots (tu acabou de sair): dá para passar o resto em câmera rápida dali mesmo. */
  onAcelerar?: () => void;
}

/** Resumo do fim da rodada: quanto cada um pediu e fez, palitos queimados e os que sobram. */
export function RoundSummary({ open, view, seats, autoMs, onContinue, onAcelerar }: RoundSummaryProps) {
  const rec = view.history.at(-1);
  const next = nextCards(view);
  return (
    <Sheet open={open && !!rec} label="Fim da rodada" backdrop={false} onClose={onContinue}>
      {rec && (
        <div onClick={onContinue} role="presentation">
          <h2
            className="font-display text-2xl font-bold"
            style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
          >
            Fim da rodada {rec.number}
          </h2>
          <p className="text-sm text-tinta-2">
            {rec.cards} {rec.cards === 1 ? 'carta' : 'cartas'} na mão de cada um
          </p>
          {(rec.voltaram?.length ?? 0) > 0 && (
            <p className="mt-2 rounded-xl bg-ouros/20 px-3 py-2 text-sm font-semibold">
              Zeraram juntos e empatados: ninguém ganha perdendo. Cada um volta com um palito e a mesa segue!
            </p>
          )}
          <ul className="mt-3 flex flex-col divide-y divide-tinta/10">
            {Object.keys(rec.bids).map((id) => {
              const p = view.players.find((x) => x.id === id);
              const seat = seats.find((s) => s.id === id);
              const bid = rec.bids[id] ?? 0;
              const took = rec.tricks[id] ?? 0;
              const lost = (rec.livesBefore[id] ?? 0) - (rec.livesAfter[id] ?? 0);
              const out = rec.eliminated.includes(id);
              const voltou = rec.voltaram?.includes(id) ?? false;
              return (
                <li
                  key={id}
                  className={`flex items-center gap-3 py-2 ${id === view.you ? '-mx-2 rounded-xl bg-ouros/15 px-2' : ''}`}
                >
                  <Avatar seed={seat?.avatar ?? id} size={34} dim={out} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p?.name ?? id}</span>
                    <span className="font-hand text-xl leading-none text-tinta-2">
                      pediu {bid} · fez {took}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {out ? (
                      <span className="rounded-full bg-copas px-2.5 py-0.5 text-sm font-bold text-papel">
                        deu pra ti!
                      </span>
                    ) : voltou ? (
                      <span className="rounded-full bg-ouros px-2.5 py-0.5 text-sm font-bold text-tinta">
                        volta com 1!
                      </span>
                    ) : lost > 0 ? (
                      <span className="font-display text-lg font-bold leading-none text-copas tabular-nums">
                        −{lost} {lost === 1 ? 'palito' : 'palitos'}
                      </span>
                    ) : (
                      <span className="font-hand text-2xl font-bold leading-none text-paus">
                        na mosca!
                      </span>
                    )}
                    {!out && (
                      <Matches
                        lives={voltou ? 1 : (rec.livesAfter[id] ?? 0)}
                        starting={view.rules.startingLives}
                        size={11}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-tinta-2">
              {view.result
                ? 'Fim de jogo!'
                : next !== null
                  ? `Próxima: ${next} ${next === 1 ? 'carta' : 'cartas'}`
                  : ''}
            </span>
            {onAcelerar ? (
              <Button
                variant="ouro"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcelerar();
                }}
              >
                ⏩ Acelerar até o fim
              </Button>
            ) : onContinue ? (
              <Button variant="ouro" size="sm" onClick={onContinue}>
                Continuar
              </Button>
            ) : (
              <span className="text-sm text-tinta-2">Continuando…</span>
            )}
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-tinta/10">
            <motion.div
              key={rec.number}
              className="h-full bg-ouros"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: autoMs / 1000, ease: 'linear' }}
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}
