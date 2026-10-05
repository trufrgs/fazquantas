import type { Phase, PublicPlayer } from '@fodinha/engine';
import type { LiveReaction } from '../../stores/game';
import { RostoNaMesa } from '../ui/Midia';
import { useMidia } from '../../lib/midia';
import { Matches } from '../ui/Matches';
import { BidBadge, CantadaBubble, DealerChip, MaoChip, ReactionBubble, TurnRing } from './Seat';
import type { Enfeites, Mascara } from './zoeira/diretor';
import { RostoZoado } from './zoeira/RostoZoado';

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
  /** Rodada atual (o balão da tua cantada toca uma vez por rodada). */
  round: number;
  /** A zoeira do teu assento (ver `zoeira/diretor.ts`). */
  enfeites?: Enfeites;
  /** O que a última rodada deixou no teu rosto (focinho, nariz). */
  mascara?: Mascara;
}

const TONE: Record<StatusTone, string> = {
  turn: 'bg-ouros text-tinta shadow-[0_2px_0_var(--color-ouros-escuro)]',
  info: 'bg-noite/50 text-papel ring-1 ring-papel/15',
  good: 'bg-paus text-papel',
  bad: 'bg-copas text-papel',
};

/**
 * A tua faixa acima da mão, na mesma ordem dos assentos dos outros: o rosto com os selos nos cantos (pé
 * ou mão em cima, o "faz" embaixo, o microfone do outro lado), o nome com os palitos, e o que está
 * acontecendo. O nome tem prioridade sobre o aviso (antes virava "Th…", o Thomas, 04/10/2026); o chapéu
 * de patrão e a lanterna ficam na sala e nos outros assentos, não aqui.
 */
export function MySeat({ player, avatar, phase, remaining, startingLives, status, reaction, isTurn, deadline, isMao, round, enfeites, mascara }: MySeatProps) {
  // A tua câmera aberta: a prévia fica maior que o avatar.
  const rosto = useMidia((s) => (s.local ? 56 : 44));
  const out = player.eliminated;
  return (
    <div className="relative z-20 flex items-center gap-5 px-3">
      <div className="relative shrink-0">
        {isTurn && !out && <TurnRing key={deadline ?? 0} size={rosto} deadline={deadline} />}
        <RostoZoado id={player.id} size={rosto} enfeites={enfeites} mascara={mascara} frase={reaction}>
          <RostoNaMesa playerId={player.id} seed={avatar} size={44} tamanhoVideo={56} dim={out} fora={out} />
        </RostoZoado>
        {!out && (player.isDealer || isMao) && (
          <span className="absolute -left-3 -top-2">{player.isDealer ? <DealerChip size="sm" /> : <MaoChip size="sm" />}</span>
        )}
        {!out && player.inRound && (
          // Selos mais para fora que nos outros assentos: o teu rosto é pequeno e sumia embaixo deles.
          <span className="absolute -bottom-2 -right-4">
            <BidBadge bid={player.bid} tricks={player.tricks} remaining={remaining} showTricks={phase !== 'bidding'} size="sm" />
          </span>
        )}
        {phase === 'bidding' && <CantadaBubble bid={player.bid} round={round} placement="above" edge="left" />}
        <ReactionBubble reaction={reaction} placement="above" edge="left" />
      </div>
      <div className="flex min-w-[4.5rem] flex-1 flex-col">
        <span className={`truncate text-sm font-bold leading-tight texto-gravado transition-colors ${isTurn && !out ? 'text-ouros' : ''}`}>{player.name}</span>
        {out ? (
          <span className="whitespace-nowrap font-hand text-sm font-bold leading-none text-papel/85">{enfeites?.epitafio ?? 'fora'}</span>
        ) : (
          <Matches lives={player.lives} starting={startingLives} size={14} />
        )}
      </div>
      <span className={`max-w-[58%] shrink truncate rounded-full px-3 py-1.5 text-sm font-bold ${TONE[status.tone]}`} aria-live="polite">
        {status.text}
      </span>
    </div>
  );
}
