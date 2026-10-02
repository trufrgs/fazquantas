import { motion, useReducedMotion } from 'motion/react';
import { rem } from '../../lib/ui-scale';

/**
 * Carimbo de tinta vermelha, torto, por cima de um rosto: o "Deu pra ti" de quem saiu do jogo (pedido
 * do Thomas em 01/10/2026; a palavra é a da mesa, "loser" ficou fora do clima, 02/10/2026) e o
 * "Traíra" de quem matou a carta combinada. `tamanho` é a altura da letra (px na escala 1). Com
 * `bate`, entra de pancada; sem, já está lá.
 */
export function Carimbo({ texto, tamanho, bate = false, atraso = 0.3, className = '' }: { texto: string; tamanho: number; bate?: boolean; atraso?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      className={`pointer-events-none absolute z-10 whitespace-nowrap border-copas bg-papel/85 font-display font-black uppercase leading-none text-copas ${className}`}
      style={{
        rotate: -14,
        fontSize: rem(tamanho),
        letterSpacing: '0.06em',
        padding: `${rem(tamanho * 0.14)} ${rem(tamanho * 0.34)}`,
        borderWidth: rem(Math.max(1.5, tamanho * 0.11)),
        borderRadius: rem(tamanho * 0.2),
        boxShadow: `0 0 0 ${rem(Math.max(1, tamanho * 0.05))} rgb(247 239 222 / 0.85), 0 0 0 ${rem(Math.max(2, tamanho * 0.1))} var(--color-copas)`,
      }}
      initial={bate ? (reduce ? { opacity: 0 } : { scale: 3, opacity: 0 }) : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: atraso, duration: 0.2, ease: 'easeIn' }}
    >
      {texto}
    </motion.span>
  );
}
