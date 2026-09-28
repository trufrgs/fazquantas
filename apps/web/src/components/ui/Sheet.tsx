import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** Rótulo acessível do diálogo. */
  label: string;
  className?: string;
  /** Mostra o fundo escurecido que fecha ao tocar. */
  backdrop?: boolean;
}

/** Folha que sobe da base da tela (modal). */
export function Sheet({ open, onClose, children, label, className, backdrop = true }: SheetProps) {
  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={label}>
          {backdrop && (
            <motion.div
              className="absolute inset-0 bg-noite/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
          )}
          <motion.div
            className={`papel relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-5 pt-3 shadow-[0_-12px_40px_rgb(0_0_0/0.45)] ${className ?? ''}`}
            style={{ paddingBottom: 'calc(1.25rem + var(--safe-bottom))' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-tinta/20" />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
