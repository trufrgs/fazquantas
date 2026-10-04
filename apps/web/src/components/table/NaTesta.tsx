import { motion, useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';

/** Distância mínima da cena até a borda da mesa. */
const FOLGA = 6;

/**
 * A cena de quem perdeu na rodada da carta na testa por ter a manilha na própria testa: cantou zero sem
 * ver a carta, levou a mão e perdeu o palito ("o cara perder a testa porque tava com manilha poderia
 * ter um efeitinho", o Igor, 29/09/2026). Entra depois do golpe da manilha, balançando, em cima do
 * assento (`acima`); na fila de cima, que encosta na barra, desce para baixo dele (`abaixo`).
 */
export function NaTesta({
  x,
  acima,
  abaixo,
  largura,
  manilha,
  tu,
  atraso = 0.9,
}: {
  x: number;
  acima: number;
  abaixo: number;
  largura: number;
  manilha: string;
  tu: boolean;
  /** Quando entra (s): depois do golpe da manilha e, na mão que decide, depois do corte de novela. */
  atraso?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [caixa, setCaixa] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setCaixa({ w: el.offsetWidth, h: el.offsetHeight });
  }, [manilha, tu]);
  const desce = !!caixa && acima - caixa.h < FOLGA;
  const meia = caixa ? caixa.w / 2 : 0;
  const left = caixa ? Math.min(Math.max(x, meia + FOLGA), largura - meia - FOLGA) : x;
  return (
    <motion.div
      ref={ref}
      className={`pointer-events-none absolute z-[65] flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-col items-center ${desce ? '' : '-translate-y-full'}`}
      style={{ left, top: desce ? abaixo : acima }}
      initial={{ opacity: 0, scale: 0.3, rotate: -12 }}
      animate={reduce ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: [0, 1, 1, 1], scale: [0.3, 1.3, 0.94, 1], rotate: [-12, 9, -5, 0] }}
      transition={{ duration: 0.75, delay: atraso, times: [0, 0.35, 0.7, 1] }}
      role="status"
    >
      <span className="whitespace-nowrap rounded-2xl bg-copas px-3 py-1 font-hand text-2xl font-bold leading-tight text-papel shadow-lg ring-2 ring-papel/70">
        Bah! Tava na testa!
      </span>
      <span className="mt-1 rounded-full bg-noite/85 px-2.5 py-0.5 text-center text-sm font-semibold text-papel">
        {tu ? `${manilha} na tua testa, e tu cantou zero` : `${manilha} na testa, e cantou zero`}
      </span>
    </motion.div>
  );
}
