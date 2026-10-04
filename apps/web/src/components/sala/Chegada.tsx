import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { play } from '../../lib/sound';
import { useOnline } from '../../stores/online';

/** Quanto a faixa da chegada fica (ms). */
const DURACAO_MS = 4200;

/**
 * A chegada com piada interna (o admin escreveu para o apelido): "Chegou o Igor. Segurem as carteiras."
 * Uma faixa de papel no alto, a mesma língua do narrador, com o som da porta do bolicho. Não pega toque.
 */
export function ChegadaNaSala({ top = '4.5rem' }: { top?: string }) {
  const chegada = useOnline((s) => s.chegada);
  const reduce = useReducedMotion();
  const [vista, setVista] = useState<number | null>(null);
  useEffect(() => {
    if (!chegada) return undefined;
    play('turn', { rate: 0.8 });
    play('play', { delayMs: 220, rate: 0.7 });
    const t = window.setTimeout(() => setVista(chegada.key), DURACAO_MS);
    return () => window.clearTimeout(t);
  }, [chegada]);
  const aberta = chegada && vista !== chegada.key ? chegada : null;
  return (
    <AnimatePresence>
      {aberta && (
        <motion.div
          key={aberta.key}
          role="status"
          className="pointer-events-none fixed inset-x-3 z-[60] mx-auto flex max-w-md justify-center"
          style={{ top: `calc(${top} + var(--safe-top))` }}
          initial={reduce ? { opacity: 0 } : { y: -80, rotate: -6, opacity: 0 }}
          animate={{ y: 0, rotate: -2, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: -60, opacity: 0, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <span className="papel rounded-md px-4 py-2 text-center font-hand text-[1.6rem] font-bold leading-[1.05] shadow-[0_12px_30px_rgb(0_0_0/0.5)]">{aberta.texto}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
