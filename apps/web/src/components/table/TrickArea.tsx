import { card as cardOf, cardName, type Play, type StrengthCtx } from '@fodinha/engine';
import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CARD_RATIO } from '../cards/Card';
import { ArmaDoGolpe, CartaAcorda, CartaAtingida, GritoManilha, SOMBRA_CARTA } from './Golpes';
import {
  acertoDe,
  bastiaoCortado,
  chaveDaMao,
  chaveDoGolpe,
  golpeComAnimacao,
  golpesDaMao,
  impactosDoGolpe,
  mandaNaMesa,
  manilhaDe,
  mesaMudou,
  mesaVista,
  punhaisPorVitima,
  ritmoDosGolpes,
  tremor,
  vitimasEmOrdem,
  type GolpeNaMao,
} from './manilhas';
import { play } from '../../lib/sound';
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
  const golpes = useMemo(
    () => (ctx ? golpesDaMao(p.plays, ctx, p.resolved).filter((g) => golpeComAnimacao(g, p.plays, mesa)) : []),
    [ctx, p.plays, p.resolved, mesa],
  );
  const pontoDe = (playerId: string) => p.geometry.tricks.get(playerId) ?? p.geometry.center;
  const apanhou = new Map<string, { g: GolpeNaMao; ordem: number }>();
  for (const g of golpes) vitimasEmOrdem(g, (id) => pontoDe(id).x).forEach((id, ordem) => apanhou.set(id, { g, ordem }));
  const cartaDe = (playerId: string) => p.plays.find((pl) => pl.playerId === playerId)?.cardId;
  /** Quanto a carta de cada um está girada na mesa (as armas saem do desenho dela, girado junto). */
  const giroDe = (playerId: string) => {
    const c = cartaDe(playerId);
    return c ? tossRotation(c) : 0;
  };
  /** O bastião partido pelo espadão neste golpe (o duelo das duas maiores tem efeito próprio). */
  const bastiaoDe = (g: GolpeNaMao) => (ctx ? bastiaoCortado(g, cartaDe, ctx) : null);
  /** Quantos punhais o golpe atira (o sete de espadas) e quantos o mesmo sete já tinha atirado nesta mão. */
  const punhaisDe = (g: GolpeNaMao) => (g.golpe === 'fura' ? punhaisPorVitima(g.vitimas.length) * g.vitimas.length : 0);
  const espadasAntes = (g: GolpeNaMao) =>
    golpes.slice(0, golpes.indexOf(g)).reduce((n, o) => n + (o.atacante === g.atacante ? punhaisDe(o) : 0), 0);
  /** Direção do golpe (unitária), de quem ataca para a carta que apanha. */
  const direcao = (g: GolpeNaMao, vitima: string) => {
    const a = pontoDe(g.atacante);
    const v = pontoDe(vitima);
    const d = Math.hypot(v.x - a.x, v.y - a.y) || 1;
    return { x: (v.x - a.x) / d, y: (v.y - a.y) / d };
  };

  // A mesa treme a cada pancada (cada golpe uma vez, quando começa). O bastião partido sacode bem mais
  // e tem o som da madeira rachando na hora do corte dele (aqui, onde se sabe a ordem da espada).
  const camada = useRef<HTMLDivElement>(null);
  const tremidos = useRef(new Set<string>());
  const reduce = useReducedMotion();
  useEffect(() => {
    const novos = golpes.filter((g) => !tremidos.current.has(`${chave}:${chaveDoGolpe(g)}`));
    for (const g of novos) tremidos.current.add(`${chave}:${chaveDoGolpe(g)}`);
    const x = (id: string) => (p.geometry.tricks.get(id) ?? p.geometry.center).x;
    const impactos = novos.flatMap((g) => {
      const ordem = vitimasEmOrdem(g, x);
      const bastiao = ctx ? bastiaoCortado(g, (id) => p.plays.find((pl) => pl.playerId === id)?.cardId, ctx) : null;
      if (bastiao) play('pau', { delayMs: (acertoDe(g, ordem.indexOf(bastiao)) * 1000) / ritmo });
      return impactosDoGolpe(g, ordem, (id) => id === bastiao);
    });
    const el = camada.current;
    const t = tremor(impactos);
    if (reduce || !el || !t) return;
    const px = cw / 60;
    animate(el, { x: t.x.map((v) => v * px), y: t.y.map((v) => v * px) }, { duration: t.duracao / ritmo, times: t.times, ease: 'linear' });
  }, [golpes, chave, reduce, ritmo, cw, ctx, p.geometry, p.plays]);
  return (
    <div ref={camada} className="pointer-events-none absolute inset-0" aria-live="polite">
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
                    direcao={direcao(golpe.g, play.playerId)}
                    giro={tossRotation(play.cardId)}
                    punhais={golpe.g.golpe === 'fura' ? punhaisPorVitima(golpe.g.vitimas.length) : 1}
                  />
                ) : (
                  <Card id={play.cardId} width={cw} />
                )}
                {/* A carta de quem ataca acende quando a arma sai dela (e fica sem o desenho que saiu). */}
                {golpes
                  .filter((g) => g.atacante === play.playerId)
                  .map((g) => (
                    <CartaAcorda
                      key={`acorda-${chave}-${chaveDoGolpe(g)}`}
                      golpe={g.golpe}
                      cw={cw}
                      ritmo={ritmo}
                      espadas={g.golpe === 'fura' ? { antes: espadasAntes(g), agora: punhaisDe(g) } : undefined}
                    />
                  ))}
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
        <ArmaDoGolpe
          key={`arma-${chave}-${chaveDoGolpe(g)}`}
          g={g}
          pontoDe={pontoDe}
          giroDe={giroDe}
          cw={cw}
          ritmo={ritmo}
          bastiao={bastiaoDe(g)}
          centro={p.geometry.center}
          espadasAntes={espadasAntes(g)}
        />
      ))}
    </div>
  );
}
