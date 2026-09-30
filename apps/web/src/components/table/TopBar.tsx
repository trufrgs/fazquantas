import { REACTIONS, type ReactionId } from '@fodinha/engine';
import { Menu, NotebookPen, Plus } from 'lucide-react';
import { play } from '../../lib/sound';
import { useSettings } from '../../stores/settings';
import { IconButton } from '../ui/Button';
import { ControlesDeMidia, useTemConversa } from '../ui/Midia';

export interface TopBarProps {
  /** Linha extra (sala assíncrona: de quem é a vez e até quando). */
  note?: string | null;
  round: number;
  cards: number;
  direction: 'up' | 'down';
  pyramid: boolean;
  onMenu: () => void;
  onScore: () => void;
  /** Abre o quadro de frases. */
  onReact: () => void;
  /** Manda uma das favoritas (a um toque). */
  onFrase: (id: ReactionId) => void;
  /** O "é galo" de um toque: a carta que está levando a mão, ou o genérico. */
  galo: () => ReactionId;
}

/**
 * O alto da mesa, enxuto: o menu, a rodada (tocar abre a caderneta), o microfone e a câmera (num botão
 * só, e só com gente na sala) e as três frases favoritas a um toque, com o "+" para o quadro todo.
 */
export function TopBar(p: TopBarProps) {
  return (
    <header
      className="relative z-30 flex items-center justify-between gap-2 px-3"
      style={{ paddingTop: 'calc(0.5rem + var(--safe-top))' }}
    >
      <IconButton label="Menu" onClick={p.onMenu}>
        <Menu size={22} />
      </IconButton>
      <button
        type="button"
        aria-label={`Caderneta: rodada ${p.round}, ${p.cards} ${p.cards === 1 ? 'carta' : 'cartas'}`}
        title="Caderneta"
        onClick={() => {
          play('click');
          p.onScore();
        }}
        className="flex min-w-0 flex-col items-center rounded-2xl px-2 py-0.5 leading-tight texto-gravado transition active:scale-95 active:bg-noite/30"
      >
        {/* Numa linha só (no celular pequeno, a letra diminui). */}
        <span className="flex items-center gap-1 whitespace-nowrap font-display text-lg font-bold min-[360px]:text-xl" style={{ fontVariationSettings: '"SOFT" 100' }}>
          Rodada {p.round}
          <NotebookPen size={14} className="opacity-70" aria-hidden="true" />
        </span>
        <span className="whitespace-nowrap text-xs font-semibold text-papel/80">
          {p.cards} {p.cards === 1 ? 'carta' : 'cartas'}
          {p.pyramid && (p.direction === 'up' ? ' · subindo' : ' · descendo')}
        </span>
        {p.note && <span className="text-xs font-bold text-ouros">{p.note}</span>}
      </button>
      <div className="flex items-center gap-2">
        <ControlesDeMidia compacto />
        <FrasesAMao onFrase={p.onFrase} onMais={p.onReact} galo={p.galo} />
      </div>
    </header>
  );
}

/** As três favoritas (★ no quadro) a um toque, e o "+" que abre o quadro todo. */
function FrasesAMao({ onFrase, onMais, galo }: { onFrase: (id: ReactionId) => void; onMais: () => void; galo: () => ReactionId }) {
  const favoritas = useSettings((s) => s.frasesFavoritas);
  // Tela estreita com o botão da câmera: cabem duas favoritas.
  const apertado = useTemConversa();
  const botao = 'inline-flex h-11 w-10 items-center justify-center text-xl leading-none transition active:scale-90 max-[359px]:w-9';
  return (
    <div role="group" aria-label="Frases" className="flex overflow-hidden rounded-full bg-noite/45 ring-1 ring-papel/15 backdrop-blur-sm">
      {favoritas.map((id, i) => {
        const r = REACTIONS.find((x) => x.id === id);
        if (!r) return null;
        return (
          <button
            key={id}
            type="button"
            aria-label={`Mandar "${r.label}"`}
            title={r.label}
            onClick={() => onFrase(id === 'galo' ? galo() : id)}
            className={`${botao} ${apertado && i === 2 ? 'max-[359px]:hidden' : ''}`}
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
