import { rem } from '../../lib/ui-scale';
import { Chapeu } from '../table/zoeira/desenhos';

/** O chapéu do patrão da mesa (quem manda na sala), ao lado do nome. */
export function ChapeuDePatrao({ w = 14, className = '' }: { w?: number; className?: string }) {
  return (
    <span role="img" aria-label="patrão" title="Patrão da mesa" className={`inline-block shrink-0 ${className}`}>
      <Chapeu w={rem(w)} />
    </span>
  );
}
