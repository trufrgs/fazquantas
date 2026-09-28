import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { useSettings } from '../../stores/settings';

type Variant = 'ouro' | 'papel' | 'copas' | 'vidro';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}

const SIZES = {
  sm: 'min-h-10 px-4 text-sm',
  md: 'min-h-12 px-5 text-base',
  lg: 'min-h-14 px-6 text-lg',
};

/** Botão-ficha com som de clique e vibração leve. */
export function Button({ variant = 'papel', size = 'md', icon, className, onClick, children, ...rest }: ButtonProps) {
  const hapticsOn = useSettings((s) => s.haptics);
  return (
    <button
      type="button"
      {...rest}
      className={`ficha ficha-${variant} ${SIZES[size]} ${className ?? ''}`}
      onClick={(e) => {
        play('click');
        void haptic('tap', hapticsOn);
        onClick?.(e);
      }}
    >
      {icon}
      {children}
    </button>
  );
}

/** Botão redondo só com ícone (barra do topo, fechar). */
export function IconButton({
  label,
  className,
  onClick,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full bg-noite/45 text-papel ring-1 ring-papel/15 backdrop-blur-sm transition active:scale-95 ${className ?? ''}`}
      onClick={(e) => {
        play('click');
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}
