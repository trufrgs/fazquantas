import type { CardId } from '@fodinha/engine';
import { motion, useReducedMotion, type Easing } from 'motion/react';
import { Fragment, useState, type CSSProperties } from 'react';
import { Card, CARD_RATIO } from '../cards/Card';
import { passoDe, TEMPO_GOLPE, vitimasEmOrdem, type Golpe, type GolpeNaMao } from './manilhas';
import type { Point } from './layout';

/**
 * As peças de "Quem mata quem": as armas que atravessam a mesa (`ArmaDoGolpe`), a carta que apanha
 * (`CartaAtingida`) e o grito da manilha (`GritoManilha`). Tudo em segundos no ritmo normal, dividido
 * por `ritmo` (o fim da mão fica menos tempo na mesa nos ritmos rápidos). Com "reduzir movimento",
 * nada voa: a carta que apanha só escurece.
 *
 * Drástico de propósito ("tá muito educadinho", o Igor, 29/09/2026): a carta cortada voa em dois
 * pedaços, a do bastão amassa e racha, a furada é jogada para trás, o belo acende a mesa e apaga as
 * outras; a mesa treme a cada pancada (`TrickArea`).
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
// As armas

/**
 * A espada do espadão: atravessa a mesa da esquerda para a direita, e o fio passa por cada vítima
 * (`alvos`, nessa ordem) na hora do corte dela (`cortes`, em segundos desde o começo do golpe).
 */
function Espada({ alvos, cortes, cw, atraso, ritmo }: { alvos: Point[]; cortes: number[]; cw: number; atraso: number; ritmo: number }) {
  const comp = cw * 3.2;
  const alt = cw * 0.26;
  const eixo = alt * 1.4; // o punho, onde a espada gira
  const fio = comp * 0.6 - eixo; // do punho até o ponto da lâmina que corta
  // Onde a espada fica para o ponto que corta cair em `p`, inclinada `graus`.
  const pose = (p: Point, graus: number) => {
    const r = (graus * Math.PI) / 180;
    return { x: p.x - eixo - fio * Math.cos(r), y: p.y - alt / 2 - fio * Math.sin(r), rotate: graus };
  };
  const n = alvos.length;
  const primeiro = alvos[0]!;
  const ultimo = alvos[n - 1]!;
  const poses = [
    pose({ x: primeiro.x - cw * 1.5, y: primeiro.y - cw * 0.9 }, -55),
    // No corte, a lâmina acompanha o risco na carta (uns -21°), abrindo um pouco de uma vítima para a outra.
    ...alvos.map((p, i) => pose(p, -26 + (n > 1 ? (10 * i) / (n - 1) : 5))),
    pose({ x: ultimo.x + cw * 1.4, y: ultimo.y + cw * 0.7 }, 20),
  ];
  const total = cortes[n - 1]! + TEMPO_GOLPE.arma.depoisDoCorte;
  // Acelera até o primeiro corte, passa reto pelas vítimas e freia depois do último.
  const ease: Easing[] = ['easeIn', ...cortes.slice(1).map((): Easing => 'linear'), 'easeOut'];
  return (
    <motion.svg
      viewBox="0 0 180 14"
      width={comp}
      height={alt}
      className="pointer-events-none absolute left-0 top-0 z-[60] overflow-visible drop-shadow-[0_0_6px_rgb(207_224_255/0.9)]"
      style={{ transformOrigin: `${eixo}px 50%` }}
      initial={{ opacity: 0, ...poses[0] }}
      animate={{ opacity: [0, 1, 1, 0], x: poses.map((q) => q.x), y: poses.map((q) => q.y), rotate: poses.map((q) => q.rotate) }}
      transition={{
        duration: total / ritmo,
        delay: atraso / ritmo,
        times: [0, ...cortes.map((c) => c / total), 1],
        ease,
        opacity: { duration: total / ritmo, delay: atraso / ritmo, times: [0, (cortes[0]! * 0.4) / total, cortes[n - 1]! / total, 1], ease: 'linear' },
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

/** O bastão do bastião: aparece erguido em cima da carta e desce nela com tudo (chega no fim da descida). */
function Bastao({ alvo, cw, atraso, ritmo }: { alvo: Point; cw: number; atraso: number; ritmo: number }) {
  const w = cw * 0.5;
  const h = cw * 1.85;
  return (
    <motion.svg
      viewBox="0 0 26 96"
      width={w}
      height={h}
      className="pointer-events-none absolute z-[60]"
      style={{ left: alvo.x + cw * 0.04, top: alvo.y - h * 0.96, transformOrigin: '50% 100%' }}
      initial={{ opacity: 0, rotate: 70, x: cw * 0.16, y: -cw * 0.2 }}
      animate={{ opacity: [0, 1, 1, 1, 0], rotate: [70, 70, -10, -4, 14], x: [cw * 0.16, cw * 0.16, -cw * 0.15, -cw * 0.15, -cw * 0.15], y: [-cw * 0.2, -cw * 0.2, cw * 0.52, cw * 0.44, cw * 0.28] }}
      transition={{ duration: TEMPO_GOLPE.arma.bastao / ritmo, delay: atraso / ritmo, times: [0, 0.3, 0.55, 0.8, 1], ease: porTrecho([0.55, 0, 0.9, 0.45], 5) }}
      aria-hidden="true"
    >
      <path d="M10 94 C8 74 6 44 7 24 C7 11 10 3 13 2 C17 3 20 11 19 24 C20 44 18 74 16 94 Z" fill="#5e8f3a" stroke="#2f5220" strokeWidth="1.3" />
      <path d="M8 32 q-6 -3 -7 -9 M18 46 q7 -2 8 -8 M8 60 q-6 -1 -7 -6" stroke="#2f5220" strokeWidth="1.6" fill="none" />
    </motion.svg>
  );
}

/** A espada fina do sete de espadas: sai da carta dele e a ponta vai até o meio da vítima. */
function Florete({ de, alvo, cw, atraso, ritmo }: { de: Point; alvo: Point; cw: number; atraso: number; ritmo: number }) {
  const h = cw * 0.18;
  const dist = Math.hypot(alvo.x - de.x, alvo.y - de.y);
  const ang = (Math.atan2(alvo.y - de.y, alvo.x - de.x) * 180) / Math.PI;
  // Na mesa cheia as cartas ficam perto: a lâmina encolhe para caber, e a estocada sempre avança.
  const w = Math.min(cw * 1.7, Math.max(cw * 0.8, dist * 0.85));
  const ida = dist + cw * 0.1 - w;
  const volta = Math.min(-cw * 0.2, ida - cw * 0.45);
  return (
    <motion.div className="pointer-events-none absolute z-[60]" style={{ left: de.x, top: de.y - h / 2, rotate: ang, transformOrigin: '0 50%' }} aria-hidden="true">
      <motion.svg
        viewBox="0 0 96 10"
        width={w}
        height={h}
        className="block"
        initial={{ opacity: 0, x: volta }}
        animate={{ opacity: [0, 1, 1, 1, 0], x: [volta, volta + cw * 0.04, ida, ida - cw * 0.08, volta + cw * 0.06] }}
        transition={{ duration: TEMPO_GOLPE.arma.florete / ritmo, delay: atraso / ritmo, times: [0, 0.35, 0.6, 0.75, 1], ease: porTrecho([0.7, 0, 0.3, 1], 5) }}
      >
        <rect x="0" y="3.5" width="14" height="3" rx="1.5" fill="#7a4a2a" />
        <rect x="13" y="0" width="4" height="10" rx="1.5" fill="#c9a24a" />
        <path d="M17 4 L90 4.6 L96 5 L90 5.4 L17 6 Z" fill="#dfe8f5" stroke="#6f86a8" strokeWidth=".5" />
      </motion.svg>
    </motion.div>
  );
}

/**
 * A luz do belo: o sete belo acende como ouro, um clarão que cresce a partir dele até cobrir as
 * vítimas, com raios girando, e some devagar. Quem apanha apaga (`CartaAtingida`).
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

/**
 * Gotas de vinho atiradas em arco da manilha de copas até a vítima. Ao pousar, somem: a carta
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

/** As armas de um golpe, por cima da mesa. `pontoDe`: o centro da carta de cada jogador na mesa. */
export function ArmaDoGolpe({ g, pontoDe, cw, ritmo }: { g: GolpeNaMao; pontoDe: (playerId: string) => Point; cw: number; ritmo: number }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const passo = passoDe(g);
  const de = pontoDe(g.atacante);
  const alvos = vitimasEmOrdem(g, (id) => pontoDe(id).x).map(pontoDe);
  if (g.golpe === 'corta') {
    const cortes = alvos.map((_, i) => TEMPO_GOLPE.acerto.corta + i * passo);
    return <Espada alvos={alvos} cortes={cortes} cw={cw} atraso={TEMPO_GOLPE.inicio} ritmo={ritmo} />;
  }
  if (g.golpe === 'brilha') {
    const alcance = Math.max(...alvos.map((a) => Math.hypot(a.x - de.x, a.y - de.y)));
    return <Luz de={de} alcance={alcance} cw={cw} atraso={TEMPO_GOLPE.inicio} ritmo={ritmo} />;
  }
  const lascas = alvos.length > 3 ? 6 : 12;
  return (
    <>
      {alvos.map((alvo, i) => {
        const atraso = TEMPO_GOLPE.inicio + i * passo;
        if (g.golpe === 'bate')
          return (
            <Fragment key={i}>
              <Bastao alvo={alvo} cw={cw} atraso={atraso} ritmo={ritmo} />
              <Lascas alvo={alvo} cw={cw} atraso={atraso + TEMPO_GOLPE.acerto.bate} ritmo={ritmo} quantas={lascas} />
            </Fragment>
          );
        if (g.golpe === 'fura') return <Florete key={i} de={de} alvo={alvo} cw={cw} atraso={atraso} ritmo={ritmo} />;
        return <Gotas key={i} de={de} alvo={alvo} cw={cw} atraso={atraso} ritmo={ritmo} />;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// A carta que apanha

/**
 * A carta que apanhou (`acerto`: quando a arma chega, em segundos). Manilha batida apanha mais feio.
 * `de`: para onde a carta é jogada quando furada (a direção do golpe, de quem ataca para ela).
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
}: {
  id: CardId;
  cw: number;
  golpe: Golpe;
  manilha: boolean;
  acerto: number;
  ritmo: number;
  /** Direção do golpe (unitária), de quem ataca para esta carta. */
  direcao: Point;
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
    // A estocada joga a carta para trás, girando, com o furo e as rachaduras em volta.
    const empurra = cw * 0.3;
    const gira = direcao.x >= 0 ? 12 : -12;
    return (
      <motion.div
        className="relative"
        style={{ borderRadius: raio, boxShadow: SOMBRA_CARTA }}
        initial={{ x: 0, y: 0, rotate: 0 }}
        animate={{ x: [0, direcao.x * empurra, direcao.x * empurra * 0.7], y: [0, direcao.y * empurra, direcao.y * empurra * 0.7], rotate: [0, gira, gira * 0.7] }}
        transition={{ ...reacao, times: [0, 0.3, 1], ease: porTrecho([0.2, 0.9, 0.3, 1], 3) }}
      >
        <Card id={id} width={cw} />
        {escurece([0, 0, 1, 1], [0, 0.25, 0.55, 1])}
        <motion.svg
          viewBox="0 0 18 18"
          className="pointer-events-none absolute"
          style={{ left: '28%', top: '32%', width: cw * 0.44, height: cw * 0.44 }}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={t(0.1)}
          aria-hidden="true"
        >
          <circle cx="9" cy="9" r="3.6" fill="#1d120b" />
          <path d="M9 5.4 L8 0.3 M12.4 9.5 L17.8 8 M8.2 12.6 L6.4 17.8 M5.6 8.2 L0.4 6.8 M11.6 6.2 L15.4 2.4 M6.4 11.8 L2.6 15.2" stroke="#2b1d14" strokeWidth="1.1" />
        </motion.svg>
        {clarao}
      </motion.div>
    );
  }
  if (golpe === 'brilha') {
    // O belo acende e esta apaga: pisca como lampião no vento e fica no escuro.
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
export function GritoManilha({ nome, x, y, pequeno = false, ritmo = 1 }: { nome: string; x: number; y: number; pequeno?: boolean; ritmo?: number }) {
  const reduce = useReducedMotion();
  const POUSO = 0.18;
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
      transition={{ duration: DURA / ritmo, times: [0, 0.14, 0.75, 1], delay: POUSO / ritmo, ease: porTrecho('easeOut', 4) }}
    >
      {pequeno ? nome : `${nome}!`}
    </motion.span>
  );
}
