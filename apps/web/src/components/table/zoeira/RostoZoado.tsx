import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { play } from '../../../lib/sound';
import { rem } from '../../../lib/ui-scale';
import { Carimbo } from '../../ui/Carimbo';
import { useZoeira } from './agenda';
import { Chama, Chinelo, Coroa, Lapide, Lenco, Traira, Vaca } from './desenhos';
import { dataEspecial } from './noite';

/** Semana Farroupilha: todo mundo de lenço, vermelho de maragato ou branco de chimango. */
const FARROUPILHA = dataEspecial() === 'farroupilha';
const corDoLenco = (id: string) => ([...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 2 ? '#C4372D' : '#F7EFDE');
import { DURACAO, type Enfeites } from './diretor';

/**
 * O rosto de um assento com a zoeira em volta, cada coisa no seu ponto (o mapa está em `diretor.ts`):
 * a lápide e a chama por trás, a coroa do líder em cima, o balanço do borracho e o gelo do pé-frio no
 * próprio rosto, e por cima a cena do momento (a vaca, a traíra, a chinelada). Os selos do assento
 * (pé, cartas na mão, cantada, microfone) ficam de fora, nos cantos de sempre.
 */
export function RostoZoado({
  id,
  size,
  enfeites,
  children,
}: {
  id: string;
  /** Diâmetro do rosto que está aparecendo (avatar ou câmera), em px na escala 1. */
  size: number;
  enfeites: Enfeites | undefined;
  children: ReactNode;
}) {
  const cena = useZoeira((s) => s.cenas[id]);
  const [rosto, animar] = useAnimate<HTMLSpanElement>();
  const fora = !!enfeites && enfeites.epitafio !== null;
  // Quem já estava fora quando a mesa abriu aparece direto na lápide; quem sai agora, depois da chinelada.
  const [jaEstavaFora] = useState(fora);
  const u = (k: number) => rem(size * k);

  // O rosto reage à cena: amassa embaixo da vaca, vira com o rabo da traíra, voa com a chinelada.
  const chave = cena?.chave;
  const tipo = cena?.tipo;
  useEffect(() => {
    const el = rosto.current;
    if (!el || !tipo) return;
    if (tipo === 'vaca') {
      play('pau', { delayMs: 430, rate: 0.7 });
      void animar(el, { scaleX: [1, 1, 1.5, 1.5, 0.85, 1], scaleY: [1, 1, 0.24, 0.24, 1.22, 1] }, { duration: DURACAO.vaca / 1000, times: [0, 0.2, 0.25, 0.62, 0.8, 1], ease: 'easeOut' });
    } else if (tipo === 'traira') {
      play('play', { delayMs: 330, rate: 1.4 });
      play('play', { delayMs: 610, rate: 1.55 });
      void animar(el, { rotate: [0, 0, 20, -20, 12, 0], x: [0, 0, u(0.12), u(-0.12), u(0.06), 0] }, { duration: 1.2, times: [0, 0.26, 0.34, 0.52, 0.7, 1], ease: 'easeOut' });
    } else {
      play('play', { delayMs: 330, rate: 0.5 });
      void animar(
        el,
        { x: [0, 0, u(-5), u(-5), 0, 0], y: [0, 0, u(-3.5), u(-3.5), 0, 0], rotate: [0, 0, -900, -900, 0, 0], opacity: [1, 1, 1, 0, 0, 1], scale: [1, 1, 1, 1, 0.3, 1] },
        { duration: DURACAO.chinelada / 1000, times: [0, 0.2, 0.62, 0.63, 0.75, 1], ease: 'easeOut' },
      );
    }
    // `u` só depende do tamanho, que não muda no meio da cena.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, tipo, animar, rosto]);

  const e = fora ? undefined : enfeites;
  const chama = e && e.quente > 0 ? 0.95 + Math.min(e.quente - 3, 3) * 0.2 : 0;
  return (
    <span className="relative inline-block shrink-0 align-top" style={{ width: rem(size), height: rem(size) }}>
      {fora && (
        <motion.span
          className="pointer-events-none absolute"
          style={{ left: u(-0.17), top: u(-0.28), width: u(1.34), originY: 1 }}
          initial={jaEstavaFora ? false : { opacity: 0, scaleY: 0.2 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ delay: 1.2, duration: 0.3, ease: 'easeOut' }}
        >
          <Lapide w="100%" />
        </motion.span>
      )}
      {chama > 0 && (
        <span className="zoeira-chama pointer-events-none absolute left-1/2" style={{ bottom: '42%', width: u(chama), marginLeft: u(-chama / 2) }}>
          <Chama w="100%" />
        </span>
      )}
      <span ref={rosto} className="relative block" style={{ transformOrigin: tipo === 'vaca' ? '50% 100%' : '50% 50%' }}>
        <span className={`block ${e && e.borracho > 0 ? `zoeira-borracho zoeira-borracho-${e.borracho}` : ''}`}>
          <span className={`block ${e && e.frio > 0 ? 'zoeira-frio' : ''}`}>{children}</span>
        </span>
      </span>
      {e && e.borracho >= 2 && (
        <span className="pointer-events-none absolute" style={{ left: '70%', top: '46%' }} aria-hidden="true">
          {[0, 1].map((i) => (
            <span key={i} className="zoeira-bolha absolute block rounded-full" style={{ width: u(0.11 + i * 0.05), height: u(0.11 + i * 0.05), animationDelay: `${i * 1.3}s` }} />
          ))}
        </span>
      )}
      {e && e.frio > 0 && (
        <span className="pointer-events-none absolute inset-0" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-[rgb(120_185_245/0.5)] ring-2 ring-[rgb(190_225_255)]" />
          {[18, 50, 80].map((x, i) => (
            <span key={x} className="zoeira-neve absolute block rounded-full bg-white" style={{ left: `${x}%`, top: '-8%', width: u(0.08), height: u(0.08), animationDelay: `${i * 0.5}s` }} />
          ))}
        </span>
      )}
      {FARROUPILHA && !fora && (
        <span className="pointer-events-none absolute left-1/2 z-[6]" style={{ bottom: u(-0.12), width: u(0.62), marginLeft: u(-0.31) }} aria-hidden="true">
          <Lenco w="100%" cor={corDoLenco(id)} />
        </span>
      )}
      {e?.lider && (
        <motion.span
          className="pointer-events-none absolute left-1/2 z-10"
          style={{ top: u(-0.3), width: u(0.62), marginLeft: u(-0.31) }}
          initial={{ y: u(-0.9), opacity: 0, rotate: -20 }}
          animate={{ y: 0, opacity: 1, rotate: -5 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        >
          <Coroa w="100%" />
        </motion.span>
      )}
      <AnimatePresence>
        {cena?.tipo === 'vaca' && (
          <motion.span
            key={cena.chave}
            className="pointer-events-none absolute left-1/2 top-0 z-20"
            style={{ width: u(1.9), marginLeft: u(-0.95) }}
            initial={{ y: u(-3.2), x: 0, rotate: -6, opacity: 1 }}
            animate={{ y: [u(-3.2), u(-0.62), u(-0.62), u(-1.1), u(2.2)], x: [0, 0, 0, u(0.6), u(1.7)], rotate: [-6, 0, 0, 28, 110], opacity: [1, 1, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURACAO.vaca / 1000, times: [0, 0.2, 0.62, 0.76, 1], ease: 'easeIn' }}
          >
            <Vaca w="100%" />
          </motion.span>
        )}
        {cena?.tipo === 'traira' && (
          <motion.span
            key={cena.chave}
            className="pointer-events-none absolute left-1/2 top-1/2 z-20"
            style={{ width: u(1.7), marginLeft: u(-0.85), marginTop: u(-0.43) }}
            initial={{ x: u(0.9), y: u(1.9), rotate: -60, scaleX: 1, opacity: 1 }}
            animate={{ x: [u(0.9), u(0.55), u(-0.55), u(0.3), u(0.9)], y: [u(1.9), 0, 0, 0, u(1.9)], rotate: [-60, 18, -18, 14, -50], scaleX: [1, 1, -1, 1, 1], opacity: [1, 1, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.3, times: [0, 0.24, 0.42, 0.6, 1], ease: 'easeInOut' }}
          >
            <Traira w="100%" />
          </motion.span>
        )}
        {cena?.tipo === 'traira' && <Carimbo key={`c${cena.chave}`} bate atraso={0.75} texto="Traíra" tamanho={Math.max(8, size * 0.2)} className="left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2" />}
        {cena?.tipo === 'chinelada' && (
          <motion.span
            key={cena.chave}
            className="pointer-events-none absolute left-1/2 top-1/2 z-20"
            style={{ width: u(1.5), marginLeft: u(-0.75), marginTop: u(-1.4) }}
            initial={{ x: u(6), rotate: -70, opacity: 1 }}
            animate={{ x: [u(6), u(0.5), u(-1.6)], rotate: [-70, 8, 60], opacity: [1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, times: [0, 0.55, 1], ease: 'easeIn' }}
          >
            <Chinelo w="100%" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
