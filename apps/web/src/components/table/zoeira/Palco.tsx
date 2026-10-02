import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { play } from '../../../lib/sound';
import { rem } from '../../../lib/ui-scale';
import { useZoeira } from './agenda';
import { Cinzeiro } from './desenhos';
import { DURACAO, FREGUES_EM } from './diretor';

/**
 * A voz da mesa: o narrador de galpão (ditado gaúcho escrito à mão numa tira de papel) e o coro da
 * turma (a frase que três mandaram juntos, em letra de torcida). É o único letreiro da zoeira, um de
 * cada vez; `top` é o mesmo lugar livre da faixa "As cantadas" (as duas nunca aparecem juntas).
 */
export function FaixaDaMesa({ top }: { top: number | null }) {
  const faixa = useZoeira((s) => s.faixa);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!faixa?.coro) return;
    // As palmas do coro: o estalo da carta, quatro vezes.
    for (let i = 0; i < 4; i++) play('play', { delayMs: i * 430, rate: 1.5 });
  }, [faixa?.chave, faixa?.coro]);
  return (
    <AnimatePresence>
      {faixa && !faixa.coro && (
        <motion.div
          key={faixa.chave}
          role="status"
          className="pointer-events-none absolute inset-x-3 z-30 mx-auto flex max-w-md justify-center"
          style={{ top: top ?? '30%' }}
          initial={reduce ? { opacity: 0 } : { x: '-110%', opacity: 1 }}
          animate={{ x: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { x: '110%', transition: { duration: 0.3, ease: 'easeIn' } }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <span
            className="papel rounded-md px-4 py-2 text-center font-hand text-[1.7rem] font-bold leading-[1.05] shadow-[0_12px_30px_rgb(0_0_0/0.5)]"
            style={{ rotate: '-2.5deg' }}
          >
            {faixa.texto}
          </span>
        </motion.div>
      )}
      {faixa?.coro && (
        <motion.div
          key={faixa.chave}
          role="status"
          className="pointer-events-none absolute inset-x-2 top-[36%] z-30 flex justify-center"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={reduce ? { opacity: 1, scale: 1 } : { opacity: 1, scale: [0.8, 1.14, 1, 1.14, 1, 1.14, 1, 1.14, 1], rotate: [-4, 3, -3, 3, -3, 3, -3, 3, -2] }}
          exit={{ opacity: 0, scale: 1.4, transition: { duration: 0.25 } }}
          transition={{ duration: (DURACAO.coro - 400) / 1000, ease: 'easeOut' }}
        >
          <span
            className="text-center font-display font-black uppercase leading-[0.95] text-papel"
            style={{
              fontVariationSettings: '"SOFT" 100, "WONK" 1',
              // Frase curta em letra grande; a comprida encolhe para caber.
              fontSize: `min(${rem(76)}, ${Math.round(150 / Math.max(6, faixa.texto.length))}vw)`,
              WebkitTextStroke: `${rem(7)} var(--color-copas-escuro)`,
              paintOrder: 'stroke fill',
              textShadow: `0 ${rem(5)} 0 var(--color-copas-escuro), 0 ${rem(10)} ${rem(22)} rgb(0 0 0 / 0.55)`,
            }}
          >
            {faixa.texto}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * O cartão fidelidade do freguês, no meio da mesa, só com a mão fechada (tempo morto): quem teve a
 * carta morta cinco vezes pelo mesmo dono leva os cinco carimbos, um por um.
 */
export function CartaoDoFregues({ nameOf }: { nameOf: (id: string) => string }) {
  const palco = useZoeira((s) => s.palco);
  useEffect(() => {
    if (!palco) return;
    for (let i = 0; i < FREGUES_EM; i++) play('bid', { delayMs: 520 + i * 230, rate: 1.5 + i * 0.08 });
  }, [palco]);
  return (
    <AnimatePresence>
      {palco && (
        <motion.div
          key={palco.chave}
          role="status"
          aria-label={`Cartão fidelidade: ${nameOf(palco.fregues)}, freguês de ${nameOf(palco.dono)}. ${FREGUES_EM} de ${FREGUES_EM}.`}
          className="pointer-events-none absolute inset-x-4 top-[30%] z-40 flex justify-center"
          initial={{ y: 260, rotate: 12, opacity: 0 }}
          animate={{ y: 0, rotate: -3, opacity: 1 }}
          exit={{ y: -40, opacity: 0, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          <div className="papel flex w-full max-w-xs flex-col items-center gap-1.5 rounded-2xl px-4 py-3 text-center shadow-[0_18px_40px_rgb(0_0_0/0.55)] ring-1 ring-black/10">
            <span className="font-display text-2xl font-black leading-none" style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
              Cartão fidelidade
            </span>
            <span className="text-sm font-semibold text-tinta-2">
              <strong className="text-tinta">{nameOf(palco.fregues)}</strong>, freguês de <strong className="text-tinta">{nameOf(palco.dono)}</strong>
            </span>
            <span className="flex gap-2 py-0.5" aria-hidden="true">
              {Array.from({ length: FREGUES_EM }, (_, i) => (
                <span key={i} className="relative block size-9 rounded-full ring-2 ring-tinta/25">
                  <motion.span
                    className="absolute inset-0 block rounded-full border-[0.3rem] border-copas"
                    style={{ rotate: -12, boxShadow: 'inset 0 0 0 0.16rem var(--color-papel), inset 0 0 0 0.42rem var(--color-copas)' }}
                    initial={{ scale: 2.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.23, duration: 0.16, ease: 'easeIn' }}
                  />
                </span>
              ))}
            </span>
            <motion.span
              className="font-hand text-2xl font-bold leading-none text-copas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + FREGUES_EM * 0.23 }}
            >
              A próxima surra é por conta da casa
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * O cinzeiro da espera: junta as bitucas dos palheiros fumados esperando alguém (por baixo de
 * assentos e cartas, como coisa em cima da mesa). A conta de quem fez a mesa esperar sai no fim.
 */
export function CinzeiroDaMesa({ left, bottom, largura }: { left: number; bottom: number; largura: number }) {
  const total = useZoeira((s) => s.cinzeiro.total);
  if (total <= 0) return null;
  return (
    <motion.div
      key={total}
      role="img"
      aria-label={`Cinzeiro da espera: ${total} ${total === 1 ? 'bituca' : 'bitucas'}`}
      className="pointer-events-none absolute z-[1]"
      style={{ left, bottom, width: largura }}
      initial={{ scale: 1.25 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 16 }}
    >
      <Cinzeiro w="100%" bitucas={total} />
      <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-noite/80 px-1 text-xs font-bold tabular-nums text-papel ring-1 ring-papel/25">
        {total}
      </span>
    </motion.div>
  );
}
