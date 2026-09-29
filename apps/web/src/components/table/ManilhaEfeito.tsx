import { motion, useReducedMotion } from 'motion/react';
import type { EfeitoManilha } from './manilhas';

/**
 * O efeitinho de cada manilha, por cima da carta que acabou de cair (dura menos de 1 s e não bloqueia
 * nada). Com "reduzir movimento", fica só um brilho parado.
 */

const COR: Record<EfeitoManilha, string> = {
  corte: '255 244 214',
  aco: '176 210 255',
  pancada: '233 196 140',
  ouro: '255 205 90',
  brasa: '255 122 48',
};

/** O efeito começa quando a carta pousa (ela vem voando do assento). */
const POUSO = 0.22;

/** Faíscas e brasas: posições fixas por índice (sem sorteio: o mesmo desenho a cada vez). */
const RAIOS = Array.from({ length: 10 }, (_, i) => ({ ang: (i / 10) * Math.PI * 2 + 0.3, dist: 0.62 + (i % 3) * 0.14 }));
const BRASAS = [-0.34, -0.18, 0, 0.16, 0.3, -0.26, 0.08, 0.24];

export function ManilhaEfeito({ efeito, width }: { efeito: EfeitoManilha; width: number }) {
  const reduce = useReducedMotion();
  const h = width * 1.6;
  const cor = COR[efeito];
  const brilho = (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ borderRadius: width * 0.06, boxShadow: `0 0 0 2px rgb(${cor} / 0.9), 0 0 ${width * 0.45}px ${width * 0.12}px rgb(${cor} / 0.55)` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: reduce ? 1.2 : 0.9, times: [0, 0.2, 1], delay: POUSO }}
    />
  );
  if (reduce) return brilho;

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ overflow: 'visible' }}>
      {brilho}
      {efeito === 'corte' && (
        <>
          {/* Clarão na carta e o risco do facão atravessando na diagonal. */}
          <motion.span
            className="absolute inset-0 bg-white"
            style={{ borderRadius: width * 0.06, mixBlendMode: 'screen' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.75, 0] }}
            transition={{ duration: 0.35, times: [0, 0.25, 1], delay: POUSO }}
          />
          <motion.span
            className="absolute left-1/2 top-1/2"
            style={{
              width: width * 1.9,
              height: Math.max(3, width * 0.045),
              marginLeft: -width * 0.95,
              borderRadius: 999,
              rotate: -52,
              background: `linear-gradient(90deg, transparent, rgb(${cor}) 35%, #fff 50%, rgb(${cor}) 65%, transparent)`,
              boxShadow: `0 0 ${width * 0.12}px rgb(${cor})`,
              transformOrigin: 'left center',
            }}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1, opacity: [1, 1, 0] }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.3, 1], times: [0, 0.6, 1], delay: POUSO }}
          />
        </>
      )}
      {efeito === 'aco' && (
        // O fio da lâmina: uma faixa de luz fria passando pela carta.
        <span className="absolute inset-0 overflow-hidden" style={{ borderRadius: width * 0.06 }}>
          <motion.span
            className="absolute inset-y-0"
            style={{
              width: width * 0.9,
              background: `linear-gradient(115deg, transparent 20%, rgb(${cor} / 0.95) 48%, #fff 52%, rgb(${cor} / 0.95) 56%, transparent 80%)`,
              mixBlendMode: 'screen',
            }}
            initial={{ x: -width * 1.2 }}
            animate={{ x: width * 1.3 }}
            transition={{ duration: 0.7, ease: 'easeInOut', delay: POUSO }}
          />
        </span>
      )}
      {efeito === 'pancada' && (
        // A batida na mesa: duas ondas de poeira saindo da carta.
        <>
          {[0, 0.12].map((delay) => (
            <motion.span
              key={delay}
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{
                width: width * 1.5,
                height: width * 1.5,
                marginLeft: -width * 0.75,
                marginTop: -width * 0.75,
                border: `${Math.max(2, width * 0.05)}px solid rgb(${cor} / 0.85)`,
              }}
              initial={{ scale: 0.35, opacity: 0 }}
              animate={{ scale: 1.9, opacity: [0, 0.9, 0] }}
              transition={{ duration: 0.65, delay: POUSO + delay, ease: 'easeOut', times: [0, 0.08, 1] }}
            />
          ))}
        </>
      )}
      {efeito === 'ouro' &&
        // Faíscas douradas saindo em estrela.
        RAIOS.map(({ ang, dist }, i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{
              width: width * 0.13,
              height: width * 0.13,
              marginLeft: -width * 0.065,
              marginTop: -width * 0.065,
              rotate: 45,
              borderRadius: 2,
              background: i % 2 ? '#fff4c8' : `rgb(${cor})`,
              boxShadow: `0 0 ${width * 0.1}px rgb(${cor})`,
            }}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
            animate={{ x: Math.cos(ang) * width * dist * 1.25, y: Math.sin(ang) * h * dist * 0.8, scale: [0.4, 1, 0.2], opacity: [0, 1, 0] }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: POUSO + (i % 4) * 0.03 }}
          />
        ))}
      {efeito === 'brasa' && (
        <>
          {/* Pega fogo: brilho quente por baixo e brasas subindo. */}
          <motion.span
            className="absolute inset-x-0 bottom-0"
            style={{ height: h * 0.55, borderRadius: width * 0.06, background: `linear-gradient(to top, rgb(${cor} / 0.75), transparent)`, mixBlendMode: 'screen' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.9, times: [0, 0.3, 1], delay: POUSO }}
          />
          {BRASAS.map((dx, i) => (
            <motion.span
              key={i}
              className="absolute bottom-[8%] left-1/2 rounded-full"
              style={{ width: width * 0.08, height: width * 0.08, marginLeft: dx * width, background: i % 2 ? '#ffd166' : `rgb(${cor})`, boxShadow: `0 0 ${width * 0.08}px rgb(${cor})` }}
              initial={{ y: 0, opacity: 0, scale: 1 }}
              animate={{ y: -h * (0.7 + (i % 3) * 0.15), opacity: [0, 1, 0], scale: [1, 0.8, 0.3] }}
              transition={{ duration: 0.85, ease: 'easeOut', delay: POUSO + (i % 4) * 0.05 }}
            />
          ))}
        </>
      )}
    </span>
  );
}

/** O grito da mesa em cima da carta: "Espadão!", "Sete belo!". */
export function GritoManilha({ nome, x, y }: { nome: string; x: number; y: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute z-[60] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-noite/80 px-2.5 py-0.5 font-hand text-2xl font-bold leading-tight text-ouros shadow-lg ring-1 ring-ouros/50"
      style={{ left: x, top: y }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5, y: 6 }}
      animate={reduce ? { opacity: [0, 1, 1, 0] } : { opacity: [0, 1, 1, 0], scale: [0.5, 1.12, 1, 0.96], y: [6, -4, -6, -10] }}
      transition={{ duration: 1.3, times: [0, 0.15, 0.75, 1], delay: POUSO - 0.04 }}
    >
      {nome}!
    </motion.span>
  );
}

/** A manilha que perdeu para uma mais forte: queimou (chamuscada, com brasas subindo). */
export function Queimou({ width }: { width: number }) {
  const reduce = useReducedMotion();
  const h = width * 1.6;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ overflow: 'visible' }}>
      <motion.span
        className="absolute inset-0"
        style={{ borderRadius: width * 0.06, background: 'radial-gradient(ellipse at 50% 80%, rgb(60 20 5 / 0.55), rgb(40 12 2 / 0.25) 60%, transparent)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.65 }}
      />
      {!reduce &&
        BRASAS.slice(0, 6).map((dx, i) => (
          <motion.span
            key={i}
            className="absolute bottom-[12%] left-1/2 rounded-full"
            style={{ width: width * 0.07, height: width * 0.07, marginLeft: dx * width, background: i % 2 ? '#ffb347' : '#ff6a2a', boxShadow: '0 0 6px #ff6a2a' }}
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: -h * (0.5 + (i % 3) * 0.12), opacity: [0, 1, 0] }}
            transition={{ duration: 1.1, ease: 'easeOut', delay: 0.7 + (i % 3) * 0.12 }}
          />
        ))}
    </span>
  );
}
