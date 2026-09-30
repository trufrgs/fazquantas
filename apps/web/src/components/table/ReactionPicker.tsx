import { FRASES_DO_QUADRO, REACTIONS, type CardId, type ReactionId, type StrengthCtx } from '@fodinha/engine';
import { Star } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type CSSProperties } from 'react';
import { useSettings } from '../../stores/settings';
import { alternarFavorita, sugestoesDeGalo } from './frases';

const info = (id: ReactionId) => REACTIONS.find((r) => r.id === id)!;

/**
 * O quadro de frases: as oito que a turma usa, cada uma com a ★ para ficar no alto da mesa (até três).
 * O "é galo" já sugere as cartas que estão na mesa (e o genérico); sem carta na mesa, vai direto.
 */
export function ReactionPicker({ open, ...p }: QuadroProps & { open: boolean }) {
  return <AnimatePresence>{open && <Quadro {...p} />}</AnimatePresence>;
}

interface QuadroProps {
  onPick: (r: ReactionId) => void;
  onClose: () => void;
  naMesa: readonly CardId[];
  ctx: StrengthCtx | null;
  /** Onde o quadro abre (acima das frases favoritas, no canto de baixo da mesa); sem isso, no alto. */
  lugar?: CSSProperties;
}

/** O quadro aberto (monta a cada vez que abre: as sugestões do galo começam fechadas). */
function Quadro({ onPick, onClose, naMesa, ctx, lugar }: QuadroProps) {
  const favoritas = useSettings((s) => s.frasesFavoritas);
  const set = useSettings((s) => s.set);
  const [galo, setGalo] = useState(false);
  // Fecha sozinho depois de um tempo (abrir as sugestões do galo dá mais tempo).
  useEffect(() => {
    const t = window.setTimeout(onClose, 10_000);
    return () => window.clearTimeout(t);
  }, [onClose, galo]);
  const sugestoes = ctx ? sugestoesDeGalo(naMesa, ctx) : ['galo' as ReactionId];
  const tocar = (id: ReactionId) => {
    if (id === 'galo' && sugestoes.length > 1) setGalo((g) => !g);
    else onPick(id);
  };
  return (
    <>
      <div className="ate-o-fim fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <motion.div
        role="menu"
        aria-label="Frases"
        className="papel absolute right-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col gap-1 rounded-3xl p-2 shadow-2xl"
        style={lugar ?? { top: 'calc(3.6rem + var(--safe-top))' }}
        initial={{ opacity: 0, scale: 0.85, y: lugar ? 8 : -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: lugar ? 6 : -6 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        <div className="grid grid-cols-4 gap-1">
          {FRASES_DO_QUADRO.map((id) => {
            const r = info(id);
            const fav = favoritas.includes(id);
            return (
              <div key={id} className="relative">
                <button
                  type="button"
                  role="menuitem"
                  aria-expanded={id === 'galo' && sugestoes.length > 1 ? galo : undefined}
                  onClick={() => tocar(id)}
                  className={`flex h-full w-[4.6rem] flex-col items-center gap-0.5 rounded-2xl px-1 pb-2 pt-2.5 transition active:scale-95 active:bg-tinta/10 ${id === 'galo' && galo ? 'bg-tinta/10' : ''}`}
                >
                  <span className="text-2xl leading-none">{r.emoji}</span>
                  <span className="text-center text-[0.6875rem] font-semibold leading-tight text-tinta-2">{r.label}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={fav}
                  aria-label={fav ? `Tirar "${r.label}" do alto da mesa` : `Deixar "${r.label}" no alto da mesa`}
                  onClick={() => set({ frasesFavoritas: alternarFavorita(favoritas, id) })}
                  className="absolute -right-0.5 -top-0.5 flex h-7 w-7 items-center justify-center rounded-full active:scale-90"
                >
                  <Star size={14} className={fav ? 'fill-ouros text-ouros-escuro' : 'text-tinta/30'} />
                </button>
              </div>
            );
          })}
        </div>
        {galo && (
          <div className="flex flex-col gap-1 border-t border-tinta/10 px-1 pt-1.5" role="group" aria-label="Qual é galo?">
            <span className="text-[0.6875rem] font-semibold text-tinta-2">🐓 Qual carta é galo?</span>
            <div className="flex flex-wrap gap-1">
              {sugestoes.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  onClick={() => onPick(id)}
                  className="rounded-full bg-tinta/8 px-3 py-1.5 text-sm font-bold text-tinta ring-1 ring-tinta/10 active:scale-95"
                >
                  {id === 'galo' ? 'Só "é galo"' : info(id).label.replace(', hein!', '')}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="px-1 pt-0.5 text-center text-[0.6875rem] text-tinta-2">★ deixa a frase no alto da mesa, a um toque (até três)</p>
      </motion.div>
    </>
  );
}
