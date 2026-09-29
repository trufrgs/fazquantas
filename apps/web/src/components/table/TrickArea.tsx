import { card as cardOf, cardName, type Play, type StrengthCtx } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Card, CARD_RATIO } from '../cards/Card';
import { ArmaDoGolpe, CartaAtingida, GritoManilha, SOMBRA_CARTA } from './Golpes';
import {
  acertoDe,
  chaveDaMao,
  chaveDoGolpe,
  golpeComAnimacao,
  golpesDaMao,
  mandaNaMesa,
  manilhaDe,
  mesaMudou,
  mesaVista,
  ritmoDosGolpes,
  vitimasEmOrdem,
  type GolpeNaMao,
} from './manilhas';
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
  /** Força das cartas da rodada: a manilha grita e ataca as cartas que ganha ("Quem mata quem"). */
  ctx?: StrengthCtx | null;
  /** Número da rodada (a mesma carta volta em outra rodada e tem direito ao efeito de novo). */
  rodada?: number;
  /** Ritmo do jogo (1 = normal): os golpes acompanham o tempo que a mão fica na mesa. */
  ritmo?: number;
}

export function TrickArea(p: TrickAreaProps) {
  const cw = p.cardWidth;
  const ch = cw * CARD_RATIO;
  const stack = trickStacking(p.plays.map((play) => p.geometry.tricks.get(play.playerId) ?? p.geometry.center));
  const rodada = p.rodada ?? 0;
  const chave = chaveDaMao(rodada, p.plays);
  // O que a mesa já mostrou: o que estava nela quando apareceu (voltou para a sala, recarregou) ou
  // chegou de uma vez (a conexão voltou) entra sem golpe nem grito.
  const [vista, setVista] = useState(() => mesaVista(null, rodada, p.plays, p.resolved));
  let mesa = vista;
  if (mesaMudou(vista, rodada, p.plays, p.resolved)) {
    mesa = mesaVista(vista, rodada, p.plays, p.resolved);
    setVista(mesa);
  }
  const ctx = p.ctx ?? null;
  const ritmo = ritmoDosGolpes(p.ritmo);
  // "Quem mata quem": quem apanha de quem nesta mão, e na ordem em que a arma chega em cada uma.
  const golpes = ctx ? golpesDaMao(p.plays, ctx, p.resolved).filter((g) => golpeComAnimacao(g, p.plays, mesa)) : [];
  const pontoDe = (playerId: string) => p.geometry.tricks.get(playerId) ?? p.geometry.center;
  const apanhou = new Map<string, { g: GolpeNaMao; ordem: number }>();
  for (const g of golpes) vitimasEmOrdem(g, (id) => pontoDe(id).x).forEach((id, ordem) => apanhou.set(id, { g, ordem }));
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
          const golpe = apanhou.get(play.playerId);
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
              <div
                // A carta que apanha leva a sombra junto (a daqui ficaria parada no lugar dela), e a troca
                // é na hora, sem transição (senão ficam duas).
                className={`relative h-full w-full duration-300 ${golpe ? 'transition-[filter]' : 'transition-[filter,box-shadow]'}`}
                style={{
                  borderRadius: cw * 0.06,
                  boxShadow: isWinner
                    ? '0 0 0 3px var(--color-luz), 0 0 26px 8px rgb(255 205 130 / 0.55), 0 12px 24px rgb(0 0 0 / 0.5)'
                    : golpe
                      ? 'none'
                      : SOMBRA_CARTA,
                  filter: isCancelled ? 'grayscale(0.85) brightness(0.8)' : faded ? 'brightness(0.82)' : undefined,
                }}
              >
                {golpe ? (
                  <CartaAtingida
                    id={play.cardId}
                    cw={cw}
                    golpe={golpe.g.golpe}
                    manilha={ctx !== null && manilhaDe(play.cardId, ctx) !== null}
                    acerto={acertoDe(golpe.g, golpe.ordem)}
                    ritmo={ritmo}
                  />
                ) : (
                  <Card id={play.cardId} width={cw} />
                )}
              </div>
            </motion.div>
          );
        })}
        {/*
          Carimbos acima das outras cartas (senão a carta seguinte cobre o carimbo), mas abaixo da
          vencedora: um carimbo nunca pode parecer estar nela. Cada um vai para a borda de fora da
          carta, a parte que costuma ficar à mostra.
        */}
        {p.resolved &&
          p.plays
            .filter((play) => p.cancelled.includes(play.playerId))
            .map((play) => {
              const at = p.geometry.tricks.get(play.playerId) ?? p.geometry.center;
              const c = p.geometry.center;
              const d = Math.hypot(at.x - c.x, at.y - c.y) || 1;
              const push = ch * 0.22;
              return (
                <motion.span
                  key={`carimbo-${play.cardId}`}
                  className="absolute z-40 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border-2 border-copas bg-papel/95 px-1.5 font-hand text-xl font-bold leading-none text-copas shadow"
                  style={{ left: at.x + ((at.x - c.x) / d) * push, top: at.y + ((at.y - c.y) / d) * push }}
                  initial={{ scale: 2, opacity: 0, rotate: -24 }}
                  animate={{ scale: 1, opacity: 1, rotate: -14 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.1 }}
                >
                  empardou
                </motion.span>
              );
            })}
      </AnimatePresence>
      {/* O grito de cada manilha que cai: grande se ela passa a mandar na mesa, pequeno se chega depois de uma mais forte. */}
      {ctx &&
        p.plays.map((play, i) => {
          const m = manilhaDe(play.cardId, ctx);
          if (!m || mesa.semGolpe.has(play.cardId)) return null;
          const at = pontoDe(play.playerId);
          return (
            <GritoManilha
              key={`grito-${chave}-${play.cardId}`}
              nome={m.nome}
              x={at.x}
              y={at.y - ch / 2 - 2}
              pequeno={!mandaNaMesa(p.plays, i, ctx)}
              ritmo={ritmo}
            />
          );
        })}
      {golpes.map((g) => (
        <ArmaDoGolpe key={`arma-${chave}-${chaveDoGolpe(g)}`} g={g} pontoDe={pontoDe} cw={cw} ritmo={ritmo} />
      ))}
    </div>
  );
}
