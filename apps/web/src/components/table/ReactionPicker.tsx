import { GALOS, REACTIONS, type ReactionId } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';

/** As frases do quadro (o "é galo" tem a fileira dele, com a carta). */
const FRASES = REACTIONS.filter((r) => !r.id.startsWith('galo-'));

export function ReactionPicker({ open, onPick, onClose }: { open: boolean; onPick: (r: ReactionId) => void; onClose: () => void }) {
  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(onClose, 8000);
    return () => window.clearTimeout(t);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="ate-o-fim fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="menu"
            aria-label="Reações"
            className="papel absolute right-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col gap-1.5 rounded-3xl p-2 shadow-2xl"
            style={{ top: 'calc(3.6rem + var(--safe-top))' }}
            initial={{ opacity: 0, scale: 0.85, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -6 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            <div className="grid grid-cols-4 gap-1">
              {FRASES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="menuitem"
                  onClick={() => onPick(r.id)}
                  className="flex w-[4.5rem] flex-col items-center gap-0.5 rounded-2xl px-1 py-2 transition active:scale-95 active:bg-tinta/10"
                >
                  <span className="text-2xl leading-none">{r.emoji}</span>
                  <span className="text-[0.6875rem] font-semibold text-tinta-2">{r.label}</span>
                </button>
              ))}
            </div>
            {/* "2 é galo, hein!": combina com a mesa de deixar essa carta passar. */}
            <div className="flex flex-col gap-1 border-t border-tinta/10 px-1 pt-1.5" role="group" aria-label="É galo">
              <span className="flex items-center gap-1 text-[0.6875rem] font-semibold text-tinta-2">
                <span className="text-lg leading-none">🐓</span> É galo, hein! Qual carta?
              </span>
              <div className="grid grid-cols-10 gap-0.5">
                {GALOS.map((g) => (
                  <button
                    key={g.valor}
                    type="button"
                    role="menuitem"
                    aria-label={`${g.nome} é galo`}
                    onClick={() => onPick(`galo-${g.valor}`)}
                    className="rounded-lg bg-tinta/5 py-1.5 font-display text-sm font-bold tabular-nums text-tinta transition active:scale-95 active:bg-tinta/15"
                  >
                    {g.nome}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
