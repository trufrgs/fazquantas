import { AnimatePresence, motion } from 'motion/react';
import { useSettings } from '../../stores/settings';

export type TipId = 'palpite' | 'jogar' | 'cega' | 'pe';

export const TIPS: Record<TipId, string> = {
  palpite: 'Olha tuas cartas e diz quantas vazas tu vai fazer. Acertou na mosca, não perde palito.',
  jogar: 'Toca numa carta pra escolher e toca de novo pra jogar. Também dá pra arrastar pra cima.',
  cega: 'Carta na testa: tu vê a carta dos outros, mas não a tua. Palpita lendo a mesa.',
  pe: 'Tu é o pé: palpita por último e não pode fechar a soma no número de cartas.',
};

/** Marca uma dica como vista (quando a pessoa já fez o que ela ensina). */
export function markTipSeen(tip: TipId | null): void {
  if (!tip) return;
  const { seenTips, set } = useSettings.getState();
  if (!seenTips.includes(tip)) set({ seenTips: [...seenTips, tip] });
}

/** Balão de dica que aparece uma vez só (primeira partida). */
export function CoachTip({ tip, inline = false }: { tip: TipId | null; inline?: boolean }) {
  const seen = useSettings((s) => s.seenTips);
  const set = useSettings((s) => s.set);
  const show = tip !== null && !seen.includes(tip);
  return (
    <AnimatePresence>
      {show && tip && (
        <motion.div
          key={tip}
          role="note"
          className={
            inline
              ? 'mb-3 flex items-start gap-3 rounded-2xl bg-ouros/25 px-3 py-2.5 ring-1 ring-ouros-escuro/30'
              : 'papel pointer-events-none absolute inset-x-4 bottom-3 z-40 mx-auto flex max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-[0_12px_30px_rgb(0_0_0/0.45)] ring-1 ring-black/10'
          }
          initial={{ opacity: 0, y: -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        >
          <p className="flex-1 text-[15px] leading-snug">{TIPS[tip]}</p>
          <button
            type="button"
            onClick={() => set({ seenTips: [...seen, tip] })}
            className="pointer-events-auto shrink-0 rounded-full bg-tinta px-3 py-1.5 text-sm font-bold text-papel"
          >
            Entendi
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
