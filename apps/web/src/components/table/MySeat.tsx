import type { Phase, PublicPlayer } from '@fodinha/engine';
import { AnimatePresence } from 'motion/react';
import type { LiveReaction } from '../../stores/game';
import { RostoNaMesa } from '../ui/Midia';
import { useMidia } from '../../lib/midia';
import { Matches } from '../ui/Matches';
import { Palheiro } from './Palheiro';
import { BidBadge, CantadaBubble, DealerChip, MaoChip, ReactionBubble, TurnRing } from './Seat';
import { Lanterna } from './zoeira/desenhos';
import type { Enfeites } from './zoeira/diretor';
import { RostoZoado } from './zoeira/RostoZoado';
import { ChapeuDePatrao } from '../sala/ChapeuDePatrao';
import { rem } from '../../lib/ui-scale';

export type StatusTone = 'turn' | 'info' | 'good' | 'bad';

export interface MySeatProps {
  player: PublicPlayer;
  avatar: string;
  phase: Phase;
  remaining: number;
  startingLives: number;
  status: { text: string; tone: StatusTone };
  reaction: LiveReaction | undefined;
  isTurn: boolean;
  /** Prazo da tua vez (online com tempo por jogada). */
  deadline: number | null;
  /** És mão: palpita e joga primeiro na rodada. */
  isMao: boolean;
  /** Alguém está demorando: teu avatar também puxa um palheiro enquanto espera. */
  pitando?: boolean;
  /** Rodada atual (o balão da tua cantada toca uma vez por rodada). */
  round: number;
  /** A zoeira do teu assento (ver `zoeira/diretor.ts`). */
  enfeites?: Enfeites;
  /** És patrão da mesa: o chapéu ao lado do nome. */
  patrao?: boolean;
}

const TONE: Record<StatusTone, string> = {
  turn: 'bg-ouros text-tinta shadow-[0_2px_0_var(--color-ouros-escuro)]',
  info: 'bg-noite/50 text-papel ring-1 ring-papel/15',
  good: 'bg-paus text-papel',
  bad: 'bg-copas text-papel',
};

/** Sua faixa acima da mão: avatar, vidas, palpite e o que está acontecendo. */
export function MySeat({ player, avatar, phase, remaining, startingLives, status, reaction, isTurn, deadline, isMao, round, pitando = false, enfeites, patrao = false }: MySeatProps) {
  // A tua câmera aberta: a prévia fica maior que o avatar.
  const rosto = useMidia((s) => (s.local ? 56 : 40));
  return (
    <div className="relative z-20 flex items-center gap-2.5 px-3">
      <div className="relative">
        {isTurn && !player.eliminated && <TurnRing key={deadline ?? 0} size={rosto} deadline={deadline} />}
        <RostoZoado id={player.id} size={rosto} enfeites={enfeites}>
          <RostoNaMesa playerId={player.id} seed={avatar} size={40} tamanhoVideo={56} dim={player.eliminated} fora={player.eliminated} />
        </RostoZoado>
        <AnimatePresence>{pitando && !player.eliminated && <Palheiro key="palheiro" size={rosto} atraso={1.7} />}</AnimatePresence>
        {phase === 'bidding' && <CantadaBubble bid={player.bid} round={round} placement="above" edge="left" />}
        <ReactionBubble reaction={reaction} placement="above" edge="left" />
      </div>
      <div className="flex min-w-0 flex-col">
        {/* "mão"/"pé" ao lado do nome: em cima do avatar pequeno, cobria o rosto (relato de 29/09/2026). */}
        <span className="flex min-w-0 items-center gap-1.5">
          {patrao && <ChapeuDePatrao w={16} />}
          {!player.eliminated && enfeites?.lanterna && <Lanterna w={rem(12)} className="shrink-0" />}
          <span className={`truncate text-sm font-bold texto-gravado transition-colors ${isTurn && !player.eliminated ? 'text-ouros' : ''}`}>{player.name}</span>
          {!player.eliminated && (player.isDealer || isMao) && (player.isDealer ? <DealerChip size="sm" /> : <MaoChip size="sm" />)}
        </span>
        {player.eliminated ? (
          <span className="whitespace-nowrap font-hand text-sm font-bold leading-none text-papel/85">{enfeites?.epitafio ?? 'fora'}</span>
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
