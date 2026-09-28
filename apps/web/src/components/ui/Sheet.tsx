import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** Rótulo acessível do diálogo. */
  label: string;
  className?: string;
  /**
   * Com fundo escurecido, a folha é modal (toque fora fecha). Sem ele, a mesa por trás continua
   * tocável (ex.: resumo da rodada enquanto dá para reagir).
   */
  backdrop?: boolean;
}

/** Folha que sobe da base da tela. */
export function Sheet({ open, onClose, children, label, className, backdrop = true }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Foco vai para a folha ao abrir (leitor de tela e teclado) e volta ao que estava antes ao fechar.
  useEffect(() => {
    if (!open || !backdrop) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const t = window.setTimeout(() => panel.current?.focus(), 30);
    return () => {
      window.clearTimeout(t);
      previous?.focus?.();
    };
  }, [open, backdrop]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className={`fixed inset-0 z-50 flex items-end justify-center ${backdrop ? '' : 'pointer-events-none'}`}
          role="dialog"
          aria-modal={backdrop ? 'true' : undefined}
          aria-label={label}
        >
          {backdrop && (
            <motion.div
              className="absolute inset-0 bg-noite/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              aria-hidden="true"
            />
          )}
          <motion.div
            ref={panel}
            tabIndex={-1}
            className={`papel pointer-events-auto relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] px-5 pt-3 shadow-[0_-12px_40px_rgb(0_0_0/0.45)] outline-none ${className ?? ''}`}
            style={{ paddingBottom: 'calc(1.25rem + var(--safe-bottom))' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-tinta/20" />
            {onClose && backdrop && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-tinta/8 text-tinta-2 transition active:scale-95"
              >
                <X size={20} />
              </button>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
