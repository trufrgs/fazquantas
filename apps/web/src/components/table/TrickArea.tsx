import { card as cardOf, cardName, type Play } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { Card, CARD_RATIO } from '../cards/Card';
import { tossRotation, type Point, type TableGeometry } from './layout';

export interface TrickAreaProps {
  plays: Play[];
  geometry: TableGeometry;
  cardWidth: number;
  /** Fase `trickEnd`: destaca vencedora e anuladas. */
  resolved: boolean;
  winnerId: string | null;
  cancelled: readonly string[];
  youId: string | null;
  /** Para onde as cartas vão quando a vaza é recolhida. */
  collectTo: Point;
  /** Sua carta chega da mão (layoutId); na rodada às cegas vem do assento. */
  youFromHand: boolean;
}

export function TrickArea(p: TrickAreaProps) {
  const cw = p.cardWidth;
  const ch = cw * CARD_RATIO;
  return (
    <div className="pointer-events-none absolute inset-0" aria-live="polite">
      <AnimatePresence custom={p.collectTo}>
        {p.plays.map((play, i) => {
          const at = p.geometry.tricks.get(play.playerId) ?? p.geometry.center;
          const from = p.geometry.seats.get(play.playerId) ?? p.geometry.center;
          const mine = play.playerId === p.youId && p.youFromHand;
          const isWinner = p.resolved && play.playerId === p.winnerId;
          const isCancelled = p.resolved && p.cancelled.includes(play.playerId);
          const faded = p.resolved && !isWinner;
          return (
            <motion.div
              key={play.cardId}
              layoutId={mine ? `card-${play.cardId}` : undefined}
              custom={p.collectTo}
              className="absolute"
              style={{ left: at.x - cw / 2, top: at.y - ch / 2, width: cw, height: ch, zIndex: isWinner ? 50 : 10 + i }}
              initial={
                mine ? { rotate: 0 } : { x: from.x - at.x, y: from.y - at.y, scale: 0.45, opacity: 0, rotate: 0 }
              }
              animate={{
                x: 0,
                y: isWinner ? -6 : 0,
                scale: isWinner ? 1.1 : 1,
                opacity: 1,
                rotate: tossRotation(play.cardId),
              }}
              exit="collect"
              variants={{
                collect: (to: Point) => ({
                  x: to.x - at.x,
                  y: to.y - at.y,
                  scale: 0.35,
                  opacity: 0,
                  rotate: 0,
                  transition: { duration: 0.42, ease: [0.55, 0, 0.8, 0.4], delay: i * 0.03 },
                }),
              }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              role="img"
              aria-label={cardName(cardOf(play.cardId))}
            >
              <div
                className="h-full w-full transition-[filter,box-shadow] duration-300"
                style={{
                  borderRadius: cw * 0.06,
                  boxShadow: isWinner
                    ? '0 0 0 3px var(--color-luz), 0 0 26px 8px rgb(255 205 130 / 0.55), 0 12px 24px rgb(0 0 0 / 0.5)'
                    : '0 6px 14px rgb(0 0 0 / 0.45)',
                  filter: isCancelled ? 'grayscale(0.85) brightness(0.8)' : faded ? 'brightness(0.82)' : undefined,
                }}
              >
                <Card id={play.cardId} width={cw} />
              </div>
              {isCancelled && (
                <motion.span
                  initial={{ scale: 2, opacity: 0, rotate: -24 }}
                  animate={{ scale: 1, opacity: 1, rotate: -14 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.1 }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-copas bg-papel/90 px-1.5 font-hand text-2xl font-bold leading-none text-copas shadow"
                >
                  melou
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
