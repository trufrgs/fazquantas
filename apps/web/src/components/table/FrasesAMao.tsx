import { REACTIONS, type ReactionId } from '@fodinha/engine';
import { Plus } from 'lucide-react';
import { useSettings } from '../../stores/settings';

/**
 * As três frases favoritas (★ no quadro) a um toque e o "+" que abre o quadro todo. Moram no canto de
 * baixo da mesa, perto do polegar (escolha do Thomas em 30/09/2026); a mesa reserva esse canto
 * (`PILULA_FRASES` em `layout.ts`).
 */
export function FrasesAMao({ onFrase, onMais, galo }: { onFrase: (id: ReactionId) => void; onMais: () => void; galo: () => ReactionId }) {
  const favoritas = useSettings((s) => s.frasesFavoritas);
  const botao = 'inline-flex h-11 w-10 items-center justify-center text-xl leading-none transition active:scale-90';
  return (
    <div
      role="group"
      aria-label="Frases"
      className="flex overflow-hidden rounded-full bg-noite/55 shadow-[0_6px_16px_rgb(0_0_0/0.35)] ring-1 ring-papel/15 backdrop-blur-sm"
    >
      {favoritas.map((id) => {
        const r = REACTIONS.find((x) => x.id === id);
        if (!r) return null;
        return (
          <button
            key={id}
            type="button"
            aria-label={`Mandar "${r.label}"`}
            title={r.label}
            onClick={() => onFrase(id === 'galo' ? galo() : id)}
            className={botao}
          >
            {r.emoji}
          </button>
        );
      })}
      <button type="button" aria-label="Mais frases" title="Mais frases" onClick={onMais} className={`${botao} border-l border-papel/15 text-papel`}>
        <Plus size={20} />
      </button>
    </div>
  );
}
