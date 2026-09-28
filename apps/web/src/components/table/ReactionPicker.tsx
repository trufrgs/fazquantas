import { REACTIONS, type ReactionId } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';

export function ReactionPicker({ open, onPick, onClose }: { open: boolean; onPick: (r: ReactionId) => void; onClose: () => void }) {
  useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(t);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="menu"
            aria-label="Reações"
            className="papel absolute right-3 z-50 grid grid-cols-4 gap-1 rounded-3xl p-2 shadow-2xl"
            style={{ top: 'calc(3.6rem + var(--safe-top))' }}
            initial={{ opacity: 0, scale: 0.85, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -6 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            {REACTIONS.map((r) => (
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
