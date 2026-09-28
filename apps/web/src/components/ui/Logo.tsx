import { useId } from 'react';
import { rem } from '../../lib/ui-scale';

/**
 * O "?" da marca: o gancho do ponto de interrogação da Fraunces com a chama do palito no lugar do
 * ponto. Mesmo desenho de `brand/marca.html`, recortado para ficar em linha com o texto.
 */
export function QuestionMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="270 120 510 760"
      className={className}
      style={{ display: 'inline-block', width: '0.593em', height: '0.884em', verticalAlign: '-0.151em', overflow: 'visible', ...style }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`chama-${id}`} cx="50%" cy="80%" r="70%">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset=".3" stopColor="#ffd257" />
          <stop offset=".68" stopColor="#ff812c" />
          <stop offset="1" stopColor="#e9482b" />
        </radialGradient>
        <clipPath id={`gancho-${id}`}>
          <rect x="0" y="0" width="1024" height="556" />
        </clipPath>
      </defs>
      <g transform="translate(0 8)">
        <text
          clipPath={`url(#gancho-${id})`}
          x="512"
          y="742"
          textAnchor="middle"
          fontFamily="'Fraunces Variable', Georgia, serif"
          fontWeight={900}
          fontSize={860}
          style={{ fontVariationSettings: '"SOFT" 50, "WONK" 1, "opsz" 144' }}
          fill="currentColor"
        >
          ?
        </text>
        <path
          d="M512 548 C548 610 606 650 612 736 C618 812 566 858 500 858 C434 858 388 814 390 752 C392 700 424 676 452 642 C462 684 480 700 498 704 C484 650 492 596 512 548 Z"
          fill={`url(#chama-${id})`}
        />
        <path
          d="M503 690 C522 724 548 742 548 780 C548 810 528 830 501 830 C474 830 454 812 454 786 C454 762 468 748 480 734 C486 752 494 760 503 762 C498 740 498 712 503 690 Z"
          fill="#fff8de"
          opacity=".85"
        />
      </g>
    </svg>
  );
}

/**
 * Logotipo: "faz" escrito à mão sobre "Quantas", impresso, com o "?" da marca. `size` é o tamanho de
 * "Quantas" (número em px na escala 1, ou qualquer medida CSS, como um `clamp`).
 */
export function Logo({ size = 64, className }: { size?: number | string; className?: string }) {
  return (
    <span
      className={`inline-flex flex-col items-start ${className ?? ''}`}
      style={{ fontSize: typeof size === 'number' ? rem(size) : size }}
      role="img"
      aria-label="Faz quantas?"
    >
      <span
        className="font-hand font-bold leading-none text-luz"
        style={{ fontSize: '0.56em', transform: 'rotate(-4deg)', transformOrigin: 'left', marginLeft: '0.09em', marginBottom: '-0.18em' }}
      >
        faz
      </span>
      <span
        className="whitespace-nowrap font-display font-black leading-[0.9] text-papel texto-gravado"
        style={{ fontVariationSettings: '"SOFT" 50, "WONK" 1, "opsz" 144', letterSpacing: '-0.02em' }}
      >
        Quantas
        <QuestionMark style={{ marginLeft: '0.02em' }} />
      </span>
    </span>
  );
}
