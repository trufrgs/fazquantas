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
 * As curvas vão por trecho (`porTrecho`): a opacidade roda no navegador (WAAPI), que aplicaria uma
 * curva só à animação inteira, e a posição roda trecho a trecho; assim as duas andam juntas.
 */

const porTrecho = (ease: Easing, chaves: number): Easing[] => Array.from({ length: chaves - 1 }, () => ease);

/** A sombra de uma carta na mesa. A carta que apanha leva a sombra junto quando se mexe. */
export const SOMBRA_CARTA = '0 6px 14px rgb(0 0 0 / 0.45)';

/** O escuro por cima da carta que apanhou: preto com esta opacidade dá o mesmo que `brightness(0.78)`. */
const ESCURO = 0.22;

/** Onde a moeda (ou a gota de vinho) `c` pousa, a partir do centro da carta atingida. */
const pouso = (c: number, cw: number) => ({ x: (c - 1) * cw * 0.15, y: cw * 0.26 + (c % 2) * cw * 0.1 });
const tamanhoDoArremesso = (cw: number, vinho: boolean) => cw * (vinho ? 0.2 : 0.29);
const MANCHA = '#b02a48';
const MANCHA_BORDA = '#6d0f1f';

/** A moeda de ouro (ou a gota de vinho) do tamanho `s`: a que voa e a que fica na carta são iguais. */
const estiloDoArremesso = (s: number, vinho: boolean): CSSProperties => ({
  width: s,
  height: vinho ? s * 1.25 : s,
  borderRadius: vinho ? '50% 50% 50% 50% / 60% 60% 40% 40%' : '50%',
  background: vinho ? '#b3261e' : 'radial-gradient(circle at 40% 35%, #fff2b8, #e3a82b 55%, #a8741a)',
  boxShadow: vinho ? 'inset -1px -1px 0 rgb(0 0 0 / .25)' : 'inset 0 0 0 2px rgb(168 116 26 / .9), 0 2px 4px rgb(0 0 0 / .35)',
});

// ---------------------------------------------------------------------------------------------------
// As armas

/**
 * A espada do espadão: atravessa a mesa da esquerda para a direita, e o fio passa por cada vítima
 * (`alvos`, nessa ordem) na hora do corte dela (`cortes`, em segundos desde o começo do golpe).
 */
function Espada({ alvos, cortes, cw, atraso, ritmo }: { alvos: Point[]; cortes: number[]; cw: number; atraso: number; ritmo: number }) {
  const comp = cw * 2.9;
  const alt = cw * 0.23;
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
    pose({ x: primeiro.x - cw * 1.3, y: primeiro.y - cw * 0.7 }, -48),
    // No corte, a lâmina acompanha o risco na carta (uns -21°), abrindo um pouco de uma vítima para a outra.
    ...alvos.map((p, i) => pose(p, -26 + (n > 1 ? (10 * i) / (n - 1) : 5))),
    pose({ x: ultimo.x + cw * 1.2, y: ultimo.y + cw * 0.5 }, 12),
  ];
  const total = cortes[n - 1]! + TEMPO_GOLPE.arma.depoisDoCorte;
  // Acelera até o primeiro corte, passa reto pelas vítimas e freia depois do último.
  const ease: Easing[] = ['easeIn', ...cortes.slice(1).map((): Easing => 'linear'), 'easeOut'];
  return (
    <motion.svg
      viewBox="0 0 180 14"
      width={comp}
      height={alt}
      className="pointer-events-none absolute left-0 top-0 z-[60] overflow-visible"
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

/** O bastão do bastião: aparece erguido em cima da carta e desce nela (chega no fim da descida). */
function Bastao({ alvo, cw, atraso, ritmo }: { alvo: Point; cw: number; atraso: number; ritmo: number }) {
  const w = cw * 0.42;
  const h = cw * 1.55;
  return (
    <motion.svg
      viewBox="0 0 26 96"
      width={w}
      height={h}
      className="pointer-events-none absolute z-[60]"
      style={{ left: alvo.x + cw * 0.06, top: alvo.y - h * 0.96, transformOrigin: '50% 100%' }}
      initial={{ opacity: 0, rotate: 58, x: cw * 0.13, y: -cw * 0.1 }}
      animate={{ opacity: [0, 1, 1, 1, 0], rotate: [58, 58, -8, -4, 10], x: [cw * 0.13, cw * 0.13, -cw * 0.13, -cw * 0.13, -cw * 0.13], y: [-cw * 0.1, -cw * 0.1, cw * 0.48, cw * 0.42, cw * 0.29] }}
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
  const h = cw * 0.16;
  const dist = Math.hypot(alvo.x - de.x, alvo.y - de.y);
  const ang = (Math.atan2(alvo.y - de.y, alvo.x - de.x) * 180) / Math.PI;
  // Na mesa cheia as cartas ficam perto: a lâmina encolhe para caber, e a estocada sempre avança.
  const w = Math.min(cw * 1.55, Math.max(cw * 0.8, dist * 0.85));
  const ida = dist + cw * 0.04 - w;
  const volta = Math.min(-cw * 0.16, ida - cw * 0.35);
  return (
    <motion.div className="pointer-events-none absolute z-[60]" style={{ left: de.x, top: de.y - h / 2, rotate: ang, transformOrigin: '0 50%' }} aria-hidden="true">
      <motion.svg
        viewBox="0 0 96 10"
        width={w}
        height={h}
        className="block"
        initial={{ opacity: 0, x: volta }}
        animate={{ opacity: [0, 1, 1, 1, 0], x: [volta, volta + cw * 0.06, ida, ida - cw * 0.06, volta + cw * 0.06] }}
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
 * Moedas de ouro (ou gotas de vinho) atiradas em arco da manilha até a vítima. Ao pousar, somem: a
 * carta atingida mostra as dela no mesmo lugar e as leva junto quando a mão é recolhida.
 */
function Arremesso({ de, alvo, cw, atraso, ritmo, vinho }: { de: Point; alvo: Point; cw: number; atraso: number; ritmo: number; vinho: boolean }) {
  const s = tamanhoDoArremesso(cw, vinho);
  const voo = TEMPO_GOLPE.acerto[vinho ? 'vinho' : 'moedas'];
  const total = voo + 0.02;
  return (
    <>
      {[0, 1, 2].map((c) => {
        const dx = alvo.x - de.x + pouso(c, cw).x;
        const dy = alvo.y - de.y + pouso(c, cw).y;
        return (
          <motion.span
            key={c}
            className="pointer-events-none absolute z-[60] block"
            style={{ left: de.x - s / 2, top: de.y - s / 2, ...estiloDoArremesso(s, vinho) }}
            initial={{ opacity: 0, x: 0, y: 0 }}
            animate={{ opacity: [0, 1, 1, 0], x: [0, dx * 0.5, dx, dx], y: [0, dy * 0.5 - cw, dy, dy], ...(vinho ? {} : { scaleX: [1, -1, 1, 1] }) }}
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

/** Lascas de madeira saindo de onde o bastão bateu (menos quando o bastão bate em muitas). */
function Lascas({ alvo, cw, atraso, ritmo, quantas }: { alvo: Point; cw: number; atraso: number; ritmo: number; quantas: number }) {
  return (
    <>
      {Array.from({ length: quantas }, (_, i) => {
        const ang = Math.PI + (i / (quantas - 1)) * Math.PI;
        return (
          <motion.span
            key={i}
            className="pointer-events-none absolute z-[60] block rounded-[1px]"
            style={{ left: alvo.x - 3, top: alvo.y - cw * 0.48, width: 6, height: 4, background: i % 2 ? '#8a5733' : '#c99a5c' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [1, 0], x: [0, Math.cos(ang) * cw * 0.74], y: [0, Math.sin(ang) * cw * 0.48 - 8], rotate: [0, i * 70] }}
            transition={{ duration: TEMPO_GOLPE.arma.lascas / ritmo, delay: atraso / ritmo, ease: [0.2, 0.8, 0.4, 1] }}
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
  const lascas = alvos.length > 3 ? 5 : 8;
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
        return <Arremesso key={i} de={de} alvo={alvo} cw={cw} atraso={atraso} ritmo={ritmo} vinho={g.golpe === 'vinho'} />;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// A carta que apanha

/**
 * A carta que apanhou (`acerto`: quando a arma chega, em segundos). Manilha batida apanha mais feio.
 * A sombra vai junto com a carta (a do lugar dela na mesa ficaria parada, como um fantasma), e o
 * escuro é um véu preto por cima, mais leve para o celular do que animar `filter`.
 */
export function CartaAtingida({ id, cw, golpe, manilha, acerto, ritmo }: { id: CardId; cw: number; golpe: Golpe; manilha: boolean; acerto: number; ritmo: number }) {
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
  if (reduce) {
    return (
      <div className="relative" style={{ borderRadius: raio, boxShadow: SOMBRA_CARTA }}>
        <Card id={id} width={cw} />
        {escurece([0, 1], undefined, t(0.35))}
      </div>
    );
  }
  if (golpe === 'corta') {
    // Duas metades, cortadas na diagonal, que se afastam, cada uma com a sua sombra.
    const abre = cw * (manilha ? 0.15 : 0.08);
    const metade = (clip: string, lado: 1 | -1) => (
      <motion.div
        className="absolute inset-0"
        style={{ filter: 'drop-shadow(0 4px 5px rgb(0 0 0 / 0.4))' }}
        initial={{ x: 0, y: 0, rotate: 0 }}
        animate={{ x: lado * abre, y: lado * abre * 0.8, rotate: lado * 4 }}
        transition={{ ...reacao, ease: [0.2, 0.9, 0.3, 1] }}
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
          className="pointer-events-none absolute left-[-24%] top-1/2 block h-[3px] w-[148%] rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, #fff 30%, #fff 70%, transparent)', boxShadow: '0 0 8px #cfe0ff', rotate: -21, originX: 0.5 }}
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: [0, 1, 0], scaleX: [0, 1.1, 1.1] }}
          transition={{ ...t(0.3), times: [0, 0.5, 1], ease: porTrecho('easeOut', 3) }}
          aria-hidden="true"
        />
      </div>
    );
  }
  if (golpe === 'bate') {
    return (
      <motion.div
        className="relative"
        style={{ originY: 1, borderRadius: raio, boxShadow: SOMBRA_CARTA }}
        initial={{ scaleX: 1, scaleY: 1, y: 0, rotate: 0 }}
        animate={{ scaleX: [1, 1.08, 0.98, 1], scaleY: [1, 0.82, 1.02, 1], y: [0, cw * 0.1, cw * 0.08, cw * 0.065], rotate: [0, 5, 5, 5] }}
        transition={{ ...reacao, times: [0, 0.3, 0.7, 1] }}
      >
        <Card id={id} width={cw} />
        {escurece([0, 0, 1, 1], [0, 0.3, 0.7, 1])}
        {manilha && (
          <motion.svg viewBox="0 0 62 99" className="pointer-events-none absolute inset-0 h-full w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t(0.12)} aria-hidden="true">
            <path d="M30 0 L26 22 L34 38 L24 60 L31 76 L27 99" stroke="#2b1d14" strokeWidth="1.6" fill="none" opacity=".75" />
            <path d="M34 38 L48 46 M24 60 L10 66" stroke="#2b1d14" strokeWidth="1.2" fill="none" opacity=".6" />
          </motion.svg>
        )}
      </motion.div>
    );
  }
  if (golpe === 'fura') {
    return (
      <motion.div
        className="relative"
        style={{ borderRadius: raio, boxShadow: SOMBRA_CARTA }}
        initial={{ x: 0, rotate: 0 }}
        animate={{ x: [0, cw * 0.05, -cw * 0.03, 0], rotate: [0, 2, -1, 0] }}
        transition={{ ...reacao, times: [0, 0.25, 0.55, 1] }}
      >
        <Card id={id} width={cw} />
        {escurece([0, 0, 1, 1], [0, 0.25, 0.55, 1])}
        <motion.svg
          viewBox="0 0 18 18"
          className="pointer-events-none absolute"
          style={{ left: '35%', top: '38%', width: cw * 0.29, height: cw * 0.29 }}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={t(0.12)}
          aria-hidden="true"
        >
          <circle cx="9" cy="9" r="3.2" fill="#1d120b" />
          <path d="M9 5.8 L8 0.5 M12 9.5 L17.5 8 M8.2 12 L6.5 17.5 M6 8.2 L0.8 6.8" stroke="#2b1d14" strokeWidth="1.1" />
        </motion.svg>
      </motion.div>
    );
  }
  // Moedas: a carta tomba para trás e fica com as moedas em cima, onde pousaram (e elas seguem
  // brilhando: o escuro fica embaixo delas). Vinho: a carta fica manchada.
  const vinho = golpe === 'vinho';
  const s = tamanhoDoArremesso(cw, vinho);
  return (
    <motion.div
      className="relative"
      style={{ borderRadius: raio, boxShadow: SOMBRA_CARTA }}
      initial={{ y: 0, rotate: 0 }}
      animate={{ y: [0, -cw * 0.06, cw * 0.03], rotate: [0, -5, -3] }}
      transition={{ ...reacao, times: [0, 0.35, 1] }}
    >
      <Card id={id} width={cw} />
      {escurece([0, 0, 1], [0, 0.35, 1])}
      {vinho ? (
        <motion.svg
          viewBox="0 0 40 30"
          className="pointer-events-none absolute"
          style={{ left: cw * 0.19, top: ch / 2 + cw * 0.08, width: cw * 0.62, height: cw * 0.465, mixBlendMode: 'multiply' }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...t(0.22), ease: 'easeOut' }}
          aria-hidden="true"
        >
          {/* Mancha de vinho no papel: clara por dentro e com a borda mais escura, onde o vinho seca. */}
          <path
            d="M20 3 C27 2 33 6 34 12 C38 13 39 18 35 21 C33 27 25 28 20 26 C14 29 7 27 6 21 C2 19 2 13 7 11 C8 5 14 3 20 3 Z"
            fill={MANCHA}
            fillOpacity="0.5"
            stroke={MANCHA_BORDA}
            strokeOpacity="0.75"
            strokeWidth="1.2"
          />
          <circle cx="37" cy="5" r="1.8" fill={MANCHA_BORDA} fillOpacity="0.7" />
          <circle cx="3" cy="26" r="1.4" fill={MANCHA_BORDA} fillOpacity="0.7" />
          <circle cx="31" cy="28.5" r="1.1" fill={MANCHA_BORDA} fillOpacity="0.7" />
        </motion.svg>
      ) : (
        [0, 1, 2].map((c) => (
          <motion.span
            key={c}
            className="pointer-events-none absolute block"
            style={{ left: cw / 2 + pouso(c, cw).x - s / 2, top: ch / 2 + pouso(c, cw).y - s / 2, ...estiloDoArremesso(s, false) }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: (acerto + c * TEMPO_GOLPE.cadencia) / ritmo, duration: 0.02 }}
            aria-hidden="true"
          />
        ))
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------------
// O grito

/**
 * O grito da mesa em cima da carta. Grande ("Espadão!") para a manilha que passa a mandar; pequeno
 * e apagado para a que chega depois de uma mais forte. Some antes de a mão sair da mesa.
 */
export function GritoManilha({ nome, x, y, pequeno = false, ritmo = 1 }: { nome: string; x: number; y: number; pequeno?: boolean; ritmo?: number }) {
  const reduce = useReducedMotion();
  const POUSO = 0.18;
  const DURA = TEMPO_GOLPE.grito;
  return (
    <motion.span
      aria-hidden="true"
      className={`pointer-events-none absolute z-[60] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-noite/80 px-2.5 py-0.5 font-hand font-bold leading-tight shadow-lg ${
        pequeno ? 'text-lg text-papel/80 ring-1 ring-papel/20' : 'text-2xl text-ouros ring-1 ring-ouros/50'
      }`}
      style={{ left: x, top: y }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5, y: 6 }}
      animate={reduce ? { opacity: [0, 1, 1, 0] } : { opacity: [0, 1, 1, 0], scale: [0.5, 1.12, 1, 0.96], y: [6, -4, -6, -10] }}
      transition={{ duration: DURA / ritmo, times: [0, 0.15, 0.75, 1], delay: POUSO / ritmo, ease: porTrecho('easeOut', 4) }}
    >
      {pequeno ? nome : `${nome}!`}
    </motion.span>
  );
}
