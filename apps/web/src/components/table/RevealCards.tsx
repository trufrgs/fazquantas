import { card as cardOf, cardName, type PublicPlayer } from '@fodinha/engine';
import { motion } from 'motion/react';
import { Card, CARD_RATIO } from '../cards/Card';
import { tossRotation, type RevealLayout } from './layout';

/** Largura do leque de quem assiste com a mão toda aberta, em cartas do tamanho cheio. */
export const REVEAL_FAN = 1.3;

/**
 * Cartas à mostra dos outros: a da testa (rodada às cegas) ou a mão toda (para quem saiu e
 * assiste). Ficam na frente de cada assento, no tamanho que `revealLayout` calculou.
 */
export function RevealCards({ players, you, layout }: { players: readonly PublicPlayer[]; you: string | null; layout: RevealLayout }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      {players.map((p) => {
        const cards = p.id === you ? null : p.visibleCards;
        const at = layout.spots.get(p.id);
        if (!cards || cards.length === 0 || !at) return null;
        const n = cards.length;
        const w = n === 1 ? layout.cardWidth : layout.cardWidth * 0.62;
        const h = w * CARD_RATIO;
        const step = n > 1 ? Math.min(w * 0.42, (layout.cardWidth * REVEAL_FAN - w) / (n - 1)) : 0;
        const total = w + step * (n - 1);
        return (
          <motion.div
            key={p.id}
            role="group"
            aria-label={`${n === 1 ? 'Carta' : 'Cartas'} de ${p.name}: ${cards.map((id) => cardName(cardOf(id))).join(', ')}`}
            className="absolute"
            style={{ left: at.x - total / 2, top: at.y - h / 2, width: total, height: h }}
            initial={{ opacity: 0, scale: 0.7, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            {cards.map((id, i) => (
              <span
                key={id}
                aria-hidden="true"
                className="absolute top-0 drop-shadow-[0_6px_10px_rgb(0_0_0/0.45)]"
                style={{ left: i * step, transform: `rotate(${n === 1 ? tossRotation(id) * 0.6 : (i - (n - 1) / 2) * 4}deg)` }}
              >
                <Card id={id} width={w} />
              </span>
            ))}
          </motion.div>
        );
      })}
    </div>
  );
}
