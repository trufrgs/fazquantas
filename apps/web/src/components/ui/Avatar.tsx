import { memo } from 'react';
import { avatarBackground, avatarUri } from '../../lib/avatar';
import { rem } from '../../lib/ui-scale';

export interface AvatarProps {
  seed: string;
  /** Diâmetro em px na escala 1 (cresce com a escala da interface). */
  size: number;
  dim?: boolean;
  className?: string;
}

export const Avatar = memo(function Avatar({ seed, size, dim, className }: AvatarProps) {
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden rounded-full ${className ?? ''}`}
      style={{
        width: rem(size),
        height: rem(size),
        background: avatarBackground(seed),
        boxShadow: 'inset 0 -3px 0 rgb(0 0 0 / 0.18), 0 2px 6px rgb(0 0 0 / 0.35)',
        filter: dim ? 'grayscale(1) brightness(0.7)' : undefined,
      }}
    >
      <img src={avatarUri(seed)} alt="" draggable={false} className="h-full w-full" />
    </span>
  );
});
