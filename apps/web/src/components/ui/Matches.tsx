import { motion } from 'motion/react';
import { memo, useEffect, useRef, useState } from 'react';
import { rem } from '../../lib/ui-scale';

/** Um palito de fósforo. Ao virar `burnt`, acende e queima de cima para baixo. */
const Match = memo(function Match({ burnt, height }: { burnt: boolean; height: number }) {
  const was = useRef(burnt);
  const [burning, setBurning] = useState(false);

  useEffect(() => {
    if (burnt && !was.current) {
      setBurning(true);
      const t = window.setTimeout(() => setBurning(false), 1500);
      was.current = burnt;
      return () => window.clearTimeout(t);
    }
    was.current = burnt;
    return undefined;
  }, [burnt]);

  const w = height * 0.26;
  return (
    <svg width={rem(w)} height={rem(height)} viewBox="0 0 6 24" style={{ overflow: 'visible' }} aria-hidden="true">
      <g opacity={burnt && !burning ? 0.38 : 1}>
        <rect x="1.8" y="4" width="2.4" height="19" rx="0.8" fill={burnt && !burning ? '#3a2a20' : 'url(#palito)'} />
        {!burnt || burning ? (
          <ellipse cx="3" cy="4.2" rx="2.3" ry="3" fill="#c0392b" />
        ) : (
          <ellipse cx="3" cy="4.6" rx="1.8" ry="2.2" fill="#1c1410" />
        )}
        {!burnt && <ellipse cx="2.3" cy="3.2" rx="0.7" ry="1" fill="#f08a7e" opacity="0.8" />}
      </g>
      {burning && (
        <>
          <motion.rect
            x="1.8"
            width="2.4"
            rx="0.8"
            fill="#2a1d16"
            initial={{ y: 4, height: 0 }}
            animate={{ height: 17 }}
            transition={{ duration: 1.2, ease: 'easeIn', delay: 0.15 }}
          />
          <motion.path
            d="M3 -6 C5.5 -2 5.2 2 3 4.5 C0.8 2 0.5 -2 3 -6 Z"
            fill="url(#chama)"
            initial={{ opacity: 0, scale: 0.4, y: 0 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.2, 1, 0.6], y: [0, 2, 10, 16] }}
            transition={{ duration: 1.45, times: [0, 0.15, 0.75, 1] }}
            style={{ transformOrigin: '3px 4px' }}
          />
        </>
      )}
    </svg>
  );
});

export interface MatchesProps {
  lives: number;
  starting: number;
  /** Altura de cada palito em px na escala 1. */
  size?: number;
  /** Um palito só com o número (pouco espaço). */
  compact?: boolean;
  className?: string;
}

/** Vidas como palitos de fósforo (inteiros = vidas; queimados = perdidas). */
export function Matches({ lives, starting, size = 16, compact = false, className }: MatchesProps) {
  const alive = Math.max(0, lives);
  const label = `${alive} ${alive === 1 ? 'vida' : 'vidas'}`;
  if (compact || starting > 6) {
    return (
      <span role="img" className={`inline-flex items-center gap-1 ${className ?? ''}`} aria-label={label} title={label}>
        <Match burnt={alive === 0} height={size} />
        <span className="font-bold tabular-nums" style={{ fontSize: rem(size * 0.8) }}>
          {alive}
        </span>
      </span>
    );
  }
  return (
    <span
      role="img"
      className={`inline-flex items-end ${className ?? ''}`}
      style={{ gap: rem(size * 0.12) }}
      aria-label={label}
      title={label}
    >
      {Array.from({ length: starting }, (_, i) => (
        <Match key={i} burnt={i >= alive} height={size} />
      ))}
    </span>
  );
}
