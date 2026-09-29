import { REACTIONS, type Phase, type PublicPlayer } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useState } from 'react';
import type { SeatInfo } from '../../lib/connection';
import type { LiveReaction } from '../../stores/game';
import { Avatar } from '../ui/Avatar';
import { Matches } from '../ui/Matches';
import { rem } from '../../lib/ui-scale';

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
  const label = showTricks ? `Fez ${tricks} de ${bid}` : `Cantou ${bid}`;
  return (
    <motion.span
      key={`${bid}`}
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex items-baseline justify-center rounded-full font-bold tabular-nums shadow-[0_2px_0_rgb(0_0_0/0.35)] ring-1 ring-black/15 ${TONE_CLASS[tone]} ${
        showTricks
          ? size === 'sm'
            ? 'min-w-7 px-1.5 py-0.5 text-xs'
            : 'min-w-9 px-2 py-0.5 text-sm'
          : size === 'sm'
            ? 'min-w-8 px-2 py-0.5 text-sm'
            : 'min-w-10 px-2.5 py-0.5 text-base'
      }`}
    >
      {showTricks ? (
        <>
          {tricks}
          <span className="px-px opacity-60">/</span>
          {bid}
        </>
      ) : (
        <>
          <span className="mr-0.5 text-[0.7em] font-semibold opacity-75">faz</span>
          {bid}
        </>
      )}
    </motion.span>
  );
}

/** Anel de vez (pulsa) com contagem regressiva quando há tempo de jogada. `size` em px na escala 1. */
export function TurnRing({ size, deadline }: { size: number; deadline: number | null }) {
  const [start] = useState(() => Date.now());
  const total = deadline ? Math.max(0, deadline - start) : 0;
  const r = size / 2 + 4;
  const c = 2 * Math.PI * r;
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <motion.span
        className="absolute rounded-full"
        style={{ width: rem(size + 12), height: rem(size + 12), boxShadow: '0 0 0 3px var(--color-luz), 0 0 22px 6px rgb(255 205 130 / 0.55)' }}
        animate={{ opacity: [0.65, 1, 0.65], scale: [1, 1.04, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      {deadline && total > 0 && (
        <svg width={rem(size + 16)} height={rem(size + 16)} viewBox={`0 0 ${size + 16} ${size + 16}`} className="absolute -rotate-90">
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
        size === 'sm' ? 'h-5 px-1.5 text-[0.625rem]' : 'h-6 px-2 text-xs'
      }`}
      title="Pé: deu as cartas e palpita por último"
    >
      pé
    </span>
  );
}

/** Quem é mão: palpita e joga primeiro na rodada (o par do pé). */
function MaoChip({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-papel font-display font-bold text-tinta shadow-[0_2px_0_rgb(0_0_0/0.35)] ring-1 ring-black/20 ${
        size === 'sm' ? 'h-5 px-1.5 text-[0.625rem]' : 'h-6 px-2 text-xs'
      }`}
      title="Mão: palpita e joga primeiro nesta rodada"
    >
      mão
    </span>
  );
}

/**
 * Cartas que ainda estão na mão (fechadas): um versinho de carta com o número, no canto de baixo
 * do avatar, espelhando o selo do palpite. Some quando não sobra carta.
 */
export function HandCount({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = `${count} ${count === 1 ? 'carta' : 'cartas'} na mão`;
  return (
    <span className="relative inline-flex" role="img" aria-label={label} title={label}>
      {count > 1 && (
        <span className="absolute -left-[3px] -top-[2px] h-5 w-[0.875rem] rotate-[-10deg] rounded-[3px] bg-[#6d1c17] ring-1 ring-papel/70" />
      )}
      <span className="relative flex h-5 min-w-[0.875rem] items-center justify-center rounded-[3px] bg-gradient-to-b from-[#a52a22] to-[#7a1f1a] px-[3px] text-[0.625rem] font-bold leading-none tabular-nums text-papel shadow-[0_2px_3px_rgb(0_0_0/0.4)] ring-1 ring-papel/80">
        {count}
      </span>
    </span>
  );
}

export { DealerChip, MaoChip };

/** Balão de reação sobre o assento. */
/** Onde o balão ancora: no meio do avatar, ou puxado para dentro quando o assento está na borda. */
export type BubbleEdge = 'left' | 'right' | null;
const EDGE_CLASS: Record<'left' | 'right' | 'center', string> = {
  left: 'left-0',
  right: 'right-0',
  center: 'left-1/2 -translate-x-1/2',
};
/** Onde o balão abre: em cima, embaixo, ou ao lado (quem senta no alto: embaixo fica a carta na testa). */
export type BubblePlacement = 'above' | 'below' | 'left' | 'right';

function bubblePosition(placement: BubblePlacement, edge: BubbleEdge): string {
  if (placement === 'right') return 'left-full ml-2 top-1/2 -translate-y-1/2';
  if (placement === 'left') return 'right-full mr-2 top-1/2 -translate-y-1/2';
  return `${EDGE_CLASS[edge ?? 'center']} ${placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'}`;
}

export function ReactionBubble({
  reaction,
  placement = 'above',
  edge = null,
}: {
  reaction: LiveReaction | undefined;
  placement?: BubblePlacement;
  edge?: BubbleEdge;
}) {
  const info = reaction ? REACTIONS.find((r) => r.id === reaction.reaction) : undefined;
  return (
    <AnimatePresence>
      {info && reaction && (
        <motion.span
          key={reaction.key}
          className={`pointer-events-none absolute z-30 flex items-center gap-1 whitespace-nowrap rounded-2xl bg-papel px-2.5 py-1 text-sm font-bold text-tinta shadow-lg ${bubblePosition(placement, edge)}`}
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

/** Como a cantada sai da boca: "Nenhuma!", "Faço 1!", "Faço 3!". */
export function cantadaText(bid: number): string {
  return bid === 0 ? 'Nenhuma!' : `Faço ${bid}!`;
}

/**
 * Balão da cantada: aparece quando o jogador canta e some sozinho (a animação termina invisível;
 * a chave por rodada faz tocar uma vez só por cantada).
 */
export function CantadaBubble({
  bid,
  round,
  placement = 'above',
  edge = null,
  compact = false,
}: {
  bid: number | null;
  round: number;
  placement?: BubblePlacement;
  edge?: BubbleEdge;
  /** Mesa apertada (celular, muita gente): balão menor, para não cobrir o vizinho. */
  compact?: boolean;
}) {
  if (bid === null) return null;
  return (
    <motion.span
      key={`${round}-${bid}`}
      aria-hidden="true"
      className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-2xl bg-papel font-display font-bold text-tinta shadow-[0_6px_16px_rgb(0_0_0/0.45)] ring-2 ring-ouros ${
        compact ? 'px-2 py-0.5 text-sm' : 'px-3 py-1 text-lg'
      } ${bubblePosition(placement, edge)}`}
      style={{ fontVariationSettings: '"SOFT" 100' }}
      initial={{ opacity: 0, scale: 0.4, y: placement === 'above' ? 10 : placement === 'below' ? -10 : 0 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.1, 1, 0.9], y: 0 }}
      transition={{ duration: 3.2, times: [0, 0.12, 0.85, 1], ease: 'easeOut' }}
    >
      {cantadaText(bid)}
    </motion.span>
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
  reaction: LiveReaction | undefined;
  compact: boolean;
  /** É mão: palpita e joga primeiro na rodada. */
  isMao: boolean;
  /** Rodada atual (o balão da cantada toca uma vez por rodada). */
  round: number;
  /** Assento colado na borda da mesa: os balões abrem para dentro. */
  edge?: BubbleEdge;
  /** Assento no alto: o balão abre para este lado (embaixo fica a carta na testa). */
  side?: 'left' | 'right';
}

/** Oponente ao redor da mesa. */
export const Seat = memo(function Seat(p: SeatProps) {
  const { player, info } = p;
  const avatarSize = p.compact ? 40 : 50;
  const showTricks = p.phase !== 'bidding';
  const out = player.eliminated;

  return (
    <div
      className={`absolute z-10 flex flex-col items-center ${p.compact ? 'w-[4.5rem]' : 'w-[5.25rem]'}`}
      style={{ left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}
      role="group"
      aria-label={`${player.name}${out ? ', fora do jogo' : ''}`}
    >
      <div className="relative">
        {p.isTurn && !out && <TurnRing size={avatarSize} deadline={p.deadline} />}
        <Avatar seed={info?.avatar ?? player.id} size={avatarSize} dim={out} />
        {!out && (player.isDealer || p.isMao) && (
          <span className="absolute -left-2 -top-1">{player.isDealer ? <DealerChip size="sm" /> : <MaoChip size="sm" />}</span>
        )}
        {!out && player.inRound && (
          <span className="absolute -left-2.5 bottom-0">
            <HandCount count={player.handCount - (player.visibleCards?.length ?? 0)} />
          </span>
        )}
        {!out && player.inRound && (
          <motion.span
            key={player.tricks}
            className="absolute -bottom-1 -right-3"
            animate={player.tricks > 0 && showTricks ? { scale: [1, 1.35, 1] } : undefined}
            transition={{ duration: 0.35 }}
          >
            <BidBadge bid={player.bid} tricks={player.tricks} remaining={p.remaining} showTricks={showTricks} size="sm" />
          </motion.span>
        )}
        {info && info.kind === 'human' && (!info.connected || info.away) && !out && (
          <span
            className="absolute -right-2 -top-1 rounded-full bg-noite px-1.5 text-[0.625rem] font-bold text-papel ring-1 ring-papel/30"
            title={info.connected ? 'Estourou o tempo: a mesa está jogando por ele' : 'Saiu da tela: a mesa joga por ele até voltar'}
          >
            {info.connected ? 'ausente' : 'caiu'}
          </span>
        )}
        {p.phase === 'bidding' && (
          <CantadaBubble bid={player.bid} round={p.round} placement={p.y < 90 ? (p.side ?? 'right') : 'above'} edge={p.edge} compact={p.compact} />
        )}
        <ReactionBubble reaction={p.reaction} placement={p.y < 90 ? (p.side ?? 'right') : 'above'} edge={p.edge} />
      </div>
      <span
        className={`mt-1 max-w-full truncate px-1 text-center text-xs font-bold texto-gravado transition-colors ${
          out ? 'text-papel/50 line-through' : p.isTurn ? 'text-ouros' : 'text-papel'
        }`}
      >
        {player.name}
      </span>
      {out ? (
        <span className="rounded-full bg-copas/85 px-2 text-[0.6875rem] font-bold text-papel">fora</span>
      ) : (
        <Matches lives={player.lives} starting={p.startingLives} size={p.compact ? 11 : 13} />
      )}
    </div>
  );
});
