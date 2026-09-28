import { card as cardOf, type CardId, type Rank, type Suit } from '@fodinha/engine';
import { memo } from 'react';

/** Cor de "tinta" de cada naipe (índices e moldura), com contraste sobre o papel. */
export const SUIT_INK: Readonly<Record<Suit, string>> = {
  O: '#96610f',
  C: '#b3302a',
  E: '#28528c',
  P: '#2f6a2c',
};

const SUIT_TINT: Readonly<Record<Suit, string>> = {
  O: '#f6e3b0',
  C: '#f4d7cf',
  E: '#d9e4f3',
  P: '#dbead3',
};

/** "Pinta" do baralho espanhol: interrupções na moldura (ouros 0, copas 1, espadas 2, paus 3). */
const PINTA_GAPS: Readonly<Record<Suit, number>> = { O: 0, C: 1, E: 2, P: 3 };

const L = 5;
const R = 95;
const T = 5;
const B = 145;
const RAD = 4.5;
const GAP = 7;

function edge(y: number, gaps: number): string {
  const x1 = L + RAD;
  const x2 = R - RAD;
  if (gaps === 0) return `M${x1} ${y}H${x2}`;
  const len = x2 - x1;
  let d = '';
  let start = x1;
  for (let k = 1; k <= gaps; k++) {
    const c = x1 + (len * k) / (gaps + 1);
    d += `M${start} ${y}H${c - GAP / 2}`;
    start = c + GAP / 2;
  }
  return `${d}M${start} ${y}H${x2}`;
}

const FRAME_SIDES =
  `M${L + RAD} ${T}A${RAD} ${RAD} 0 0 0 ${L} ${T + RAD}V${B - RAD}A${RAD} ${RAD} 0 0 0 ${L + RAD} ${B}` +
  `M${R - RAD} ${T}A${RAD} ${RAD} 0 0 1 ${R} ${T + RAD}V${B - RAD}A${RAD} ${RAD} 0 0 1 ${R - RAD} ${B}`;

const FRAMES: Readonly<Record<Suit, string>> = {
  O: FRAME_SIDES + edge(T, 0) + edge(B, 0),
  C: FRAME_SIDES + edge(T, 1) + edge(B, 1),
  E: FRAME_SIDES + edge(T, 2) + edge(B, 2),
  P: FRAME_SIDES + edge(T, 3) + edge(B, 3),
};

type Pip = readonly [x: number, y: number];

const PIPS: Readonly<Record<number, { size: number; at: readonly Pip[] }>> = {
  1: { size: 52, at: [[50, 75]] },
  2: { size: 30, at: [[50, 47], [50, 103]] },
  3: { size: 26, at: [[50, 41], [50, 75], [50, 109]] },
  4: { size: 26, at: [[34, 47], [66, 47], [34, 103], [66, 103]] },
  5: { size: 24, at: [[34, 43], [66, 43], [50, 75], [34, 107], [66, 107]] },
  6: { size: 22, at: [[34, 41], [66, 41], [34, 75], [66, 75], [34, 109], [66, 109]] },
  7: {
    size: 21,
    at: [[34, 38], [66, 38], [50, 57], [34, 76], [66, 76], [34, 112], [66, 112]],
  },
};

function Index({ rank, suit }: { rank: Rank; suit: Suit }) {
  const twoDigits = rank >= 10;
  return (
    <g>
      <text
        x="13.5"
        y="23.5"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight={750}
        fontSize={twoDigits ? 16 : 20}
        letterSpacing={twoDigits ? -1.2 : 0}
        fill={SUIT_INK[suit]}
        style={{ fontVariationSettings: '"opsz" 36, "SOFT" 40' }}
      >
        {rank}
      </text>
      <use href={`#suit-${suit}`} x="8" y="27" width="11" height="11" />
    </g>
  );
}

function Center({ rank, suit }: { rank: Rank; suit: Suit }) {
  if (rank <= 7) {
    const layout = PIPS[rank]!;
    const h = layout.size / 2;
    return (
      <g>
        {rank === 1 && <circle cx="50" cy="75" r="31" fill={SUIT_TINT[suit]} opacity="0.85" />}
        {layout.at.map(([x, y], i) => (
          <use
            key={i}
            href={`#suit-${suit}`}
            x={x - h}
            y={y - h}
            width={layout.size}
            height={layout.size}
          />
        ))}
      </g>
    );
  }
  return (
    <g>
      <rect
        x="17"
        y="24"
        width="66"
        height="102"
        rx="5"
        fill={SUIT_TINT[suit]}
        stroke={SUIT_INK[suit]}
        strokeWidth="0.9"
        strokeOpacity="0.55"
      />
      <use href={`#fig-${rank}`} x="23" y="30" width="54" height="54" style={{ color: SUIT_INK[suit] }} />
      <use href={`#suit-${suit}`} x="34" y="86" width="32" height="32" />
    </g>
  );
}

export const CardFace = memo(function CardFace({ id }: { id: CardId }) {
  const { suit, rank } = cardOf(id);
  return (
    <g>
      <rect x="0.5" y="0.5" width="99" height="149" rx="7" fill="url(#g-papel)" stroke="#cdb994" strokeWidth="1" />
      <path d={FRAMES[suit]} fill="none" stroke={SUIT_INK[suit]} strokeWidth="1.1" strokeOpacity="0.75" />
      <Index rank={rank} suit={suit} />
      <g transform="rotate(180 50 75)">
        <Index rank={rank} suit={suit} />
      </g>
      <Center rank={rank} suit={suit} />
    </g>
  );
});

export interface CardProps {
  /** Sem `id` (ou com `faceDown`), mostra o verso. */
  id?: CardId | null;
  faceDown?: boolean;
  /** Largura em px; a altura é 1,5×. */
  width: number;
  className?: string;
  title?: string;
}

/** Carta estática (sem animação). Para animar, envolva num `motion.div`. */
export const Card = memo(function Card({ id, faceDown, width, className, title }: CardProps) {
  const showFace = id && !faceDown;
  return (
    <svg
      viewBox="0 0 100 150"
      width={width}
      height={width * 1.5}
      className={className}
      role="img"
      aria-label={title}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {showFace ? <CardFace id={id} /> : <use href="#card-back" width="100" height="150" />}
    </svg>
  );
});
