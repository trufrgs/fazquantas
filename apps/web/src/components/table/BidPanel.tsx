import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Lightbulb } from 'lucide-react';

export interface BidPanelProps {
  open: boolean;
  cards: number;
  legal: readonly number[];
  forbidden: number | null;
  bidsSum: number;
  suggested: number | null;
  blind: boolean;
  isDealer: boolean;
  onBid: (value: number) => void;
}

/** Painel "Quantas você faz?" — toque no número confirma o palpite. */
export function BidPanel(p: BidPanelProps) {
  const options = Array.from({ length: p.cards + 1 }, (_, i) => i);
  const { open, legal, onBid } = p;

  // Desktop: as teclas 0–9 palpitam.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const n = Number(e.key);
      if (e.key.length === 1 && Number.isInteger(n) && legal.includes(n)) {
        e.preventDefault();
        onBid(n);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, legal, onBid]);
  const big = options.length > 8;
  return (
    <AnimatePresence>
      {p.open && (
        <motion.section
          aria-label="Seu palpite"
          className="papel absolute inset-x-3 bottom-2 z-40 mx-auto max-w-md rounded-[24px] px-4 pb-3.5 pt-3 shadow-[0_18px_40px_rgb(0_0_0/0.55)] ring-1 ring-black/10"
          initial={{ y: 40, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 30, opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          <header className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[1.35rem] font-bold leading-tight" style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
              Quantas você faz?
            </h2>
            <span className="shrink-0 text-sm text-tinta-2">
              palpites <strong className="tabular-nums text-tinta">{p.bidsSum}</strong> de {p.cards}
            </span>
          </header>
          <div className={`grid gap-2 ${big ? 'grid-cols-6' : options.length > 5 ? 'grid-cols-5' : 'grid-flow-col auto-cols-fr'}`}>
            {options.map((n) => {
              const allowed = p.legal.includes(n);
              const isForbidden = p.forbidden === n;
              const hint = p.suggested === n && allowed;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!allowed}
                  onClick={() => p.onBid(n)}
                  aria-label={isForbidden ? `${n} (proibido para o pé)` : `Palpite ${n}`}
                  className={`ficha relative h-12 font-display text-2xl font-bold ${
                    allowed ? 'ficha-ouro' : 'ficha-papel'
                  } ${hint ? 'ring-4 ring-luz/90' : ''}`}
                >
                  {n}
                  {isForbidden && (
                    <span className="absolute inset-2 rotate-[-35deg] border-t-[3px] border-copas" aria-hidden="true" />
                  )}
                  {hint && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-tinta text-luz shadow" title="Sugestão">
                      <Lightbulb size={14} strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {(p.forbidden !== null || p.blind || p.isDealer) && (
            <p className="mt-2 text-[13px] leading-snug text-tinta-2">
              {p.forbidden !== null ? (
                <>
                  Você é o <strong className="text-tinta">pé</strong>: pedir {p.forbidden} fecharia a soma em {p.cards}.
                </>
              ) : p.blind ? (
                <>Sua carta está na testa: palpite lendo as cartas dos outros.</>
              ) : (
                <>Você é o pé e palpita por último.</>
              )}
            </p>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
