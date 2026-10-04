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
  emCameraRapida,
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
import { sintetizar } from '../../lib/sintetizado';
import { DEPOIS_DO_CORTE_MS } from './zoeira/diretor';
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
  /** A mesa está no fumo (`Fumaca`): as cartas ficam por cima dele. */
  acimaDaFumaca?: boolean;
  /** É a mão que decide se alguém sai do jogo: a vencedora espera o corte de novela (`decisiveMs`). */
  decide?: boolean;
  /** A mesa caiu na gargalhada com esta mão (gargalhômetro): a vencedora leva o selo "lance da noite". */
  lance?: boolean;
}

/** Quanto a vencedora espera para subir depois que a última carta chega (segundos, no ritmo normal). */
const SEGURA_A_VENCEDORA = 0.6;
/** Na mão que decide, a vencedora só sobe depois do corte de novela (o anfitrião espera junto). */
const SEGURA_NA_MAO_QUE_DECIDE = DEPOIS_DO_CORTE_MS / 1000;

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
  // Câmera rápida (só bots, acelerando até o fim): a mão passa sem golpe nem grito.
  const cameraRapida = emCameraRapida(p.ritmo);
  // A última carta aparece inteira antes de a vencedora subir por cima dela ("dar a chance de as
  // pessoas verem a carta jogada", o Thomas, 30/09/2026): quando a mão fecha com a chegada dela, a
  // vencedora espera um instante (o anfitrião dá esse tempo a mais na pausa: `lastCardMs`).
  const [ultima, setUltima] = useState(() => ({ chave, n: p.plays.length, fechada: p.resolved, segura: false }));
  if (ultima.chave !== chave || ultima.n !== p.plays.length || ultima.fechada !== p.resolved) {
    const chegou = p.resolved && !ultima.fechada && ultima.chave === chave && p.plays.length > ultima.n && !cameraRapida;
    setUltima({ chave, n: p.plays.length, fechada: p.resolved, segura: chegou });
  }
  useEffect(() => {
    if (!ultima.segura) return undefined;
    const t = window.setTimeout(() => setUltima((u) => ({ ...u, segura: false })), ((p.decide ? SEGURA_NA_MAO_QUE_DECIDE : SEGURA_A_VENCEDORA) * 1000) / ritmo);
    return () => window.clearTimeout(t);
  }, [ultima.segura, ritmo, p.decide]);
  const reduce = useReducedMotion();
  const fechada = p.resolved && !ultima.segura;
  const ultimaCarta = ultima.segura ? p.plays.at(-1)?.cardId : undefined;
  // A peleia do empate: as cartas que empardaram se chocam no meio delas, ricocheteiam e ficam
  // apagadas (sem estrelinha nem soco de gibi: o tranco, a faísca e a poeira).
  const empardadas = fechada && !cameraRapida && !reduce ? p.plays.filter((pl) => p.cancelled.includes(pl.playerId)) : [];
  const peleia = empardadas.length >= 2;
  const meioDaPeleia = peleia
    ? empardadas.reduce((m, pl) => {
        const at = p.geometry.tricks.get(pl.playerId) ?? p.geometry.center;
        return { x: m.x + at.x / empardadas.length, y: m.y + at.y / empardadas.length };
      }, { x: 0, y: 0 })
    : null;
  // A manilha que não levou a mão vai para o lixo: queima na mesa em vez de ir para quem ganhou.
  const queima = (playerId: string, cardId: Play['cardId']) =>
    p.resolved && !cameraRapida && !reduce && ctx !== null && manilhaDe(cardId, ctx) !== null && playerId !== p.winnerId;
  const aQueimar = useRef<string | null>(null);
  useEffect(() => {
    if (p.resolved && p.plays.some((pl) => queima(pl.playerId, pl.cardId))) {
      aQueimar.current = chave;
      return;
    }
    // A mão saiu da mesa: a manilha perdida pega fogo agora.
    if (aQueimar.current && aQueimar.current !== chave) {
      aQueimar.current = null;
      sintetizar('fogo');
    }
    // `queima` só depende do que já está nas dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, p.resolved, p.plays, p.winnerId, ctx, cameraRapida, reduce]);
  useEffect(() => {
    if (peleia) play('pau', { delayMs: 170, rate: 1.5 });
  }, [peleia, chave]);
  // "Quem mata quem": quem apanha de quem nesta mão, e na ordem em que a arma chega em cada uma.
  const golpes = useMemo(
    () => (ctx && !cameraRapida ? golpesDaMao(p.plays, ctx, p.resolved).filter((g) => golpeComAnimacao(g, p.plays, mesa)) : []),
    [ctx, cameraRapida, p.plays, p.resolved, mesa],
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
    // Com a mesa no fumo (`Fumaca`), as cartas ficam por cima dele: é o que quem joga precisa ver.
    <div ref={camada} className={`pointer-events-none absolute inset-0 ${p.acimaDaFumaca ? 'z-[11]' : ''}`} aria-live="polite">
      <AnimatePresence custom={p.collectTo}>
        {p.plays.map((play, i) => {
          const at = p.geometry.tricks.get(play.playerId) ?? p.geometry.center;
          const shown = p.revealFrom?.spots.get(play.playerId);
          const from = shown ?? p.geometry.seats.get(play.playerId) ?? p.geometry.center;
          const fromScale = shown ? p.revealFrom!.cardWidth / cw : 0.45;
          const mine = play.playerId === p.youId && p.youFromHand;
          const isWinner = fechada && play.playerId === p.winnerId;
          const isCancelled = fechada && p.cancelled.includes(play.playerId);
          const faded = fechada && !isWinner;
          // Enquanto a vencedora espera, a última carta fica por cima de todas, inteira.
          const z = isWinner ? 50 : play.cardId === ultimaCarta ? 49 : 10 + (stack[i] ?? i);
          const golpe = apanhou.get(play.playerId);
          const pega = isCancelled && meioDaPeleia ? rumo(at, meioDaPeleia, cw * 0.55) : null;
          const giro = tossRotation(play.cardId);
          const fogo = queima(play.playerId, play.cardId);
          return (
            <motion.div
              key={play.cardId}
              layoutId={mine ? `card-${play.cardId}` : undefined}
              custom={p.collectTo}
              className="absolute"
              style={{ left: at.x - cw / 2, top: at.y - ch / 2, width: cw, height: ch, zIndex: z }}
              initial={
                mine ? { rotate: 0 } : { x: from.x - at.x, y: from.y - at.y, scale: fromScale, opacity: shown ? 1 : 0, rotate: 0 }
              }
              animate={
                pega
                  ? { x: [0, pega.x, -pega.x * 0.14, 0], y: [0, pega.y, -pega.y * 0.14, 0], scale: 1, opacity: 1, rotate: [giro, giro, giro + (pega.x >= 0 ? 7 : -7), giro + (pega.x >= 0 ? 4 : -4)] }
                  : {
                      x: 0,
                      y: isWinner ? -6 : 0,
                      scale: isWinner ? 1.1 : 1,
                      opacity: 1,
                      rotate: giro,
                    }
              }
              exit={fogo ? 'queima' : 'collect'}
              variants={{
                collect: (to: Point) => ({
                  x: to.x - at.x,
                  y: to.y - at.y,
                  scale: 0.35,
                  opacity: 0,
                  rotate: 0,
                  transition: { duration: 0.42, ease: [0.55, 0, 0.8, 0.4], delay: i * 0.03 },
                }),
                // A manilha perdida queima no lugar: pega fogo (acende alaranjada), escurece até virar
                // carvão e some subindo com as brasas.
                queima: {
                  filter: ['brightness(1) sepia(0) saturate(1)', 'brightness(1.25) sepia(1) saturate(3.5) hue-rotate(-18deg)', 'brightness(0.12) sepia(1) saturate(1)'],
                  scale: [1, 1, 0.9],
                  y: [0, 0, -cw * 0.25],
                  opacity: [1, 1, 0],
                  transition: { duration: 1, times: [0, 0.35, 1], ease: 'easeIn' },
                },
              }}
              transition={
                pega
                  ? { x: { duration: 0.5, times: [0, 0.32, 0.55, 1], ease: 'easeOut' }, y: { duration: 0.5, times: [0, 0.32, 0.55, 1], ease: 'easeOut' }, rotate: { duration: 0.5, times: [0, 0.32, 0.55, 1] } }
                  : { type: 'spring', stiffness: 380, damping: 30 }
              }
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
                {fogo && (
                  // As brasas que sobem da carta queimando (o fogo em si é o filtro na carta inteira,
                  // que acompanha os pedaços quando ela apanhou antes).
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 block">
                    {[0.2, 0.38, 0.5, 0.62, 0.8].map((fx, k) => (
                      <motion.span
                        key={fx}
                        className="absolute block rounded-full"
                        style={{ left: `${fx * 100}%`, top: '70%', width: Math.max(3, cw * 0.06), height: Math.max(3, cw * 0.06), background: '#FFB347', boxShadow: '0 0 6px 2px rgb(255 120 30 / 0.8)', opacity: 0 }}
                        variants={{ queima: { opacity: [0, 1, 0], y: [0, -cw * (0.9 + (k % 3) * 0.3)], x: [0, (k % 2 ? 1 : -1) * cw * 0.12], transition: { duration: 0.9, delay: 0.15 + k * 0.07, ease: 'easeOut' } } }}
                      />
                    ))}
                  </span>
                )}
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
        {fechada &&
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
                  transition={{ type: 'spring', stiffness: 500, damping: 18, delay: peleia ? 0.5 : 0.1 }}
                >
                  empardou
                </motion.span>
              );
            })}
        {meioDaPeleia && <Faisca key={`faisca-${chave}`} at={meioDaPeleia} cw={cw} />}
        {p.lance && fechada && p.winnerId && (
          <SeloDoLance key={`lance-${chave}`} at={p.geometry.tricks.get(p.winnerId) ?? p.geometry.center} cw={cw} ch={ch} />
        )}
      </AnimatePresence>
      {/* O grito de cada manilha que cai: grande se ela passa a mandar na mesa, pequeno se chega depois de uma mais forte. */}
      {ctx &&
        !cameraRapida &&
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

/** Até onde a carta avança na peleia: na direção do meio, no máximo `max`. */
function rumo(de: Point, para: Point, max: number): Point {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(d * 0.42, max) / d;
  return { x: dx * k, y: dy * k };
}

/** O tranco da peleia: a faísca curta no ponto do choque e uma poeirinha que assenta. */
function Faisca({ at, cw }: { at: Point; cw: number }) {
  const r = cw * 0.55;
  return (
    <motion.span className="pointer-events-none absolute z-[45] block" style={{ left: at.x - r, top: at.y - r, width: r * 2, height: r * 2 }} exit={{ opacity: 0 }} aria-hidden="true">
      <motion.span
        className="absolute inset-0 block rounded-full"
        style={{ background: 'radial-gradient(circle, rgb(214 196 160 / 0.55), rgb(214 196 160 / 0) 70%)' }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 1.4], opacity: [0, 0.9, 0] }}
        transition={{ duration: 0.9, delay: 0.16, ease: 'easeOut' }}
      />
      <motion.svg viewBox="-50 -50 100 100" className="absolute inset-0 h-full w-full overflow-visible" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1.1], opacity: [0, 1, 0] }} transition={{ duration: 0.32, delay: 0.16 }}>
        {[0, 52, 118, 180, 236, 300].map((a) => {
          const rad = (a * Math.PI) / 180;
          return <line key={a} x1={Math.cos(rad) * 14} y1={Math.sin(rad) * 14} x2={Math.cos(rad) * 34} y2={Math.sin(rad) * 34} stroke="#FFE7A8" strokeWidth={5} strokeLinecap="round" />;
        })}
      </motion.svg>
    </motion.span>
  );
}

/** O selo dourado do lance da noite, batido no canto da carta que levou a mão da gargalhada. */
function SeloDoLance({ at, cw, ch }: { at: Point; cw: number; ch: number }) {
  const d = Math.max(44, cw * 0.62);
  return (
    <motion.span
      className="pointer-events-none absolute z-[52] flex items-center justify-center rounded-full text-center font-display font-black uppercase leading-[0.9] text-tinta"
      style={{
        left: at.x + cw * 0.3 - d / 2,
        top: at.y - ch * 0.5 - d * 0.3,
        width: d,
        height: d,
        fontSize: d * 0.2,
        background: 'radial-gradient(circle at 35% 30%, #F6D77A, #E3A82B 60%, #A8741A)',
        boxShadow: '0 0 0 3px #2B1D14, 0 6px 14px rgb(0 0 0 / 0.45)',
      }}
      initial={{ scale: 2.4, opacity: 0, rotate: -30 }}
      animate={{ scale: 1, opacity: 1, rotate: -12 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 16 }}
      role="img"
      aria-label="Lance da noite"
    >
      Lance da noite
    </motion.span>
  );
}
