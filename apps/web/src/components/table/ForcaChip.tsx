import { card, hierarchyGroups, manilhaRank, type CardId, type HierarchyMode, type Rank } from '@fodinha/engine';
import { Card } from '../cards/Card';

const FIXED_MANILHAS: Record<Exclude<HierarchyMode, 'vira'>, CardId[]> = {
  gaucha: ['E1', 'P1', 'E7', 'O7'],
  mineira: ['P4', 'C7', 'E1', 'O7'],
};

const RANK_LABEL: Record<Rank, string> = { 1: 'ás', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 10: 'sota', 11: 'cavalo', 12: 'rei' };

/** Chip no canto da mesa: as manilhas (fixas) ou a vira e a manilha da rodada. Toque abre a força das cartas. */
export function ForcaChip({ mode, vira, onOpen }: { mode: HierarchyMode; vira: CardId | null; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute left-3 top-2 z-20 flex items-center gap-2 rounded-2xl bg-noite/45 px-2.5 py-1.5 text-left ring-1 ring-papel/15 backdrop-blur-sm transition active:scale-95"
      aria-label="Ver a força das cartas"
    >
      {mode === 'vira' ? (
        vira ? (
          <>
            <Card id={vira} width={24} />
            <span className="text-xs leading-tight">
              <span className="block text-papel/70">vira</span>
              <span className="block font-bold">manilha: {RANK_LABEL[manilhaRank(card(vira))]}</span>
            </span>
          </>
        ) : null
      ) : (
        <>
          <span className="flex -space-x-2">
            {FIXED_MANILHAS[mode].map((id) => (
              <Card key={id} id={id} width={20} />
            ))}
          </span>
          <span className="text-xs font-bold leading-tight">manilhas</span>
        </>
      )}
    </button>
  );
}

/** Lista completa da força das cartas (do mais forte para o mais fraco). */
export function Hierarchy({ mode, vira }: { mode: HierarchyMode; vira: CardId | null }) {
  const groups = hierarchyGroups({ mode, vira: vira ? card(vira) : null });
  return (
    <ol className="flex flex-col gap-2">
      {groups.map((ids, i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="w-6 text-right font-display text-lg font-bold text-tinta-2 tabular-nums">{i + 1}</span>
          <span className="flex -space-x-3">
            {ids.map((id) => (
              <Card key={id} id={id} width={34} />
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}
