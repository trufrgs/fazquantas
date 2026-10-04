import { card as cardOf, cardName, type CardId } from '@fodinha/engine';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CARD_RATIO } from '../cards/Card';

export interface HandProps {
  cards: CardId[];
  /** Rodada às cegas: quantas cartas viradas para baixo mostrar. */
  hiddenCount: number;
  canPlay: boolean;
  onPlay: (id: CardId) => void;
  suggested: CardId | null;
  starred: ReadonlySet<CardId>;
  /** Muda a cada rodada (dispara a animação de distribuir). */
  roundKey: number;
  width: number;
  cardWidth: number;
  /** Deslocamento (px) do centro da mão até o monte, para as cartas "saírem" dele. */
  dealFrom: { x: number; y: number };
  oneTap: boolean;
  /** Atalhos de teclado ligados (desligados com menu/folha aberta por cima). */
  keyboard?: boolean;
  /**
   * Jogou a carta num arrasto rápido: bate na mesa (só enfeite; a carta vale o mesmo). `forca` de 1 a 3
   * pela velocidade do arrasto.
   */
  onPancada?: (forca: 1 | 2 | 3) => void;
}

interface Slot {
  id: CardId | `oculta-${number}`;
  x: number;
  y: number;
  rotate: number;
  row: number;
}

/** Inclinação (graus) entre cartas vizinhas do leque. */
const tiltStep = (m: number) => Math.min(3.2, 26 / Math.max(m, 1));

function layoutFan(ids: Slot['id'][], width: number, cw: number): Slot[] {
  const n = ids.length;
  if (n === 0) return [];
  // As cartas das pontas inclinam e o canto de cima sai para fora: a margem cobre isso.
  const tilt = (tiltStep(n) * (n - 1)) / 2;
  const edge = cw * CARD_RATIO * Math.sin((tilt * Math.PI) / 180) + cw * 0.08 + 6;
  const avail = Math.max(cw, width - 2 * edge);
  const maxSpacing = (m: number) => cw * (m <= 3 ? 1.04 : m <= 5 ? 0.8 : 0.7);
  const oneRowSpacing = n > 1 ? Math.min(maxSpacing(n), (avail - cw) / (n - 1)) : 0;
  const rows = n > 8 && oneRowSpacing < cw * 0.34 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const slots: Slot[] = [];
  for (let r = 0; r < rows; r++) {
    const rowIds = ids.slice(r * perRow, (r + 1) * perRow);
    const m = rowIds.length;
    const spacing = m > 1 ? Math.min(maxSpacing(m), (avail - cw) / (m - 1)) : 0;
    const total = cw + spacing * (m - 1);
    const start = (width - total) / 2;
    const step = tiltStep(m);
    rowIds.forEach((id, i) => {
      const off = i - (m - 1) / 2;
      slots.push({
        id,
        x: start + i * spacing,
        y: Math.abs(off) ** 2 * (rows === 1 ? 1.2 : 0.8) - (rows === 2 && r === 0 ? cw * 0.62 : 0),
        rotate: off * step,
        row: r,
      });
    });
  }
  return slots;
}

/** Tuas cartas em leque. Toque escolhe; segundo toque (ou arrastar para cima) joga. */
export function Hand(p: HandProps) {
  const [picked, setPicked] = useState<{ id: CardId; round: number } | null>(null);
  // Seleção só vale na tua vez, na mesma rodada e com a carta ainda na mão (derivado, sem efeito).
  const selected =
    p.canPlay && picked && picked.round === p.roundKey && p.cards.includes(picked.id) ? picked.id : null;
  const round = p.roundKey;
  const setSelected = useCallback((id: CardId | null) => setPicked(id ? { id, round } : null), [round]);
  const ids = useMemo<Slot['id'][]>(
    () => (p.hiddenCount > 0 ? Array.from({ length: p.hiddenCount }, (_, i) => `oculta-${i}` as const) : p.cards),
    [p.cards, p.hiddenCount],
  );
  const slots = useMemo(() => layoutFan(ids, p.width, p.cardWidth), [ids, p.width, p.cardWidth]);
  const cw = p.cardWidth;
  const ch = cw * CARD_RATIO;
  const twoRows = slots.some((s) => s.row === 1);

  // Teclado: ←/→ escolhem, Enter/Espaço jogam.
  useEffect(() => {
    if (!p.canPlay || p.hiddenCount > 0 || p.keyboard === false) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const i = selected ? p.cards.indexOf(selected) : -1;
      if (e.key === 'ArrowRight') setSelected(p.cards[Math.min(p.cards.length - 1, i + 1)] ?? null);
      else if (e.key === 'ArrowLeft') setSelected(p.cards[Math.max(0, i - 1)] ?? p.cards[0] ?? null);
      else if ((e.key === 'Enter' || e.key === ' ') && selected) {
        e.preventDefault();
        p.onPlay(selected);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, selected, setSelected]);

  const tap = (id: CardId) => {
    if (!p.canPlay) return;
    if (p.oneTap || selected === id) p.onPlay(id);
    else setSelected(id);
  };

  return (
    <div
      className="relative mx-auto"
      style={{ width: p.width, height: ch + (twoRows ? cw * 0.62 : 0) + 14 }}
      role="group"
      aria-label="Tuas cartas"
    >
      {slots.map((s, index) => {
          const hidden = typeof s.id === 'string' && s.id.startsWith('oculta-');
          const id = s.id as CardId;
          const isSel = !hidden && selected === id;
          const lift = isSel ? -Math.min(30, ch * 0.2) : p.canPlay && !hidden ? -4 : 0;
          const label = hidden ? 'Tua carta (escondida)' : cardName(cardOf(id));
          return (
            <motion.button
              key={`${p.roundKey}-${s.id}`}
              layoutId={hidden ? `oculta-${p.roundKey}` : `card-${id}`}
              type="button"
              aria-label={label}
              aria-pressed={isSel}
              disabled={!p.canPlay || hidden}
              onClick={() => !hidden && tap(id)}
              drag={p.canPlay && !hidden ? 'y' : false}
              dragConstraints={{ top: -160, bottom: 0 }}
              dragElastic={0.2}
              dragSnapToOrigin
              onDragEnd={(_, info) => {
                if (!hidden && p.canPlay && info.offset.y < -55) {
                  p.onPlay(id);
                  // Arrasto rápido para cima: a carta bate na mesa como no bolicho.
                  const v = -info.velocity.y;
                  if (v > 1600) p.onPancada?.(v > 3600 ? 3 : v > 2500 ? 2 : 1);
                }
              }}
              className="absolute bottom-2 origin-bottom touch-none outline-offset-4 disabled:cursor-default"
              style={{ left: s.x, zIndex: (s.row + 1) * 100 + index, width: cw, height: ch, borderRadius: cw * 0.06 }}
              initial={{ x: p.dealFrom.x - (s.x + cw / 2 - p.width / 2), y: p.dealFrom.y, rotate: 0, scale: 0.5, opacity: 0 }}
              animate={{ x: 0, y: s.y + lift, rotate: s.rotate, scale: isSel ? 1.06 : 1, opacity: 1 }}
              transition={{
                type: 'spring',
                stiffness: 320,
                damping: 28,
                delay: 0,
                opacity: { duration: 0.2, delay: index * 0.06 },
                x: { type: 'spring', stiffness: 220, damping: 26, delay: index * 0.06 },
                y: { type: 'spring', stiffness: 260, damping: 24, delay: 0 },
              }}
            >
              <span
                style={{ borderRadius: cw * 0.06 }}
                className={`block h-full w-full transition-shadow ${
                  isSel
                    ? 'shadow-[0_0_0_3px_var(--color-luz),0_14px_24px_rgb(0_0_0/0.5)]'
                    : !hidden && p.suggested === id && p.canPlay
                      ? 'shadow-[0_0_0_2px_rgb(255_217_160/0.9),0_0_18px_4px_rgb(255_205_130/0.45),0_8px_16px_rgb(0_0_0/0.45)]'
                      : 'shadow-[0_6px_14px_rgb(0_0_0/0.45)]'
                }`}
              >
                <Card id={hidden ? null : id} width={cw} />
              </span>
              {hidden && (
                <span className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-full bg-papel px-2 py-0.5 font-display text-lg font-bold text-tinta shadow">
                  ?
                </span>
              )}
              {!hidden && p.starred.has(id) && (
                <span
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ouros text-[0.6875rem] text-tinta shadow ring-1 ring-black/25"
                  title="Manilha"
                  aria-hidden="true"
                >
                  ★
                </span>
              )}
            </motion.button>
          );
        })}
    </div>
  );
}
