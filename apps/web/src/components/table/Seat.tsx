import { REACTIONS, type CardId, type Phase, type PublicPlayer } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useEffect, useState } from 'react';
import type { SeatInfo } from '../../lib/connection';
import type { LiveReaction } from '../../stores/game';
import { Card } from '../cards/Card';
import { Avatar } from '../ui/Avatar';
import { Matches } from '../ui/Matches';

export type BidTone = 'none' | 'pending' | 'exact' | 'over' | 'doomed';

export function bidTone(bid: number | null, tricks: number, remaining: number): BidTone {
  if (bid === null) return 'none';
  if (tricks > bid) return 'over';
  if (bid - tricks > remaining) return 'doomed';
  if (tricks === bid) return 'exact';
  return 'pending';
}

const TONE_CLASS: Record<BidTone, string> = {
  none: '',
  pending: 'bg-papel text-tinta',
  exact: 'bg-paus text-papel',
  over: 'bg-copas text-papel',
  doomed: 'bg-copas text-papel',
};

/** Selo "fez/palpite" (ou só o palpite enquanto ninguém jogou). */
export function BidBadge({
  bid,
  tricks,
  remaining,
  showTricks,
  size = 'md',
}: {
  bid: number | null;
  tricks: number;
  remaining: number;
  showTricks: boolean;
  size?: 'sm' | 'md';
}) {
  if (bid === null) return null;
  const tone = showTricks ? bidTone(bid, tricks, remaining) : 'pending';
  const label = showTricks ? `Fez ${tricks} de ${bid}` : `Palpitou ${bid}`;
  return (
    <motion.span
      key={`${bid}`}
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      aria-label={label}
      title={label}
      className={`inline-flex items-baseline justify-center rounded-full font-bold tabular-nums shadow-[0_2px_0_rgb(0_0_0/0.35)] ring-1 ring-black/15 ${TONE_CLASS[tone]} ${
        size === 'sm' ? 'min-w-7 px-1.5 py-0.5 text-xs' : 'min-w-9 px-2 py-0.5 text-sm'
      }`}
    >
      {showTricks ? (
        <>
          {tricks}
          <span className="px-px opacity-60">/</span>
          {bid}
        </>
      ) : (
        bid
      )}
    </motion.span>
  );
}

/** Anel de vez (pulsa) com contagem regressiva quando há tempo de jogada. */
export function TurnRing({ size, deadline }: { size: number; deadline: number | null }) {
  const [start] = useState(() => Date.now());
  const total = deadline ? Math.max(0, deadline - start) : 0;
  const r = size / 2 + 4;
  const c = 2 * Math.PI * r;
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <motion.span
        className="absolute rounded-full"
        style={{ width: size + 12, height: size + 12, boxShadow: '0 0 0 3px var(--color-luz), 0 0 22px 6px rgb(255 205 130 / 0.55)' }}
        animate={{ opacity: [0.65, 1, 0.65], scale: [1, 1.04, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      {deadline && total > 0 && (
        <svg width={size + 16} height={size + 16} className="absolute -rotate-90">
          <motion.circle
            cx={(size + 16) / 2}
            cy={(size + 16) / 2}
            r={r}
            fill="none"
            stroke="#c4372d"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: 0 }}
            animate={{ strokeDashoffset: c }}
            transition={{ duration: total / 1000, ease: 'linear' }}
          />
        </svg>
      )}
    </span>
  );
}

function DealerChip({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-ouros font-display font-bold text-tinta shadow-[0_2px_0_var(--color-ouros-escuro)] ring-1 ring-black/20 ${
        size === 'sm' ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-xs'
      }`}
      title="Pé: deu as cartas e palpita por último"
    >
      pé
    </span>
  );
}

export { DealerChip };

/** Balão de reação sobre o assento. */
export function ReactionBubble({ reaction, placement = 'above' }: { reaction: LiveReaction | undefined; placement?: 'above' | 'below' }) {
  const info = reaction ? REACTIONS.find((r) => r.id === reaction.reaction) : undefined;
  return (
    <AnimatePresence>
      {info && reaction && (
        <motion.span
          key={reaction.key}
          className={`pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-2xl bg-papel px-2.5 py-1 text-sm font-bold text-tinta shadow-lg ${
            placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          initial={{ opacity: 0, y: 8, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 420, damping: 20 }}
        >
          <span className="text-lg leading-none">{info.emoji}</span>
          {info.label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export interface SeatProps {
  player: PublicPlayer;
  info: SeatInfo | undefined;
  x: number;
  y: number;
  isTurn: boolean;
  deadline: number | null;
  phase: Phase;
  remaining: number;
  startingLives: number;
  shownCards: CardId[] | null;
  reaction: LiveReaction | undefined;
  compact: boolean;
}

/** Oponente ao redor da mesa. */
export const Seat = memo(function Seat(p: SeatProps) {
  const { player, info } = p;
  const avatarSize = p.compact ? 40 : 50;
  const showTricks = p.phase !== 'bidding';
  const out = player.eliminated;
  const [bump, setBump] = useState(0);
  useEffect(() => setBump((b) => b + 1), [player.tricks]);

  return (
    <div
      className="absolute z-10 flex w-[84px] flex-col items-center"
      style={{ left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}
      aria-label={`${player.name}${out ? ', fora do jogo' : ''}`}
    >
      {p.shownCards && p.shownCards.length > 0 && (
        <div className="mb-1 flex justify-center" style={{ marginLeft: p.shownCards.length > 1 ? 12 : 0 }}>
          {p.shownCards.map((id, i) => (
            <motion.div
              key={id}
              initial={{ y: -8, opacity: 0, rotate: -6 }}
              animate={{ y: 0, opacity: 1, rotate: p.shownCards!.length === 1 ? -6 : (i - (p.shownCards!.length - 1) / 2) * 5 }}
              style={{ marginLeft: i === 0 ? 0 : -14 }}
              className="drop-shadow-[0_4px_6px_rgb(0_0_0/0.45)]"
            >
              <Card id={id} width={p.shownCards!.length === 1 ? (p.compact ? 30 : 36) : 26} />
            </motion.div>
          ))}
        </div>
      )}
      <div className="relative">
        {p.isTurn && !out && <TurnRing size={avatarSize} deadline={p.deadline} />}
        <Avatar seed={info?.avatar ?? player.id} size={avatarSize} dim={out} />
        {player.isDealer && !out && (
          <span className="absolute -left-2 -top-1">
            <DealerChip size="sm" />
          </span>
        )}
        {!out && player.inRound && (
          <motion.span
            key={bump}
            className="absolute -bottom-1 -right-3"
            animate={player.tricks > 0 && showTricks ? { scale: [1, 1.35, 1] } : undefined}
            transition={{ duration: 0.35 }}
          >
            <BidBadge bid={player.bid} tricks={player.tricks} remaining={p.remaining} showTricks={showTricks} size="sm" />
          </motion.span>
        )}
        {info && info.kind === 'human' && !info.connected && !out && (
          <span className="absolute -right-2 -top-1 rounded-full bg-noite px-1.5 text-[10px] font-bold text-papel ring-1 ring-papel/30">
            caiu
          </span>
        )}
        <ReactionBubble reaction={p.reaction} placement={p.y < 90 ? 'below' : 'above'} />
      </div>
      <span
        className={`mt-1 max-w-full truncate px-1 text-center text-xs font-bold texto-gravado ${out ? 'text-papel/50 line-through' : 'text-papel'}`}
      >
        {player.name}
      </span>
      {out ? (
        <span className="rounded-full bg-copas/85 px-2 text-[11px] font-bold text-papel">fora</span>
      ) : (
        <Matches lives={player.lives} starting={p.startingLives} size={p.compact ? 11 : 13} />
      )}
    </div>
  );
});
