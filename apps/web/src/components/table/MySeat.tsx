import type { Phase, PublicPlayer } from '@fodinha/engine';
import type { LiveReaction } from '../../stores/game';
import { Avatar } from '../ui/Avatar';
import { Matches } from '../ui/Matches';
import { BidBadge, DealerChip, ReactionBubble } from './Seat';

export type StatusTone = 'turn' | 'info' | 'good' | 'bad';

export interface MySeatProps {
  player: PublicPlayer;
  avatar: string;
  phase: Phase;
  remaining: number;
  startingLives: number;
  status: { text: string; tone: StatusTone };
  reaction: LiveReaction | undefined;
}

const TONE: Record<StatusTone, string> = {
  turn: 'bg-ouros text-tinta shadow-[0_2px_0_var(--color-ouros-escuro)]',
  info: 'bg-noite/50 text-papel ring-1 ring-papel/15',
  good: 'bg-paus text-papel',
  bad: 'bg-copas text-papel',
};

/** Sua faixa acima da mão: avatar, vidas, palpite e o que está acontecendo. */
export function MySeat({ player, avatar, phase, remaining, startingLives, status, reaction }: MySeatProps) {
  return (
    <div className="relative z-20 flex items-center gap-2.5 px-3">
      <div className="relative">
        <Avatar seed={avatar} size={40} dim={player.eliminated} />
        {player.isDealer && !player.eliminated && (
          <span className="absolute -left-2 -top-1.5">
            <DealerChip size="sm" />
          </span>
        )}
        <ReactionBubble reaction={reaction} placement="above" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-bold texto-gravado">{player.name}</span>
        {player.eliminated ? (
          <span className="text-xs font-bold text-copas">fora</span>
        ) : (
          <Matches lives={player.lives} starting={startingLives} size={14} />
        )}
      </div>
      {!player.eliminated && player.inRound && (
        <BidBadge bid={player.bid} tricks={player.tricks} remaining={remaining} showTricks={phase !== 'bidding'} />
      )}
      <span className={`ml-auto truncate rounded-full px-3 py-1.5 text-sm font-bold ${TONE[status.tone]}`} aria-live="polite">
        {status.text}
      </span>
    </div>
  );
}
