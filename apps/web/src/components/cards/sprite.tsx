import { CARD_RATIO } from './Card';

const H = 100 * CARD_RATIO;

/**
 * Sprite SVG com o verso das cartas e os gradientes dos palitos — renderizado uma vez na raiz e
 * referenciado por `<use>`. Não usar `display: none` aqui: gradientes dentro de SVG escondido
 * assim somem no Chrome/Firefox.
 */
export function CardSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <linearGradient id="palito" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f6dcac" />
          <stop offset="1" stopColor="#c99a5c" />
        </linearGradient>
        <radialGradient id="chama" cx="0.5" cy="0.7" r="0.6">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.45" stopColor="#ffb534" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
        <pattern id="p-verso" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#8b231c" />
          <path d="M0 0H6M0 0V6" stroke="#b44a3d" strokeWidth="0.8" />
          <circle cx="3" cy="3" r="0.65" fill="#e6c38a" />
        </pattern>

        {/* Verso clássico: bordô com trama fina, filete creme e roseta central. */}
        <symbol id="card-back" viewBox={`0 0 100 ${H}`}>
          <rect width="100" height={H} rx="6" fill="#761a15" />
          <rect x="4.2" y="4.2" width="91.6" height={H - 8.4} rx="3.6" fill="url(#p-verso)" />
          <rect x="4.2" y="4.2" width="91.6" height={H - 8.4} rx="3.6" fill="none" stroke="#efd9ad" strokeWidth="1.4" />
          <rect x="7.2" y="7.2" width="85.6" height={H - 14.4} rx="2.2" fill="none" stroke="#efd9ad" strokeWidth="0.5" opacity="0.75" />
          <g transform={`translate(50 ${H / 2})`}>
            <ellipse rx="17" ry="24" fill="#761a15" stroke="#efd9ad" strokeWidth="1.3" />
            <ellipse rx="13.4" ry="20.4" fill="none" stroke="#efd9ad" strokeWidth="0.5" />
            <path d="M0 -13 L3.2 -3.2 L13 0 L3.2 3.2 L0 13 L-3.2 3.2 L-13 0 L-3.2 -3.2 Z" fill="#efd9ad" />
            <path d="M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6 Z" fill="#761a15" transform="rotate(45)" />
            <circle r="1.8" fill="#efd9ad" />
          </g>
        </symbol>
      </defs>
    </svg>
  );
}
