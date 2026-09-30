import type { CardId } from '@fodinha/engine';
import { motion, useReducedMotion, type Easing } from 'motion/react';
import { Fragment, useId, useState, type CSSProperties } from 'react';
import { Card, CARD_RATIO } from '../cards/Card';
import { passoDe, punhaisPorVitima, TEMPO_GOLPE, vitimasEmOrdem, type Golpe, type GolpeNaMao } from './manilhas';
import type { Point } from './layout';

/**
 * As peças de "Quem mata quem": as armas que saem de dentro da carta de quem ataca e atravessam a mesa
 * (`ArmaDoGolpe`, com a carta acendendo em `CartaAcorda`), a carta que apanha (`CartaAtingida`) e o
 * grito da manilha (`GritoManilha`). Tudo em segundos no ritmo normal, dividido por `ritmo` (o fim da
 * mão fica menos tempo na mesa nos ritmos rápidos). Com "reduzir movimento", nada voa: a carta que
 * apanha só escurece.
 *
 * Drástico de propósito ("tá muito educadinho", o Igor, 29/09/2026): a arma sai do desenho da carta
 * (o espadão, o bastão, os punhais do sete de espadas, o ouro do belo, a copa; pedido do Thomas em
 * 29/09/2026), a carta cortada voa em dois pedaços, a do bastão amassa e racha, a furada fica com os
 * punhais espetados e é jogada para trás, o ouro acende a mesa e ofusca as outras; a mesa treme a cada
 * pancada (`TrickArea`).
 *
 * As curvas vão por trecho (`porTrecho`): a opacidade roda no navegador (WAAPI), que aplicaria uma
 * curva só à animação inteira, e a posição roda trecho a trecho; assim as duas andam juntas.
 */

const porTrecho = (ease: Easing, chaves: number): Easing[] => Array.from({ length: chaves - 1 }, () => ease);

/** A sombra de uma carta na mesa. A carta que apanha leva a sombra junto quando se mexe. */
export const SOMBRA_CARTA = '0 6px 14px rgb(0 0 0 / 0.45)';

/** O escuro por cima da carta que apanhou: preto com esta opacidade dá o mesmo que `brightness(0.7)`. */
const ESCURO = 0.3;

/** As gotas de vinho: quantas voam e onde cada uma cai, a partir do centro da carta atingida. */
const GOTAS = 5;
const pouso = (c: number, cw: number) => ({ x: ((c % 3) - 1) * cw * 0.2, y: cw * 0.2 + Math.floor(c / 3) * cw * 0.16 + (c % 2) * cw * 0.06 });
const GOTA: CSSProperties = { borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%', background: '#b3261e', boxShadow: 'inset -1px -1px 0 rgb(0 0 0 / .25)' };
const MANCHA = '#b02a48';
const MANCHA_BORDA = '#6d0f1f';

// ---------------------------------------------------------------------------------------------------
// As armas, saindo de dentro da carta de quem ataca

/** O papel das cartas do Fournier: tapa, na carta, o lugar do desenho que saiu dela. */
const PAPEL = '#fbf8ee';

/** Gira `p` (relativo ao centro da carta) pelo giro da carta na mesa, em graus. */
function girar(p: Point, graus: number): Point {
  const r = (graus * Math.PI) / 180;
  return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) };
}

/** Um ponto do desenho da carta na mesa (`fx`, `fy`: fração da largura e da altura, a partir do meio). */
function noDesenho(centro: Point, giro: number, fx: number, fy: number, cw: number): Point {
  const d = girar({ x: fx * cw, y: fy * cw * CARD_RATIO }, giro);
  return { x: centro.x + d.x, y: centro.y + d.y };
}

/** O menor giro de `de` até `para`, em graus (para a arma virar pelo lado mais curto). */
const virada = (de: number, para: number) => de + ((((para - de) % 360) + 540) % 360) - 180;

/**
 * As sete espadas desenhadas no sete de espadas, medidas na carta: o meio de cada uma (fração da
 * carta, a partir do centro) e para onde aponta a lâmina (0: direita; 90: baixo). Saem nesta ordem:
 * a deitada do meio, as do meio de cima e de baixo, e as dos cantos.
 */
const ESPADAS_DO_SETE = [
  { fx: 0, fy: 0, ang: 0 },
  { fx: -0.005, fy: -0.23, ang: 90 },
  { fx: 0.004, fy: 0.25, ang: -90 },
  { fx: -0.284, fy: -0.234, ang: 90 },
  { fx: 0.295, fy: 0.24, ang: -90 },
  { fx: 0.289, fy: -0.225, ang: 90 },
  { fx: -0.279, fy: 0.237, ang: -90 },
] as const;
/** O comprimento de cada espada desenhada no sete e o do punhal que sai dela, em larguras de carta. */
const ESPADA_DO_SETE = 0.46;
const PUNHAL = 1;
/** A grossura do punhal em relação ao comprimento (o desenho tem 96×14). */
const PUNHAL_GROSSO = 14 / 96;
/** Quanto do punhal fica para fora depois de cravado (a ponta entra na carta). */
const PUNHAL_PRA_FORA = 0.73;
/** Onde cada punhal crava na vítima, a partir do meio dela (em larguras de carta). */
const FUROS = [
  { x: 0, y: -0.07 },
  { x: -0.18, y: 0.2 },
  { x: 0.19, y: 0.12 },
] as const;
/** O ouro do meio do sete belo, o que se levanta: centro (fração da carta) e diâmetro (em larguras). */
const OURO_DO_BELO = { fx: -0.007, fy: -0.157, d: 0.27 };

/**
 * A carta de quem ataca, na hora em que a arma sai dela: a borda acende e o desenho dá um clarão. O
 * ouro deixa o lugar dele vazio enquanto está no ar, e cada punhal que sai deixa vazio o lugar da
 * espada desenhada (`espadas`: quantas já tinham saído antes nesta mão e quantas saem agora).
 */
export function CartaAcorda({ golpe, cw, ritmo, espadas }: { golpe: Golpe; cw: number; ritmo: number; espadas?: { antes: number; agora: number } }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const ch = cw * CARD_RATIO;
  const { inicio } = TEMPO_GOLPE;
  const sai = TEMPO_GOLPE.sai[golpe];
  const cor = golpe === 'corta' || golpe === 'fura' ? '207 224 255' : golpe === 'vinho' ? '255 170 180' : '255 214 110';
  const descola = inicio + sai * 0.35;
  return (
    <>
      <motion.span
        className="pointer-events-none absolute inset-0 block"
        style={{
          borderRadius: cw * 0.06,
          boxShadow: `0 0 0 2px rgb(${cor} / 0.95), 0 0 ${cw * 0.45}px ${cw * 0.12}px rgb(${cor} / 0.75)`,
          background: `radial-gradient(circle at 50% 45%, rgb(255 255 255 / 0.85), rgb(${cor} / 0.35) 45%, transparent 75%)`,
          mixBlendMode: 'screen',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.75, 0] }}
        transition={{ duration: (sai + 0.4) / ritmo, delay: inicio / ritmo, times: [0, 0.3, 0.7, 1], ease: porTrecho('easeOut', 4) }}
        aria-hidden="true"
      />
      {golpe === 'brilha' &&
        (() => {
          const d = OURO_DO_BELO.d * cw + 3;
          const fora = sai + TEMPO_GOLPE.arma.luz - sai * 0.35;
          return (
            <motion.span
              className="pointer-events-none absolute block rounded-full"
              style={{ left: (0.5 + OURO_DO_BELO.fx) * cw - d / 2, top: (0.5 + OURO_DO_BELO.fy) * ch - d / 2, width: d, height: d, background: PAPEL, boxShadow: `0 0 2px 1px ${PAPEL}` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{ duration: fora / ritmo, delay: descola / ritmo, times: [0, 0.04, 0.97, 1], ease: 'linear' }}
              aria-hidden="true"
            />
          );
        })()}
      {golpe === 'fura' &&
        espadas &&
        Array.from({ length: Math.min(espadas.agora, ESPADAS_DO_SETE.length) }, (_, j) => {
          const e = ESPADAS_DO_SETE[(espadas.antes + j) % ESPADAS_DO_SETE.length]!;
          const comprida = ESPADA_DO_SETE * cw + 2;
          const grossa = cw * 0.15;
          const deitada = e.ang === 0;
          const [w, h] = deitada ? [comprida, grossa] : [grossa, comprida];
          return (
            <motion.span
              key={j}
              className="pointer-events-none absolute block rounded-full"
              style={{ left: (0.5 + e.fx) * cw - w / 2, top: (0.5 + e.fy) * ch - h / 2, width: w, height: h, background: PAPEL, boxShadow: `0 0 2px 1px ${PAPEL}` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.06 / ritmo, delay: descola / ritmo }}
              aria-hidden="true"
            />
          );
        })}
    </>
  );
}

/**
 * A espada do espadão: sai de dentro da carta (descola do sabre desenhado no ás, cresce e se ergue),
 * arma o golpe por cima dela e atravessa a mesa da esquerda para a direita; o fio passa por cada vítima
 * (`alvos`, nessa ordem) na hora do corte dela (`cortes`, em segundos desde `atraso`).
 */
function Espada({ de, giro, alvos, cortes, cw, atraso, ritmo }: { de: Point; giro: number; alvos: Point[]; cortes: number[]; cw: number; atraso: number; ritmo: number }) {
  const comp = cw * 3.2;
  const alt = cw * 0.26;
  const ch = cw * CARD_RATIO;
  const eixo = alt * 1.4; // o punho, onde a espada gira
  const fio = comp * 0.6 - eixo; // do punho até o ponto da lâmina que corta
  const meio = comp / 2 - eixo; // do punho até o meio da espada
  // Onde a espada fica para o ponto a `dist` do punho cair em `p`, inclinada `graus`, na escala `s`.
  const pose = (p: Point, graus: number, s = 1, dist = fio) => {
    const r = (graus * Math.PI) / 180;
    return { x: p.x - eixo - s * dist * Math.cos(r), y: p.y - alt / 2 - s * dist * Math.sin(r), rotate: graus, scale: s };
  };
  const sai = TEMPO_GOLPE.sai.corta;
  const n = alvos.length;
  const ultimo = alvos[n - 1]!;
  const desenho = (ch * 0.88) / comp; // do tamanho do sabre desenhado no ás
  const noAs = pose(noDesenho(de, giro, -0.06, 0.02, cw), 64 + giro, desenho, meio);
  const poses = [
    // Deitada no desenho do ás (o sabre em diagonal, o punho no alto à esquerda), acendendo com a carta.
    noAs,
    noAs,
    // Descolando da carta: cresce, sobe e começa a virar.
    pose({ x: de.x, y: de.y - ch * 0.1 }, 40 + giro, desenho * 1.45, meio),
    // Erguida por cima da carta, a lâmina para trás: o armado do golpe.
    pose({ x: de.x, y: de.y - ch * 0.28 }, -118, 0.85, meio),
    // No corte, a lâmina acompanha o risco na carta (uns -21°), abrindo um pouco de uma vítima para a outra.
    ...alvos.map((p, i) => pose(p, -26 + (n > 1 ? (10 * i) / (n - 1) : 5))),
    pose({ x: ultimo.x + cw * 1.4, y: ultimo.y + cw * 0.7 }, 20),
  ];
  const total = cortes[n - 1]! + TEMPO_GOLPE.arma.depoisDoCorte;
  // Acende no desenho, descola devagar, arma, acelera até o primeiro corte, passa reto pelas vítimas e
  // freia depois do último.
  const ease: Easing[] = ['linear', 'easeOut', 'easeInOut', 'easeIn', ...cortes.slice(1).map((): Easing => 'linear'), 'easeOut'];
  return (
    <motion.svg
      viewBox="0 0 180 14"
      width={comp}
      height={alt}
      className="pointer-events-none absolute left-0 top-0 z-[60] overflow-visible drop-shadow-[0_0_6px_rgb(207_224_255/0.9)]"
      style={{ transformOrigin: `${eixo}px 50%` }}
      initial={{ opacity: 0, ...poses[0] }}
      animate={{ opacity: [0, 1, 1, 0], x: poses.map((q) => q.x), y: poses.map((q) => q.y), rotate: poses.map((q) => q.rotate), scale: poses.map((q) => q.scale) }}
      transition={{
        duration: total / ritmo,
        delay: atraso / ritmo,
        times: [0, (sai * 0.3) / total, (sai * 0.65) / total, sai / total, ...cortes.map((c) => c / total), 1],
        ease,
        opacity: { duration: total / ritmo, delay: atraso / ritmo, times: [0, (sai * 0.15) / total, cortes[n - 1]! / total, 1], ease: 'linear' },
      }}
      aria-hidden="true"
    >
      <rect x="0" y="4" width="22" height="6" rx="3" fill="#7a4a2a" />
      <rect x="20" y="0" width="6" height="14" rx="2" fill="#c9a24a" />
      <path d="M26 3.5 L168 5.5 L180 7 L168 8.5 L26 10.5 Z" fill="#e8eef7" stroke="#8aa0bf" strokeWidth="0.8" />
      <path d="M28 7 L170 7" stroke="#fff" strokeWidth="0.8" opacity="0.8" />
    </motion.svg>
  );
}

/** O bastão desenhado no ás de paus: verde, com os galhos e a fita vermelha enrolada (viewBox 26×96). */
function DesenhoDoBastao() {
  return (
    <>
      <path d="M10 94 C8 74 6 44 7 24 C7 11 10 3 13 2 C17 3 20 11 19 24 C20 44 18 74 16 94 Z" fill="#5e8f3a" stroke="#2f5220" strokeWidth="1.3" />
      <path d="M6.8 45 L19.3 36.5 L19.3 42 L6.9 50.5 Z M7.4 65 L18.7 57.5 L18.6 62.5 L7.6 70 Z" fill="#c8352b" stroke="#7a1d16" strokeWidth="0.6" />
      <path d="M8 32 q-6 -3 -7 -9 M18 46 q7 -2 8 -8 M8 60 q-6 -1 -7 -6" stroke="#2f5220" strokeWidth="1.6" fill="none" />
    </>
  );
}

/**
 * O bastão do bastião: sai de dentro da carta (descola do bastão desenhado no ás), se ergue e vai de
 * vítima em vítima, descendo com tudo em cada uma na hora do acerto dela (`acertos`, desde `atraso`).
 */
function BastaoDaCarta({ de, giro, alvos, acertos, cw, atraso, ritmo }: { de: Point; giro: number; alvos: Point[]; acertos: number[]; cw: number; atraso: number; ritmo: number }) {
  const w = cw * 0.5;
  const h = cw * 1.85;
  const ch = cw * CARD_RATIO;
  const sai = TEMPO_GOLPE.sai.bate;
  type Quadro = { x: number; y: number; rotate: number; scale: number };
  // O bastão gira no cabo (embaixo, no meio): onde ele fica para o meio dele cair em `c`.
  const peloMeio = (c: Point, graus: number, s: number): Quadro => {
    const r = (graus * Math.PI) / 180;
    return { x: c.x - w / 2 - s * (h / 2) * Math.sin(r), y: c.y - h + s * (h / 2) * Math.cos(r), rotate: graus, scale: s };
  };
  // Na vítima: erguido, a pancada, o repique e o fim, a partir da carta dela.
  const naVitima = (a: Point, [dx, dy, graus]: readonly [number, number, number]): Quadro => ({ x: a.x + cw * (0.04 + dx), y: a.y - h * 0.96 + cw * dy, rotate: graus, scale: 1 });
  const ERGUIDO = [0.16, -0.2, 70] as const;
  const PANCADA = [-0.15, 0.52, -10] as const;
  const REPIQUE = [-0.15, 0.44, -4] as const;
  const FIM = [-0.15, 0.28, 14] as const;
  const noAs = peloMeio(noDesenho(de, giro, 0.015, 0, cw), -22 + giro, 0.75);
  const quadros: { t: number; q: Quadro; ease?: Easing }[] = [
    // No desenho do ás (inclinado, a cabeça no alto à esquerda), acendendo com a carta.
    { t: 0, q: noAs },
    { t: sai * 0.3, q: noAs, ease: 'linear' },
    { t: sai * 0.65, q: peloMeio({ x: de.x, y: de.y - ch * 0.12 }, -8 + giro, 0.95), ease: 'easeOut' },
    { t: sai, q: peloMeio({ x: de.x, y: de.y - ch * 0.22 }, 40, 1), ease: 'easeInOut' },
  ];
  let antes = sai;
  alvos.forEach((a, i) => {
    const pancada = acertos[i]!;
    const desce = Math.min(0.14, (pancada - antes) * 0.55);
    const proxima = acertos[i + 1];
    const sobe = proxima === undefined ? 0.1 : Math.min(0.08, (proxima - pancada) * 0.3);
    quadros.push(
      { t: pancada - desce, q: naVitima(a, ERGUIDO), ease: 'easeInOut' },
      { t: pancada, q: naVitima(a, PANCADA), ease: [0.55, 0, 0.9, 0.45] },
      { t: pancada + sobe, q: naVitima(a, REPIQUE), ease: 'easeOut' },
    );
    antes = pancada + sobe;
  });
  const total = antes + 0.22;
  quadros.push({ t: total, q: naVitima(alvos[alvos.length - 1]!, FIM), ease: 'easeOut' });
  const ultima = acertos[acertos.length - 1]!;
  return (
    <motion.svg
      viewBox="0 0 26 96"
      width={w}
      height={h}
      className="pointer-events-none absolute left-0 top-0 z-[60] overflow-visible drop-shadow-[0_6px_5px_rgb(0_0_0/0.35)]"
      style={{ transformOrigin: '50% 100%' }}
      initial={{ opacity: 0, ...quadros[0]!.q }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: quadros.map((f) => f.q.x),
        y: quadros.map((f) => f.q.y),
        rotate: quadros.map((f) => f.q.rotate),
        scale: quadros.map((f) => f.q.scale),
      }}
      transition={{
        duration: total / ritmo,
        delay: atraso / ritmo,
        times: quadros.map((f) => f.t / total),
        ease: quadros.slice(1).map((f) => f.ease!),
        opacity: { duration: total / ritmo, delay: atraso / ritmo, times: [0, (sai * 0.15) / total, (ultima + 0.1) / total, 1], ease: 'linear' },
      }}
      aria-hidden="true"
    >
      <DesenhoDoBastao />
    </motion.svg>
  );
}

/** Um punhal do sete de espadas, como os da carta: lâmina de aço azulado, cabo vermelho e guarda de ouro (viewBox 96×14, ponta à direita). */
function DesenhoDoPunhal() {
  return (
    <>
      <circle cx="3.2" cy="7" r="3" fill="#d9b24a" stroke="#8a6a1a" strokeWidth="0.6" />
      <rect x="5" y="4.6" width="11" height="4.8" rx="2" fill="#c8352b" stroke="#7a1d16" strokeWidth="0.5" />
      <rect x="15.5" y="0.6" width="4.2" height="12.8" rx="1.6" fill="#d9b24a" stroke="#8a6a1a" strokeWidth="0.6" />
      <path d="M19.7 3.4 L86 5.8 L96 7 L86 8.2 L19.7 10.6 Z" fill="#7fa9dc" stroke="#35649e" strokeWidth="0.8" />
      <path d="M21 7 L88 7" stroke="#e4eefb" strokeWidth="1" opacity="0.9" />
    </>
  );
}

/**
 * Um punhal saindo do sete de espadas: descola da espada desenhada (`saida`, apontando `ang0`), se
 * levanta junto com os outros, mira a vítima, é atirado em `lanca` e crava no furo (`furo`) em
 * `crava` (desde `atraso`). Cravado, some daqui: quem fica espetado na carta é o `PunhalCravado`.
 */
function Punhal({
  saida,
  ang0,
  alto,
  furo,
  lanca,
  crava,
  cw,
  atraso,
  ritmo,
}: {
  saida: Point;
  ang0: number;
  alto: Point;
  furo: Point;
  lanca: number;
  crava: number;
  cw: number;
  atraso: number;
  ritmo: number;
}) {
  const L = cw * PUNHAL;
  const hh = L * PUNHAL_GROSSO;
  const sai = TEMPO_GOLPE.sai.fura;
  const mira = virada(ang0, (Math.atan2(furo.y - alto.y, furo.x - alto.x) * 180) / Math.PI);
  const r = (mira * Math.PI) / 180;
  // Cravado: a ponta passou do furo (o que entrou fica escondido na carta).
  const fim = { x: furo.x - Math.cos(r) * L * (0.5 - (1 - PUNHAL_PRA_FORA)), y: furo.y - Math.sin(r) * L * (0.5 - (1 - PUNHAL_PRA_FORA)) };
  const at = (p: Point) => ({ x: p.x - L / 2, y: p.y - hh / 2 });
  const espera = Math.max(lanca, sai + 0.01);
  const quadros = [
    { t: 0, p: saida, rotate: ang0, scale: ESPADA_DO_SETE / PUNHAL },
    { t: sai * 0.3, p: saida, rotate: ang0, scale: ESPADA_DO_SETE / PUNHAL },
    { t: sai * 0.65, p: alto, rotate: ang0, scale: 0.8 },
    { t: sai, p: alto, rotate: mira, scale: 1 },
    { t: espera, p: { x: alto.x - Math.cos(r) * cw * 0.06, y: alto.y - Math.sin(r) * cw * 0.06 }, rotate: mira, scale: 1 },
    { t: crava, p: fim, rotate: mira, scale: 1 },
  ];
  return (
    <motion.svg
      viewBox="0 0 96 14"
      width={L}
      height={hh}
      className="pointer-events-none absolute left-0 top-0 z-[61] overflow-visible drop-shadow-[0_4px_3px_rgb(0_0_0/0.4)]"
      initial={{ opacity: 0, ...at(saida), rotate: ang0, scale: quadros[0]!.scale }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: quadros.map((f) => at(f.p).x),
        y: quadros.map((f) => at(f.p).y),
        rotate: quadros.map((f) => f.rotate),
        scale: quadros.map((f) => f.scale),
      }}
      transition={{
        duration: crava / ritmo,
        delay: atraso / ritmo,
        times: quadros.map((f) => f.t / crava),
        ease: ['linear', 'easeOut', 'easeInOut', 'easeInOut', [0.5, 0, 0.9, 0.6]],
        opacity: { duration: (crava + 0.02) / ritmo, delay: atraso / ritmo, times: [0, (sai * 0.15) / crava, 1, 1], ease: 'linear' },
      }}
      aria-hidden="true"
    >
      <DesenhoDoPunhal />
    </motion.svg>
  );
}

/** O ouro do sete belo, como os da carta: moeda de ouro com a flor de quatro pétalas (viewBox 40×40). */
function DesenhoDoOuro() {
  const id = useId();
  return (
    <>
      <defs>
        <radialGradient id={`${id}-o`} cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.45" stopColor="#f5c542" />
          <stop offset="1" stopColor="#b8860b" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#${id}-o)`} stroke="#9a6206" strokeWidth="1.6" />
      <circle cx="20" cy="20" r="14.5" fill="none" stroke="#c98a12" strokeWidth="1.2" />
      <path
        d="M20 7.5 C23.5 12 23.5 16 20 20 C16.5 16 16.5 12 20 7.5 Z M32.5 20 C28 23.5 24 23.5 20 20 C24 16.5 28 16.5 32.5 20 Z M20 32.5 C16.5 28 16.5 24 20 20 C23.5 24 23.5 28 20 32.5 Z M7.5 20 C12 16.5 16 16.5 20 20 C16 23.5 12 23.5 7.5 20 Z"
        fill="#e08a1c"
        stroke="#a85f0e"
        strokeWidth="0.7"
      />
      <circle cx="20" cy="20" r="2.2" fill="#fff0a8" />
    </>
  );
}

/** Onde o ouro do belo fica no ar, brilhando: por cima do meio da carta (o grito fica acima dela). */
const ouroNoAr = (de: Point, cw: number): Point => ({ x: de.x, y: de.y - cw * CARD_RATIO * 0.1 });

/**
 * O ouro do sete belo: se levanta da carta (o ouro do meio), girando, e fica no ar brilhando enquanto a
 * luz dele ofusca a mesa (`Luz`); no fim, volta para o lugar dele na carta.
 */
function OuroDaCarta({ de, giro, cw, atraso, ritmo }: { de: Point; giro: number; cw: number; atraso: number; ritmo: number }) {
  const d = cw * 0.64;
  const sai = TEMPO_GOLPE.sai.brilha;
  const total = sai + TEMPO_GOLPE.arma.luz;
  const desenho = noDesenho(de, giro, OURO_DO_BELO.fx, OURO_DO_BELO.fy, cw);
  const alto = ouroNoAr(de, cw);
  const s0 = (OURO_DO_BELO.d * cw) / d;
  const at = (p: Point) => ({ x: p.x - d / 2, y: p.y - d / 2 });
  const pontos = [desenho, desenho, { x: (desenho.x + alto.x) / 2, y: Math.min(desenho.y, alto.y) - cw * 0.12 }, alto, { x: alto.x, y: alto.y - cw * 0.05 }, desenho];
  return (
    <>
      <motion.svg
        viewBox="0 0 40 40"
        width={d}
        height={d}
        className="pointer-events-none absolute left-0 top-0 z-[57] drop-shadow-[0_8px_6px_rgb(0_0_0/0.35)]"
        initial={{ opacity: 0, ...at(desenho), scale: s0, rotateY: 0 }}
        animate={{
          opacity: [0, 1, 1, 1, 1, 0],
          x: pontos.map((p) => at(p).x),
          y: pontos.map((p) => at(p).y),
          scale: [s0, s0, 0.85, 1.12, 1, s0],
          rotateY: [0, 0, 360, 720, 720, 900],
        }}
        transition={{
          duration: total / ritmo,
          delay: atraso / ritmo,
          times: [0, (sai * 0.25) / total, (sai * 0.62) / total, sai / total, (sai + TEMPO_GOLPE.arma.luz * 0.72) / total, 1],
          ease: ['linear', 'easeOut', 'easeOut', 'easeInOut', 'easeIn'],
        }}
        aria-hidden="true"
      >
        <DesenhoDoOuro />
      </motion.svg>
      {/* O brilho em volta do ouro, pulsando enquanto ele está no ar. */}
      <motion.span
        className="pointer-events-none absolute z-[58] block rounded-full"
        style={{
          left: alto.x - d,
          top: alto.y - d,
          width: d * 2,
          height: d * 2,
          mixBlendMode: 'screen',
          background: 'radial-gradient(circle, rgb(255 250 220 / 0.9) 0%, rgb(255 220 120 / 0.55) 30%, transparent 62%)',
        }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 1, 0.6, 1, 0.5, 0], scale: [0.4, 1.2, 0.9, 1.1, 0.9, 0.6] }}
        transition={{ duration: TEMPO_GOLPE.arma.luz / ritmo, delay: (atraso + sai) / ritmo, times: [0, 0.12, 0.35, 0.55, 0.8, 1], ease: porTrecho('easeInOut', 6) }}
        aria-hidden="true"
      />
    </>
  );
}

/**
 * A luz do belo: um clarão que cresce a partir do ouro no ar até cobrir as vítimas, com raios girando,
 * e some devagar. Quem apanha é ofuscado e apaga (`CartaAtingida`).
 */
function Luz({ de, alcance, cw, atraso, ritmo }: { de: Point; alcance: number; cw: number; atraso: number; ritmo: number }) {
  const d = Math.max(cw * 2.4, alcance * 2.3);
  const t = { duration: TEMPO_GOLPE.arma.luz / ritmo, delay: atraso / ritmo };
  const raios = d * 0.95;
  return (
    <>
      <motion.span
        className="pointer-events-none absolute z-[55] block rounded-full"
        style={{
          left: de.x - d / 2,
          top: de.y - d / 2,
          width: d,
          height: d,
          mixBlendMode: 'screen',
          background: 'radial-gradient(circle, rgb(255 244 200 / 0.95) 0%, rgb(255 214 110 / 0.7) 18%, rgb(255 190 60 / 0.3) 40%, transparent 68%)',
        }}
        initial={{ opacity: 0, scale: 0.12 }}
        animate={{ opacity: [0, 1, 0.9, 0], scale: [0.12, 0.75, 1, 1.08] }}
        transition={{ ...t, times: [0, 0.22, 0.6, 1], ease: porTrecho('easeOut', 4) }}
        aria-hidden="true"
      />
      <motion.span
        className="pointer-events-none absolute z-[56] block rounded-full"
        style={{
          left: de.x - raios / 2,
          top: de.y - raios / 2,
          width: raios,
          height: raios,
          mixBlendMode: 'screen',
          background: 'repeating-conic-gradient(from 0deg, rgb(255 230 150 / 0.7) 0deg 5deg, transparent 5deg 22deg)',
          maskImage: 'radial-gradient(circle, black 12%, transparent 66%)',
          WebkitMaskImage: 'radial-gradient(circle, black 12%, transparent 66%)',
        }}
        initial={{ opacity: 0, rotate: 0, scale: 0.3 }}
        animate={{ opacity: [0, 1, 0.8, 0], rotate: [0, 40, 70, 90], scale: [0.3, 1, 1.05, 1.1] }}
        transition={{ ...t, times: [0, 0.25, 0.65, 1], ease: porTrecho('easeOut', 4) }}
        aria-hidden="true"
      />
    </>
  );
}

/** A copa das cartas de copas: taça vermelha com a borda de ouro e o vinho dentro (viewBox 30×40). */
function DesenhoDaCopa() {
  return (
    <>
      <path d="M3 5 H27 C27 14 22 20 15 20 C8 20 3 14 3 5 Z" fill="#c8352b" stroke="#7a1d16" strokeWidth="0.8" />
      <path d="M6 9 C7 14 10 17 14 18" stroke="#f08a7e" strokeWidth="1.2" fill="none" opacity="0.7" />
      <ellipse cx="15" cy="5" rx="12" ry="2.8" fill="#5a0f1f" stroke="#e0b040" strokeWidth="1.5" />
      <rect x="13" y="20" width="4" height="10" rx="1" fill="#e0b040" stroke="#8a6a1a" strokeWidth="0.5" />
      <path d="M6.5 37 C8.5 31.5 21.5 31.5 23.5 37 Z" fill="#e0b040" stroke="#8a6a1a" strokeWidth="0.6" />
      <rect x="6.5" y="36.2" width="17" height="2.6" rx="1" fill="#3b6fb6" />
    </>
  );
}

/** O tamanho da copa que sai da carta, em larguras de carta. */
const COPA = { w: 0.55, h: 0.73 };
/** Onde a copa fica no ar: um pouco acima do meio da carta. */
function copaNoAr(de: Point, cw: number): Point {
  return { x: de.x, y: de.y - cw * CARD_RATIO * 0.14 };
}
/** Para onde a copa vira a boca para jogar o vinho na vítima `alvo`, e onde a boca fica virada. */
function viraPara(de: Point, alvo: Point, cw: number): { graus: number; boca: Point } {
  const graus = alvo.x >= de.x ? 55 : -55;
  const r = (graus * Math.PI) / 180;
  const alto = copaNoAr(de, cw);
  // A boca fica 15/40 da altura acima do meio da copa; virada, vai junto.
  const raio = cw * COPA.h * (15 / 40);
  return { graus, boca: { x: alto.x + raio * Math.sin(r), y: alto.y - raio * Math.cos(r) } };
}

/**
 * A copa da manilha de copas: sai de dentro da carta, se levanta e vira a boca para cada vítima (as
 * gotas saem dela, em `Gotas`), na hora de cada uma (`jogadas`, desde `atraso`); no fim, volta para a
 * carta.
 */
function CopaDaCarta({ de, giro, alvos, jogadas, cw, atraso, ritmo }: { de: Point; giro: number; alvos: Point[]; jogadas: number[]; cw: number; atraso: number; ritmo: number }) {
  const w = cw * COPA.w;
  const h = cw * COPA.h;
  const sai = TEMPO_GOLPE.sai.vinho;
  const alto = copaNoAr(de, cw);
  const at = (p: Point) => ({ x: p.x - w / 2, y: p.y - h / 2 });
  const ultima = jogadas[jogadas.length - 1]!;
  const quadros: { t: number; p: Point; rotate: number; scale: number }[] = [
    { t: 0, p: de, rotate: giro, scale: 0.5 },
    { t: sai * 0.3, p: de, rotate: giro, scale: 0.5 },
    { t: sai * 0.8, p: alto, rotate: 0, scale: 1 },
    ...alvos.map((a, i) => ({ t: Math.max(jogadas[i]!, sai * 0.8 + 0.02 * (i + 1)), p: alto, rotate: viraPara(de, a, cw).graus, scale: 1 })),
    { t: ultima + 0.3, p: alto, rotate: 0, scale: 1 },
    { t: ultima + 0.55, p: de, rotate: giro, scale: 0.5 },
  ];
  const total = ultima + 0.55;
  return (
    <motion.svg
      viewBox="0 0 30 40"
      width={w}
      height={h}
      className="pointer-events-none absolute left-0 top-0 z-[60] overflow-visible drop-shadow-[0_6px_5px_rgb(0_0_0/0.35)]"
      initial={{ opacity: 0, ...at(de), rotate: giro, scale: 0.5 }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: quadros.map((f) => at(f.p).x),
        y: quadros.map((f) => at(f.p).y),
        rotate: quadros.map((f) => f.rotate),
        scale: quadros.map((f) => f.scale),
      }}
      transition={{
        duration: total / ritmo,
        delay: atraso / ritmo,
        times: quadros.map((f) => f.t / total),
        ease: porTrecho('easeInOut', quadros.length),
        opacity: { duration: total / ritmo, delay: atraso / ritmo, times: [0, (sai * 0.15) / total, (ultima + 0.4) / total, 1], ease: 'linear' },
      }}
      aria-hidden="true"
    >
      <DesenhoDaCopa />
    </motion.svg>
  );
}


/**
 * Gotas de vinho atiradas em arco da boca da copa (`de`) até a vítima. Ao pousar, somem: a carta
 * atingida mostra a mancha no mesmo lugar e a leva junto quando a mão é recolhida.
 */
function Gotas({ de, alvo, cw, atraso, ritmo }: { de: Point; alvo: Point; cw: number; atraso: number; ritmo: number }) {
  const s = cw * 0.2;
  const voo = TEMPO_GOLPE.acerto.vinho;
  const total = voo + 0.02;
  return (
    <>
      {Array.from({ length: GOTAS }, (_, c) => {
        const dx = alvo.x - de.x + pouso(c, cw).x;
        const dy = alvo.y - de.y + pouso(c, cw).y;
        return (
          <motion.span
            key={c}
            className="pointer-events-none absolute z-[60] block"
            style={{ left: de.x - s / 2, top: de.y - s / 2, width: s, height: s * 1.25, ...GOTA }}
            initial={{ opacity: 0, x: 0, y: 0 }}
            animate={{ opacity: [0, 1, 1, 0], x: [0, dx * 0.5, dx, dx], y: [0, dy * 0.5 - cw * 1.1, dy, dy] }}
            transition={{
              duration: total / ritmo,
              delay: (atraso + c * TEMPO_GOLPE.cadencia) / ritmo,
              times: [0, 0.45, voo / total, 1],
              ease: porTrecho([0.3, 0.6, 0.5, 1], 4),
            }}
            aria-hidden="true"
          />
        );
      })}
    </>
  );
}

/**
 * O duelo das duas maiores: o bastão do bastião se levanta da carta para aparar o golpe e a espada
 * parte ele em dois, com um clarão e lascas voando ("a faca cortando o pau que já tava na mesa, com
 * efeitinho caprichado", o Igor, 29/09/2026). `corte`: quando a espada passa (desde `atraso`).
 */
function BastaoPartido({ alvo, cw, corte, atraso, ritmo }: { alvo: Point; cw: number; corte: number; atraso: number; ritmo: number }) {
  const w = cw * 0.6;
  const h = cw * 2.1;
  const ERGUE = 0.34;
  const VOA = 0.75;
  const comeco = Math.max(0, atraso + corte - ERGUE);
  const total = atraso + corte - comeco + VOA;
  const noCorte = (atraso + corte - comeco) / total;
  const metade = (lado: -1 | 1) => (
    <motion.svg
      viewBox={lado < 0 ? '0 0 26 48' : '0 48 26 48'}
      width={w}
      height={h / 2}
      className="pointer-events-none absolute z-[61]"
      style={{ left: alvo.x - w / 2, top: alvo.y - h * 0.62 + (lado < 0 ? 0 : h / 2) }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: [0, 0, 0, lado * cw * 1.1],
        y: [cw * 0.5, 0, 0, lado < 0 ? -cw * 1.2 : cw * 0.7],
        rotate: [-14, -14, -14, lado < 0 ? -170 : 130],
      }}
      transition={{ duration: total / ritmo, delay: comeco / ritmo, times: [0, noCorte * 0.55, noCorte, 1], ease: porTrecho([0.3, 0.7, 0.4, 1], 4) }}
      aria-hidden="true"
    >
      <DesenhoDoBastao />
    </motion.svg>
  );
  return (
    <>
      {metade(-1)}
      {metade(1)}
      <motion.span
        className="pointer-events-none absolute z-[62] block rounded-full"
        style={{
          left: alvo.x - cw * 0.8,
          top: alvo.y - cw * 1.1,
          width: cw * 1.6,
          height: cw * 1.6,
          mixBlendMode: 'screen',
          background: 'radial-gradient(circle, rgb(255 255 255 / 0.95), rgb(255 240 200 / 0.5) 35%, transparent 65%)',
        }}
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 1, 0], scale: [0.3, 1.25, 1.7] }}
        transition={{ duration: 0.38 / ritmo, delay: (atraso + corte) / ritmo, times: [0, 0.25, 1], ease: porTrecho('easeOut', 3) }}
        aria-hidden="true"
      />
      <Lascas alvo={{ x: alvo.x, y: alvo.y - cw * 0.2 }} cw={cw * 1.7} atraso={atraso + corte} ritmo={ritmo} quantas={18} />
    </>
  );
}

/** Lascas de madeira voando de onde o bastão bateu (menos quando o bastão bate em muitas). */
function Lascas({ alvo, cw, atraso, ritmo, quantas }: { alvo: Point; cw: number; atraso: number; ritmo: number; quantas: number }) {
  return (
    <>
      {Array.from({ length: quantas }, (_, i) => {
        const ang = Math.PI * 0.9 + (i / (quantas - 1)) * Math.PI * 1.2;
        const longe = cw * (0.8 + (i % 3) * 0.25);
        const tam = 5 + (i % 3) * 2;
        return (
          <motion.span
            key={i}
            className="pointer-events-none absolute z-[60] block rounded-[1px]"
            style={{ left: alvo.x - tam / 2, top: alvo.y - cw * 0.48, width: tam, height: tam * 0.6, background: i % 2 ? '#8a5733' : '#c99a5c' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [1, 1, 0], x: [0, Math.cos(ang) * longe * 0.7, Math.cos(ang) * longe], y: [0, Math.sin(ang) * longe * 0.55 - 14, Math.sin(ang) * longe * 0.55 + 10], rotate: [0, i * 90, i * 160] }}
            transition={{ duration: TEMPO_GOLPE.arma.lascas / ritmo, delay: atraso / ritmo, times: [0, 0.5, 1], ease: porTrecho([0.2, 0.8, 0.4, 1], 3) }}
            aria-hidden="true"
          />
        );
      })}
    </>
  );
}

/**
 * As armas de um golpe, por cima da mesa, saindo da carta de quem ataca. `pontoDe`: o centro da carta
 * de cada jogador na mesa; `giroDe`: quanto ela está girada; `bastiao`: quem teve o bastião partido
 * pela espada (o duelo das duas maiores tem efeito próprio); `espadasAntes`: quantos punhais o mesmo
 * sete de espadas já atirou nesta mão (cada punhal sai de uma das sete espadas da carta).
 */
export function ArmaDoGolpe({
  g,
  pontoDe,
  giroDe,
  cw,
  ritmo,
  bastiao = null,
  centro,
  espadasAntes = 0,
}: {
  g: GolpeNaMao;
  pontoDe: (playerId: string) => Point;
  giroDe: (playerId: string) => number;
  cw: number;
  ritmo: number;
  bastiao?: string | null;
  /** O meio da mesa (a largura dela é o dobro do `x`): segura o grito do bastião dentro da mesa. */
  centro: Point;
  espadasAntes?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const { inicio } = TEMPO_GOLPE;
  const sai = TEMPO_GOLPE.sai[g.golpe];
  const acerto = TEMPO_GOLPE.acerto[g.golpe];
  const passo = passoDe(g);
  const de = pontoDe(g.atacante);
  const giro = giroDe(g.atacante);
  const ordem = vitimasEmOrdem(g, (id) => pontoDe(id).x);
  const alvos = ordem.map(pontoDe);
  // Quando a arma chega em cada vítima, desde `inicio` (antes, ela sai da carta).
  const acertos = alvos.map((_, i) => sai + i * passo + acerto);
  if (g.golpe === 'corta') {
    const i = bastiao ? ordem.indexOf(bastiao) : -1;
    const alvoDoPau = i >= 0 ? alvos[i]! : null;
    return (
      <>
        <Espada de={de} giro={giro} alvos={alvos} cortes={acertos} cw={cw} atraso={inicio} ritmo={ritmo} />
        {alvoDoPau && (
          <>
            <BastaoPartido alvo={alvoDoPau} cw={cw} corte={acertos[i]!} atraso={inicio} ritmo={ritmo} />
            {/* O grito carimba o corte, em cima da carta partida (onde o olho já está), sem sair da
                mesa (125 px: metade do grito grande). */}
            <GritoManilha
              nome="Partiu o bastião"
              x={Math.min(Math.max(alvoDoPau.x, 125), 2 * centro.x - 125)}
              y={alvoDoPau.y + 22}
              ritmo={ritmo}
              atraso={inicio + acertos[i]! + 0.05}
            />
          </>
        )}
      </>
    );
  }
  if (g.golpe === 'bate') {
    const lascas = alvos.length > 3 ? 6 : 12;
    return (
      <>
        <BastaoDaCarta de={de} giro={giro} alvos={alvos} acertos={acertos} cw={cw} atraso={inicio} ritmo={ritmo} />
        {alvos.map((alvo, i) => (
          <Lascas key={i} alvo={alvo} cw={cw} atraso={inicio + acertos[i]!} ritmo={ritmo} quantas={lascas} />
        ))}
      </>
    );
  }
  if (g.golpe === 'brilha') {
    const alto = ouroNoAr(de, cw);
    const alcance = Math.max(...alvos.map((a) => Math.hypot(a.x - alto.x, a.y - alto.y)));
    return (
      <>
        <Luz de={alto} alcance={alcance} cw={cw} atraso={inicio + sai} ritmo={ritmo} />
        <OuroDaCarta de={de} giro={giro} cw={cw} atraso={inicio} ritmo={ritmo} />
      </>
    );
  }
  if (g.golpe === 'fura') {
    const k = punhaisPorVitima(alvos.length);
    const ch = cw * CARD_RATIO;
    return (
      <>
        {ordem.flatMap((id, i) =>
          Array.from({ length: k }, (_, n) => {
            const e = ESPADAS_DO_SETE[(espadasAntes + i * k + n) % ESPADAS_DO_SETE.length]!;
            // No ar, as espadas se abrem um pouco em volta da carta antes de voar.
            const alto = noDesenho({ x: de.x, y: de.y - ch * 0.1 }, giro, e.fx * 1.5, e.fy * 1.3, cw);
            const f = girar({ x: FUROS[n]!.x * cw, y: FUROS[n]!.y * cw }, giroDe(id));
            const crava = acertos[i]! + n * TEMPO_GOLPE.punhal;
            return (
              <Punhal
                key={`${i}-${n}`}
                saida={noDesenho(de, giro, e.fx, e.fy, cw)}
                ang0={e.ang + giro}
                alto={alto}
                furo={{ x: alvos[i]!.x + f.x, y: alvos[i]!.y + f.y }}
                lanca={crava - acerto}
                crava={crava}
                cw={cw}
                atraso={inicio}
                ritmo={ritmo}
              />
            );
          }),
        )}
      </>
    );
  }
  // O vinho: a copa vira a boca para cada vítima e as gotas saem dela.
  const jogadas = alvos.map((_, i) => sai + i * passo);
  return (
    <>
      <CopaDaCarta de={de} giro={giro} alvos={alvos} jogadas={jogadas} cw={cw} atraso={inicio} ritmo={ritmo} />
      {alvos.map((alvo, i) => (
        <Gotas key={i} de={viraPara(de, alvo, cw).boca} alvo={alvo} cw={cw} atraso={inicio + jogadas[i]!} ritmo={ritmo} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// A carta que apanha

/**
 * A carta que apanhou (`acerto`: quando a arma chega, em segundos). Manilha batida apanha mais feio.
 * `direcao`: para onde a carta é jogada quando furada (a direção do golpe, de quem ataca para ela).
 * A sombra vai junto com a carta (a do lugar dela na mesa ficaria parada, como um fantasma), e o
 * escuro é um véu preto por cima, mais leve para o celular do que animar `filter`.
 */
export function CartaAtingida({
  id,
  cw,
  golpe,
  manilha,
  acerto,
  ritmo,
  direcao,
  giro = 0,
  punhais = 1,
}: {
  id: CardId;
  cw: number;
  golpe: Golpe;
  manilha: boolean;
  acerto: number;
  ritmo: number;
  /** Direção do golpe (unitária), de quem ataca para esta carta. */
  direcao: Point;
  /** Quanto a carta está girada na mesa (os punhais cravam na direção da mesa, não da carta). */
  giro?: number;
  /** Quantos punhais do sete de espadas cravam nela (o último joga a carta para trás). */
  punhais?: number;
}) {
  const reduce = useReducedMotion();
  // A carta inteira fica por cima das metades até o corte (a emenda não aparece antes da hora) e sai depois.
  const [inteira, setInteira] = useState(true);
  const ch = cw * CARD_RATIO;
  const raio = cw * 0.06;
  const t = (s: number) => ({ delay: acerto / ritmo, duration: s / ritmo });
  const reacao = t(TEMPO_GOLPE.reacao[golpe]);
  const escurece = (chaves: number[], times?: number[], tempo = reacao) => (
    <motion.span
      className="pointer-events-none absolute inset-0 block"
      style={{ borderRadius: raio, background: '#000' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: chaves.map((k) => k * ESCURO) }}
      transition={{ ...tempo, times, ease: porTrecho('easeOut', chaves.length) }}
      aria-hidden="true"
    />
  );
  const clarao = (
    <motion.span
      className="pointer-events-none absolute inset-0 block bg-white"
      style={{ borderRadius: raio }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.85, 0] }}
      transition={{ ...t(0.16), times: [0, 0.2, 1], ease: porTrecho('easeOut', 3) }}
      aria-hidden="true"
    />
  );
  if (reduce) {
    return (
      <div className="relative" style={{ borderRadius: raio, boxShadow: SOMBRA_CARTA }}>
        <Card id={id} width={cw} />
        {escurece([0, golpe === 'brilha' ? 2 : 1], undefined, t(0.35))}
      </div>
    );
  }
  if (golpe === 'corta') {
    // Duas metades, cortadas na diagonal, que voam para os lados e tombam, cada uma com a sua sombra.
    const abre = cw * (manilha ? 0.46 : 0.32);
    const metade = (clip: string, lado: 1 | -1) => (
      <motion.div
        className="absolute inset-0"
        style={{ filter: 'drop-shadow(0 5px 6px rgb(0 0 0 / 0.45))' }}
        initial={{ x: 0, y: 0, rotate: 0 }}
        animate={{ x: [0, lado * abre * 1.15, lado * abre], y: [0, lado * abre * 0.55, lado * abre * 0.7 + cw * 0.08], rotate: [0, lado * 18, lado * 14] }}
        transition={{ ...reacao, times: [0, 0.45, 1], ease: porTrecho([0.2, 0.9, 0.3, 1], 3) }}
      >
        <div className="absolute inset-0" style={{ clipPath: clip }}>
          <Card id={id} width={cw} />
          {escurece([0, 1])}
        </div>
      </motion.div>
    );
    return (
      <div className="relative" style={{ width: cw, height: ch }}>
        {metade('polygon(0 0, 100% 0, 100% 36%, 0 64%)', -1)}
        {metade('polygon(0 64%, 100% 36%, 100% 100%, 0 100%)', 1)}
        {inteira && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ delay: acerto / ritmo, duration: 0.01 }}
            onAnimationComplete={() => setInteira(false)}
          >
            <Card id={id} width={cw} />
          </motion.div>
        )}
        <motion.span
          className="pointer-events-none absolute left-[-50%] top-1/2 block h-[5px] w-[200%] rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, #fff 25%, #fff 75%, transparent)', boxShadow: '0 0 14px 3px #cfe0ff', rotate: -21, originX: 0.5 }}
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: [0, 1, 0], scaleX: [0, 1.1, 1.2] }}
          transition={{ ...t(0.36), times: [0, 0.35, 1], ease: porTrecho('easeOut', 3) }}
          aria-hidden="true"
        />
      </div>
    );
  }
  if (golpe === 'bate') {
    // Amassa com a pancada, pula e fica torta, rachada (a manilha racha em dois lugares).
    return (
      <motion.div
        className="relative"
        style={{ originY: 1, borderRadius: raio, boxShadow: SOMBRA_CARTA }}
        initial={{ scaleX: 1, scaleY: 1, y: 0, rotate: 0 }}
        animate={{ scaleX: [1, 1.26, 0.9, 1.04, 1], scaleY: [1, 0.55, 1.12, 0.94, 1], y: [0, cw * 0.18, -cw * 0.12, cw * 0.1, cw * 0.12], rotate: [0, 11, 5, 9, 8] }}
        transition={{ ...reacao, times: [0, 0.18, 0.45, 0.75, 1] }}
      >
        <Card id={id} width={cw} />
        {escurece([0, 0, 1, 1], [0, 0.3, 0.7, 1])}
        <motion.svg viewBox="0 0 62 99" className="pointer-events-none absolute inset-0 h-full w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t(0.08)} aria-hidden="true">
          <path d="M30 0 L26 22 L34 38 L24 60 L31 76 L27 99" stroke="#2b1d14" strokeWidth="1.8" fill="none" opacity=".8" />
          <path d="M34 38 L48 46 M24 60 L10 66" stroke="#2b1d14" strokeWidth="1.3" fill="none" opacity=".65" />
          {manilha && <path d="M0 30 L14 34 L20 28 L36 41 L50 36 L62 44" stroke="#2b1d14" strokeWidth="1.6" fill="none" opacity=".75" />}
        </motion.svg>
        {clarao}
      </motion.div>
    );
  }
  if (golpe === 'fura') {
    // Os punhais cravam um a um (furo, rachaduras e o cabo para fora, balançando); o último joga a carta
    // para trás, girando, com todos espetados nela.
    const empurra = cw * 0.3;
    const gira = direcao.x >= 0 ? 12 : -12;
    const ultimo = acerto + (punhais - 1) * TEMPO_GOLPE.punhal;
    const angulo = (Math.atan2(direcao.y, direcao.x) * 180) / Math.PI - giro;
    const L = cw * PUNHAL;
    return (
      <motion.div
        className="relative"
        style={{ borderRadius: raio, boxShadow: SOMBRA_CARTA }}
        initial={{ x: 0, y: 0, rotate: 0 }}
        animate={{ x: [0, direcao.x * empurra, direcao.x * empurra * 0.7], y: [0, direcao.y * empurra, direcao.y * empurra * 0.7], rotate: [0, gira, gira * 0.7] }}
        transition={{ delay: ultimo / ritmo, duration: TEMPO_GOLPE.reacao.fura / ritmo, times: [0, 0.3, 1], ease: porTrecho([0.2, 0.9, 0.3, 1], 3) }}
      >
        <Card id={id} width={cw} />
        {escurece([0, 0, 1, 1], [0, 0.25, 0.55, 1])}
        {Array.from({ length: punhais }, (_, n) => {
          const furo = FUROS[n % FUROS.length]!;
          const hx = cw / 2 + furo.x * cw;
          const hy = ch / 2 + furo.y * cw;
          const quando = { delay: (acerto + n * TEMPO_GOLPE.punhal) / ritmo };
          return (
            <Fragment key={n}>
              <motion.svg
                viewBox="0 0 18 18"
                className="pointer-events-none absolute"
                style={{ left: hx - cw * 0.22, top: hy - cw * 0.22, width: cw * 0.44, height: cw * 0.44 }}
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...quando, duration: 0.1 / ritmo }}
                aria-hidden="true"
              >
                <circle cx="9" cy="9" r="3.2" fill="#1d120b" />
                <path d="M9 5.4 L8 0.3 M12.4 9.5 L17.8 8 M8.2 12.6 L6.4 17.8 M5.6 8.2 L0.4 6.8 M11.6 6.2 L15.4 2.4 M6.4 11.8 L2.6 15.2" stroke="#2b1d14" strokeWidth="1.1" />
              </motion.svg>
              {/* O punhal cravado: o cabo e quase toda a lâmina para fora; a ponta ficou dentro da carta. */}
              <motion.svg
                viewBox={`0 0 ${96 * PUNHAL_PRA_FORA} 14`}
                width={L * PUNHAL_PRA_FORA}
                height={L * PUNHAL_GROSSO}
                className="pointer-events-none absolute overflow-visible drop-shadow-[0_3px_2px_rgb(0_0_0/0.45)]"
                style={{ left: hx - L * PUNHAL_PRA_FORA, top: hy - (L * PUNHAL_GROSSO) / 2, transformOrigin: '100% 50%' }}
                initial={{ opacity: 0, rotate: angulo }}
                animate={{ opacity: 1, rotate: [angulo - 7, angulo + 5, angulo - 2, angulo] }}
                transition={{ ...quando, duration: 0.3 / ritmo, ease: 'easeOut', opacity: { ...quando, duration: 0.01 } }}
                aria-hidden="true"
              >
                <DesenhoDoPunhal />
              </motion.svg>
            </Fragment>
          );
        })}
        {clarao}
      </motion.div>
    );
  }
  if (golpe === 'brilha') {
    // O ouro acende e esta é ofuscada e apaga: pisca como lampião no vento e fica no escuro.
    return (
      <motion.div
        className="relative"
        style={{ borderRadius: raio, boxShadow: SOMBRA_CARTA }}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.04, 0.96, 0.97] }}
        transition={{ ...reacao, times: [0, 0.2, 0.6, 1] }}
      >
        <Card id={id} width={cw} />
        {escurece([0, 2.2, 0.7, 2.4, 2.1], [0, 0.22, 0.42, 0.7, 1])}
        {/* Ofuscada: a luz do ouro bate nela de chapa antes de ela apagar. */}
        <motion.span
          className="pointer-events-none absolute inset-0 block"
          style={{ borderRadius: raio, background: 'radial-gradient(circle, #fffdf0, #ffeeb0 55%, #ffd66e)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.95, 0] }}
          transition={{ ...t(0.34), times: [0, 0.22, 1], ease: porTrecho('easeOut', 3) }}
          aria-hidden="true"
        />
      </motion.div>
    );
  }
  // Vinho: a carta tomba para trás, encharcada, e fica manchada.
  return (
    <motion.div
      className="relative"
      style={{ borderRadius: raio, boxShadow: SOMBRA_CARTA }}
      initial={{ y: 0, rotate: 0 }}
      animate={{ y: [0, -cw * 0.1, cw * 0.05], rotate: [0, -9, -6] }}
      transition={{ ...reacao, times: [0, 0.35, 1] }}
    >
      <Card id={id} width={cw} />
      {escurece([0, 0, 1], [0, 0.35, 1])}
      <motion.span
        className="pointer-events-none absolute inset-0 block"
        style={{ borderRadius: raio, background: MANCHA, mixBlendMode: 'multiply' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.28 }}
        transition={t(0.3)}
        aria-hidden="true"
      />
      <motion.svg
        viewBox="0 0 40 30"
        className="pointer-events-none absolute"
        style={{ left: cw * 0.08, top: ch / 2 - cw * 0.05, width: cw * 0.84, height: cw * 0.63, mixBlendMode: 'multiply' }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...t(0.22), ease: 'easeOut' }}
        aria-hidden="true"
      >
        {/* Mancha de vinho no papel: clara por dentro e com a borda mais escura, onde o vinho seca. */}
        <path
          d="M20 3 C27 2 33 6 34 12 C38 13 39 18 35 21 C33 27 25 28 20 26 C14 29 7 27 6 21 C2 19 2 13 7 11 C8 5 14 3 20 3 Z"
          fill={MANCHA}
          fillOpacity="0.55"
          stroke={MANCHA_BORDA}
          strokeOpacity="0.8"
          strokeWidth="1.2"
        />
        <circle cx="37" cy="5" r="1.8" fill={MANCHA_BORDA} fillOpacity="0.7" />
        <circle cx="3" cy="26" r="1.4" fill={MANCHA_BORDA} fillOpacity="0.7" />
        <circle cx="31" cy="28.5" r="1.1" fill={MANCHA_BORDA} fillOpacity="0.7" />
      </motion.svg>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------------
// O grito

/**
 * O grito da mesa em cima da carta. Grande ("Espadão!") para a manilha que passa a mandar, que entra
 * batendo; pequeno e apagado para a que chega depois de uma mais forte. Some antes de a mão sair.
 */
export function GritoManilha({
  nome,
  x,
  y,
  pequeno = false,
  ritmo = 1,
  atraso = 0.18,
}: {
  nome: string;
  x: number;
  y: number;
  pequeno?: boolean;
  ritmo?: number;
  /** Quando entra (segundos desde que a carta caiu, no ritmo normal). */
  atraso?: number;
}) {
  const reduce = useReducedMotion();
  const DURA = TEMPO_GOLPE.grito;
  return (
    <motion.span
      aria-hidden="true"
      className={`pointer-events-none absolute z-[60] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-noite/85 px-3 py-0.5 font-hand font-bold leading-tight shadow-lg ${
        pequeno ? 'text-lg text-papel/80 ring-1 ring-papel/20' : 'text-3xl text-ouros ring-2 ring-ouros/60'
      }`}
      style={{ left: x, top: y }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.3, y: 10, rotate: -10 }}
      animate={
        reduce
          ? { opacity: [0, 1, 1, 0] }
          : { opacity: [0, 1, 1, 0], scale: pequeno ? [0.5, 1.1, 1, 0.96] : [0.3, 1.4, 1, 0.96], y: [10, -6, -8, -14], rotate: pequeno ? [0, 0, 0, 0] : [-10, 4, 0, 0] }
      }
      transition={{ duration: DURA / ritmo, times: [0, 0.14, 0.75, 1], delay: atraso / ritmo, ease: porTrecho('easeOut', 4) }}
    >
      {pequeno ? nome : `${nome}!`}
    </motion.span>
  );
}
