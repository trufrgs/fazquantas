import { card as cardOf, cardName, type CardId } from '@fodinha/engine';
import { memo } from 'react';

/**
 * Baralho de Heraclio Fournier (1878), ilustrado por Ignacio Díaz Olano e Emilio Soubrier —
 * domínio público (digitalização do Museo Fournier de Naipes de Álava, via Wikimedia Commons).
 * O papel foi limpo e as imagens reduzidas por `scripts/process-fournier.py`.
 */
export const CARD_RATIO = 1.6;

const VIEW_H = 100 * CARD_RATIO;

export function cardSrc(id: CardId): string {
  return `${import.meta.env.BASE_URL}cards/${id}.webp`;
}

/** Pré-carrega as 40 imagens (a primeira distribuição não pisca). */
export function preloadCards(ids: readonly CardId[]): void {
  for (const id of ids) {
    const img = new Image();
    img.decoding = 'async';
    img.src = cardSrc(id);
  }
}

/**
 * Índice ampliado no canto (o número impresso é pequeno demais na tela do celular).
 * O contorno da cor do papel esconde o número original por baixo.
 */
function BigIndex({ id }: { id: CardId }) {
  const { rank } = cardOf(id);
  const twoDigits = rank >= 10;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${VIEW_H}`} aria-hidden="true">
      <text
        x="11.9"
        y="18"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight={620}
        fontSize={twoDigits ? 13.2 : 15.5}
        letterSpacing={twoDigits ? -0.7 : 0}
        fill="#2a211a"
        stroke="#fbf7ee"
        strokeWidth="3.6"
        strokeLinejoin="round"
        paintOrder="stroke"
        style={{ fontVariationSettings: '"opsz" 72, "SOFT" 0, "WONK" 0' }}
      >
        {rank}
      </text>
    </svg>
  );
}

export interface CardProps {
  /** Sem `id` (ou com `faceDown`), mostra o verso. */
  id?: CardId | null;
  faceDown?: boolean;
  /** Largura em px; a altura segue a proporção da carta. */
  width: number;
  className?: string;
  title?: string;
}

/** Carta estática (sem animação). Para animar, envolva num `motion.div`. */
export const Card = memo(function Card({ id, faceDown, width, className, title }: CardProps) {
  const height = width * CARD_RATIO;
  if (!id || faceDown) {
    return (
      <svg viewBox={`0 0 100 ${VIEW_H}`} width={width} height={height} className={className} role="img" aria-label={title ?? 'Carta virada'} style={{ display: 'block' }}>
        <use href="#card-back" width="100" height={VIEW_H} />
      </svg>
    );
  }
  return (
    <span
      className={`relative block overflow-hidden ${className ?? ''}`}
      style={{ width, height, borderRadius: width * 0.06, boxShadow: 'inset 0 0 0 1px rgb(60 40 20 / 0.18)' }}
      role="img"
      aria-label={title ?? cardName(cardOf(id))}
    >
      <img src={cardSrc(id)} alt="" width={width} height={height} draggable={false} decoding="async" className="block h-full w-full select-none" />
      {width >= 34 && <BigIndex id={id} />}
    </span>
  );
});
