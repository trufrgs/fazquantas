import { card as cardOf, cardName, type Play, type StrengthCtx } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Card, CARD_RATIO } from '../cards/Card';
import { GritoManilha, ManilhaEfeito, Queimou } from './ManilhaEfeito';
import { manilhaDe, manilhasQueimadas } from './manilhas';
import { tossRotation, trickStacking, type Point, type TableGeometry } from './layout';

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
  /** Rodada às cegas: a carta de cada um sai de onde estava à mostra, no mesmo tamanho. */
  revealFrom?: { spots: ReadonlyMap<string, Point>; cardWidth: number } | null;
  /** Força das cartas da rodada: manilha que cai na mesa ganha efeito e grito. */
  ctx?: StrengthCtx | null;
}

export function TrickArea(p: TrickAreaProps) {
  const cw = p.cardWidth;
  const ch = cw * CARD_RATIO;
  const stack = trickStacking(p.plays.map((play) => p.geometry.tricks.get(play.playerId) ?? p.geometry.center));
  // Cartas que já estavam na mesa quando ela apareceu (voltou para a sala, recarregou) não repetem o efeito.
  const [jaNaMesa] = useState(() => new Set(p.plays.map((play) => play.cardId)));
  const ctx = p.ctx ?? null;
  const manilha = (play: Play) => (ctx ? manilhaDe(play.cardId, ctx) : null);
  const fresca = (play: Play) => !jaNaMesa.has(play.cardId) && manilha(play) !== null;
  const queimadas =
    p.resolved && ctx && p.winnerId ? manilhasQueimadas({ plays: p.plays, winnerId: p.winnerId, cancelled: [...p.cancelled] }, ctx) : [];
  return (
    <div className="pointer-events-none absolute inset-0" aria-live="polite">
      <AnimatePresence custom={p.collectTo}>
        {p.plays.map((play, i) => {
          const at = p.geometry.tricks.get(play.playerId) ?? p.geometry.center;
          const shown = p.revealFrom?.spots.get(play.playerId);
          const from = shown ?? p.geometry.seats.get(play.playerId) ?? p.geometry.center;
          const fromScale = shown ? p.revealFrom!.cardWidth / cw : 0.45;
          const mine = play.playerId === p.youId && p.youFromHand;
          const isWinner = p.resolved && play.playerId === p.winnerId;
          const isCancelled = p.resolved && p.cancelled.includes(play.playerId);
          const faded = p.resolved && !isWinner;
          const efeito = fresca(play) ? manilha(play)!.efeito : null;
          const queimou = queimadas.includes(play.playerId);
          return (
            <motion.div
              key={play.cardId}
              layoutId={mine ? `card-${play.cardId}` : undefined}
              custom={p.collectTo}
              className="absolute"
              style={{ left: at.x - cw / 2, top: at.y - ch / 2, width: cw, height: ch, zIndex: isWinner ? 50 : 10 + (stack[i] ?? i) }}
              initial={
                mine ? { rotate: 0 } : { x: from.x - at.x, y: from.y - at.y, scale: fromScale, opacity: shown ? 1 : 0, rotate: 0 }
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
              <motion.div
                className="relative h-full w-full transition-[filter,box-shadow] duration-300"
                style={{
                  borderRadius: cw * 0.06,
                  boxShadow: isWinner
                    ? '0 0 0 3px var(--color-luz), 0 0 26px 8px rgb(255 205 130 / 0.55), 0 12px 24px rgb(0 0 0 / 0.5)'
                    : '0 6px 14px rgb(0 0 0 / 0.45)',
                  filter: isCancelled
                    ? 'grayscale(0.85) brightness(0.8)'
                    : queimou
                      ? 'sepia(0.55) saturate(1.3) brightness(0.72)'
                      : faded
                        ? 'brightness(0.82)'
                        : undefined,
                  // A carta que queimou escurece depois do efeito da manilha que a bateu.
                  transitionDelay: queimou ? '650ms' : undefined,
                }}
                // O bastião bate na mesa: chega grande e assenta.
                initial={efeito === 'pancada' ? { scale: 1.28 } : false}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 14, delay: 0.2 }}
              >
                <Card id={play.cardId} width={cw} />
                {efeito && <ManilhaEfeito efeito={efeito} width={cw} />}
                {queimou && <Queimou width={cw} />}
              </motion.div>
            </motion.div>
          );
        })}
        {p.plays.filter(fresca).map((play) => {
          const at = p.geometry.tricks.get(play.playerId) ?? p.geometry.center;
          return (
            <GritoManilha key={`grito-${play.cardId}`} nome={manilha(play)!.nome} x={at.x} y={at.y - ch / 2 - 2} />
          );
        })}
        {/*
          Carimbos acima das outras cartas (senão a carta seguinte cobre o carimbo), mas abaixo da
          vencedora: um carimbo nunca pode parecer estar nela. Cada um vai para a borda de fora da
          carta, a parte que costuma ficar à mostra.
        */}
        {p.resolved &&
          p.plays
            .filter((play) => p.cancelled.includes(play.playerId) || queimadas.includes(play.playerId))
            .map((play) => {
              const queimou = queimadas.includes(play.playerId);
              const at = p.geometry.tricks.get(play.playerId) ?? p.geometry.center;
              const c = p.geometry.center;
              const d = Math.hypot(at.x - c.x, at.y - c.y) || 1;
              const push = ch * 0.22;
              return (
                <motion.span
                  key={`carimbo-${play.cardId}`}
                  className={`absolute z-40 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border-2 bg-papel/95 px-1.5 font-hand text-xl font-bold leading-none shadow ${queimou ? 'border-[#c2410c] text-[#c2410c]' : 'border-copas text-copas'}`}
                  style={{ left: at.x + ((at.x - c.x) / d) * push, top: at.y + ((at.y - c.y) / d) * push }}
                  initial={{ scale: 2, opacity: 0, rotate: -24 }}
                  animate={{ scale: 1, opacity: 1, rotate: -14 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18, delay: queimou ? 0.75 : 0.1 }}
                >
                  {queimou ? 'queimou' : 'empardou'}
                </motion.span>
              );
            })}
      </AnimatePresence>
    </div>
  );
}
