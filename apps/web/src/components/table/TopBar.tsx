import { Menu, NotebookPen, SmilePlus } from 'lucide-react';
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
  onReact: () => void;
}

export function TopBar(p: TopBarProps) {
  return (
    <header
      className="relative z-30 flex items-center justify-between gap-2 px-3"
      style={{ paddingTop: 'calc(0.5rem + var(--safe-top))' }}
    >
      <IconButton label="Menu" onClick={p.onMenu}>
        <Menu size={22} />
      </IconButton>
      <div className="flex flex-col items-center leading-tight texto-gravado">
        {/* Numa linha só (no celular pequeno, com o microfone e a câmera no alto, a letra diminui). */}
        <span className="whitespace-nowrap font-display text-lg font-bold min-[360px]:text-xl" style={{ fontVariationSettings: '"SOFT" 100' }}>
          Rodada {p.round}
        </span>
        <span className="text-xs font-semibold text-papel/80">
          {p.cards} {p.cards === 1 ? 'carta' : 'cartas'}
          {p.pyramid && (p.direction === 'up' ? ' · subindo' : ' · descendo')}
        </span>
        {p.note && <span className="text-xs font-bold text-ouros">{p.note}</span>}
      </div>
      <div className="flex gap-2">
        <ControlesDeMidia />
        <IconButton label="Reagir" onClick={p.onReact}>
          <SmilePlus size={21} />
        </IconButton>
        <IconButton label="Caderneta" onClick={p.onScore}>
          <NotebookPen size={20} />
        </IconButton>
      </div>
    </header>
  );
}
