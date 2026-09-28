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

/** Selo com o tempo que falta na vez de outro jogador (junto do assento). */
export function SeatClock({ deadline, totalMs }: { deadline: number | null; totalMs: number | null }) {
  const raw = useTimeLeft(deadline);
  if (raw === null) return null;
  // O prazo inclui a animação de dar as cartas: a conta não passa do tempo da jogada.
  const left = totalMs ? Math.min(raw, totalMs) : raw;
  const urgent = isUrgent(left, totalMs);
  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-px text-[0.6875rem] font-bold tabular-nums shadow ring-1 ${
        urgent ? 'animate-pulse bg-copas text-papel ring-black/20' : 'bg-noite/80 text-papel ring-papel/20'
      }`}
      aria-label={`Tempo da vez: ${formatLeft(left)}`}
    >
      <Timer size="0.75rem" aria-hidden="true" />
      {formatLeft(left)}
    </span>
  );
}

/**
 * A tua vez com tempo: um relógio grande no alto da mesa. Quando o tempo aperta, fica vermelho,
 * cresce e treme de leve (o tique-taque dos últimos segundos já toca à parte).
 */
export function MyTurnClock({ deadline, totalMs }: { deadline: number | null; totalMs: number | null }) {
  const raw = useTimeLeft(deadline);
  const reduce = useReducedMotion();
  if (raw === null) return null;
  const left = totalMs ? Math.min(raw, totalMs) : raw;
  const urgent = isUrgent(left, totalMs);
  const pct = totalMs ? Math.max(0, Math.min(1, left / totalMs)) : null;
  return (
    <motion.div
      role="timer"
      aria-live={urgent ? 'assertive' : 'off'}
      aria-label={`Tua vez: faltam ${formatLeft(left)}`}
      className={`pointer-events-none flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-full py-1.5 pl-3 pr-4 font-display font-bold shadow-[0_6px_18px_rgb(0_0_0/0.45)] ring-2 ${
        urgent ? 'bg-copas text-papel ring-papel/70' : 'bg-papel text-tinta ring-ouros'
      }`}
      style={{ fontVariationSettings: '"SOFT" 100' }}
      initial={{ y: -8, opacity: 0 }}
      animate={
        urgent && !reduce
          ? { y: 0, opacity: 1, scale: [1, 1.08, 1], rotate: [0, -1.5, 1.5, 0] }
          : { y: 0, opacity: 1, scale: 1, rotate: 0 }
      }
      transition={urgent && !reduce ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.25 }}
    >
      <Timer size="1.25rem" aria-hidden="true" />
      <span className="text-base">Tua vez</span>
      <span className="text-xl tabular-nums">{formatLeft(left)}</span>
      {pct !== null && (
        <span className="relative ml-1 h-1.5 w-12 overflow-hidden rounded-full bg-current/20" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 rounded-full bg-current" style={{ width: `${pct * 100}%` }} />
        </span>
      )}
    </motion.div>
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
