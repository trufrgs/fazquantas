import { Menu, NotebookPen } from 'lucide-react';
import type { ReactNode } from 'react';
import { play } from '../../lib/sound';
import { IconButton } from '../ui/Button';
import { ControlesDeMidia } from '../ui/Midia';

export interface TopBarProps {
  /** Linha extra (sala assíncrona: de quem é a vez e até quando). */
  note?: string | null;
  round: number;
  cards: number;
  direction: 'up' | 'down';
  pyramid: boolean;
  onMenu: () => void;
  onScore: () => void;
  /** As frases favoritas no alto (só na mesa baixa, do celular deitado; senão ficam no canto de baixo). */
  frases?: ReactNode;
}

/**
 * O alto da mesa, com folga (escolha do Thomas em 30/09/2026): o menu, a rodada no meio (tocar abre a
 * caderneta) e, com gente na sala, o microfone e a câmera, um botão para cada. As frases favoritas
 * ficam no canto de baixo da mesa, perto do polegar (`FrasesAMao`).
 */
export function TopBar(p: TopBarProps) {
  return (
    <header
      className="relative z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3"
      style={{ paddingTop: 'calc(0.5rem + var(--safe-top))' }}
    >
      <IconButton label="Menu" onClick={p.onMenu} className="justify-self-start">
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
      <div className="flex items-center gap-2 justify-self-end">
        {p.frases}
        <ControlesDeMidia naMesa />
      </div>
    </header>
  );
}
