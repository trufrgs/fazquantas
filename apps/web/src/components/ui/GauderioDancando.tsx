import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { avatarUri } from '../../lib/avatar';
import { play } from '../../lib/sound';

const TOQUES = 7;
/** Quanto os toques podem se espaçar para ainda contar (ms). */
const FOLEGO_MS = 900;
const DANCA_MS = 3600;

/**
 * Sete toques no logo da tela inicial e o Gaudério dança a chula (escondida de propósito: ninguém
 * avisa; escolhida no caderno de zoeira, 02/10/2026). Devolve o `onClick` para pôr no logo e a dança
 * para pôr na tela.
 */
export function useSeteToques(): { tocar: () => void; danca: React.ReactNode } {
  const conta = useRef({ n: 0, em: 0 });
  const [dancando, setDancando] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!dancando) return undefined;
    for (let i = 0; i < 6; i++) play('play', { delayMs: 300 + i * 480, rate: 1.3 });
    const t = window.setTimeout(() => setDancando(0), DANCA_MS);
    return () => window.clearTimeout(t);
  }, [dancando]);
  const tocar = () => {
    const agora = Date.now();
    const c = conta.current;
    c.n = agora - c.em <= FOLEGO_MS ? c.n + 1 : 1;
    c.em = agora;
    if (c.n >= TOQUES) {
      c.n = 0;
      setDancando(agora);
    }
  };
  const danca = (
    <AnimatePresence>
      {dancando > 0 && (
        <motion.div
          key={dancando}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.span
            className="block size-48 rounded-full bg-[#b86b3a] shadow-[0_18px_40px_rgb(0_0_0/0.6)] ring-4 ring-papel/80"
            initial={{ scale: 0.2, y: 80 }}
            animate={
              reduce
                ? { scale: 1, y: 0 }
                : { scale: 1, x: [-28, 0, 28, 0, -28, 0, 28, 0, -28, 0, 28, 0, 0], y: [0, -34, 0, -34, 0, -34, 0, -34, 0, -34, 0, -34, 0], rotate: [-12, 0, 12, 0, -12, 0, 12, 0, -12, 0, 12, 0, 0] }
            }
            transition={reduce ? { duration: 0.3 } : { duration: DANCA_MS / 1000 - 0.3, ease: 'easeInOut' }}
          >
            <img src={avatarUri('g-gauderio')} alt="" className="size-full rounded-full" draggable={false} />
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return { tocar, danca };
}
