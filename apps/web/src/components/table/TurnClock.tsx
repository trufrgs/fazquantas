import { Timer } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { formatLeft, isUrgent } from '../../lib/tempo';

/** Quanto falta até o prazo, atualizado sozinho (a cada 250 ms perto do fim, a cada 15 s em horas). */
export function useTimeLeft(deadline: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return undefined;
    let id = 0;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const left = deadline - t;
      if (left <= 0) return;
      id = window.setTimeout(tick, left > 3_600_000 ? 15_000 : left > 120_000 ? 1000 : 250);
    };
    id = window.setTimeout(tick, 0);
    return () => window.clearTimeout(id);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : null;
}

/**
 * Relógio da tua vez dentro do painel de palpite (nada flutuando por cima da mesa): vermelho e
 * pulsando quando o tempo aperta.
 */
export function InlineTurnTimer({ deadline, totalMs }: { deadline: number | null; totalMs: number | null }) {
  const raw = useTimeLeft(deadline);
  if (raw === null) return null;
  const left = totalMs ? Math.min(raw, totalMs) : raw;
  const urgent = isUrgent(left, totalMs);
  return (
    <span
      role="timer"
      aria-live={urgent ? 'assertive' : 'off'}
      aria-label={`Tua vez: faltam ${formatLeft(left)}`}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-bold tabular-nums ${
        urgent ? 'animate-pulse bg-copas text-papel' : 'bg-tinta/10 text-tinta'
      }`}
    >
      <Timer size="0.95rem" aria-hidden="true" />
      {formatLeft(left)}
    </span>
  );
}

/** Borda vermelha pulsando na tela quando a tua vez está acabando (não cobre nada). */
export function UrgentEdge({ on }: { on: boolean }) {
  const reduce = useReducedMotion();
  if (!on) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60]"
      style={{ boxShadow: 'inset 0 0 0 4px rgb(196 55 45 / 0.75), inset 0 0 70px rgb(196 55 45 / 0.45)' }}
      animate={{ opacity: reduce ? 1 : [0.55, 1, 0.55] }}
      transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

/**
 * A luz do lampião em quem está na vez: um clarão quente na mesa que desliza até o assento da vez
 * (e desce até a tua mão quando é contigo). Vermelho quando o tempo aperta.
 */
export function TurnSpotlight({ at, urgent }: { at: { x: number; y: number } | null; urgent?: boolean }) {
  const reduce = useReducedMotion();
  if (!at) return null;
  // Uma poça de luz no pano da mesa, mais larga que alta, como a do lampião.
  const w = 380;
  const h = 250;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute z-0"
      style={{
        width: w,
        height: h,
        marginLeft: -w / 2,
        marginTop: -h / 2,
        borderRadius: '50%',
        background: urgent
          ? 'radial-gradient(ellipse at center, rgb(235 95 70 / 0.42) 0%, rgb(235 95 70 / 0.16) 45%, transparent 72%)'
          : 'radial-gradient(ellipse at center, rgb(255 216 150 / 0.4) 0%, rgb(255 216 150 / 0.14) 45%, transparent 72%)',
        mixBlendMode: 'screen',
      }}
      initial={false}
      animate={{ left: at.x, top: at.y, opacity: reduce ? 1 : [0.85, 1, 0.85] }}
      transition={{
        left: { type: 'spring', stiffness: 90, damping: 18 },
        top: { type: 'spring', stiffness: 90, damping: 18 },
        opacity: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
      }}
    />
  );
}
