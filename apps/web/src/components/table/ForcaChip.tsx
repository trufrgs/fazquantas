import {
  card,
  cardName,
  hierarchyGroups,
  manilhaRank,
  SUIT_NAMES,
  specialName,
  type CardId,
  type HierarchyMode,
  type Rank,
  type StrengthCtx,
} from '@fodinha/engine';
import { useUiScale } from '../../lib/ui-scale';
import { Card } from '../cards/Card';

const FIXED_MANILHAS: Record<Exclude<HierarchyMode, 'vira'>, CardId[]> = {
  gaucha: ['E1', 'P1', 'E7', 'O7'],
  mineira: ['P4', 'C7', 'E1', 'O7'],
};

const RANK_LABEL: Record<Rank, string> = { 1: 'ás', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 10: 'sota', 11: 'cavalo', 12: 'rei' };

/**
 * Ícone da força das cartas: as manilhas em leque (na regra com vira, o espadão e o 4 de paus, as
 * que ficam no topo com qualquer vira). Diz sozinho que é sobre as cartas.
 */
export function IconeForca({ mode }: { mode: HierarchyMode }) {
  const s = useUiScale();
  const ids: CardId[] = mode === 'vira' ? ['E1', 'P4', 'O7'] : FIXED_MANILHAS[mode].slice(0, 3);
  return (
    <span className="flex shrink-0" aria-hidden="true">
      {ids.map((id, k) => (
        <span key={id} className="shrink-0" style={{ marginLeft: k === 0 ? 0 : -9 * s, transform: `rotate(${(k - 1) * 8}deg)` }}>
          <Card id={id} width={17 * s} />
        </span>
      ))}
    </span>
  );
}

/** Na regra com vira, no canto da mesa: a vira e a manilha da rodada. Toque abre a força das cartas. */
export function ForcaChip({ mode, vira, onOpen }: { mode: HierarchyMode; vira: CardId | null; onOpen: () => void }) {
  const s = useUiScale();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute bottom-2 left-3 z-20 flex items-center gap-2 rounded-2xl bg-noite/45 px-2.5 py-1.5 text-left ring-1 ring-papel/15 backdrop-blur-sm transition active:scale-95"
      aria-label="Quem mata quem: a força das cartas"
    >
      {mode === 'vira' ? (
        vira ? (
          <>
            <Card id={vira} width={24 * s} />
            <span className="text-xs leading-tight">
              <span className="block text-papel/70">vira</span>
              <span className="block font-bold">manilha: {RANK_LABEL[manilhaRank(card(vira))]}</span>
            </span>
          </>
        ) : null
      ) : (
        <>
          <span className="flex shrink-0">
            {FIXED_MANILHAS[mode].map((id, k) => (
              <span key={id} className="shrink-0" style={{ marginLeft: k === 0 ? 0 : -8 * s }}>
                <Card id={id} width={20 * s} />
              </span>
            ))}
          </span>
          <span className="text-xs font-bold leading-tight">quem mata quem</span>
        </>
      )}
    </button>
  );
}

const RANK_PLURAL: Record<Rank, string> = {
  1: 'Ases',
  2: 'Os 2',
  3: 'Os 3',
  4: 'Os 4',
  5: 'Os 5',
  6: 'Os 6',
  7: 'Os 7',
  10: 'Sotas (10)',
  11: 'Cavalos (11)',
  12: 'Reis (12)',
};
const RANK_PLURAL_BY_SUIT: Partial<Record<Rank, string>> = { 1: 'Ases', 7: 'Setes', 4: 'Quatros' };

/** Nome de um nível de força: "Espadão (ás de espadas)", "Reis (12)", "Setes de copas e paus". */
function groupLabel(ids: CardId[], ctx: StrengthCtx): string {
  const cards = ids.map(card);
  if (cards.length === 1) {
    const c = cards[0]!;
    const special = specialName(c, ctx);
    const plain = cardName(c);
    return special && special !== plain ? `${special} (${plain.toLowerCase()})` : plain;
  }
  const rank = cards[0]!.rank;
  if (cards.length === 4) return RANK_PLURAL[rank];
  const suits = cards.map((c) => SUIT_NAMES[c.suit]);
  const joined = suits.length > 1 ? `${suits.slice(0, -1).join(', ')} e ${suits.at(-1)}` : suits[0];
  return `${RANK_PLURAL_BY_SUIT[rank] ?? RANK_PLURAL[rank]} de ${joined}`;
}

/** Lista completa da força das cartas (do mais forte para o mais fraco). */
export function Hierarchy({ mode, vira }: { mode: HierarchyMode; vira: CardId | null }) {
  const s = useUiScale();
  const ctx: StrengthCtx = { mode, vira: vira ? card(vira) : null };
  const groups = hierarchyGroups(ctx);
  return (
    <ol className="flex flex-col gap-2.5">
      {groups.map((ids, i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="w-6 shrink-0 text-right font-display text-lg font-bold text-tinta-2 tabular-nums">{i + 1}</span>
          {/* Carta e sobreposição na mesma escala: nada de caixa fixa espremendo a carta. */}
          <span className="flex shrink-0">
            {ids.map((id, k) => (
              <span key={id} className="shrink-0" style={{ marginLeft: k === 0 ? 0 : -24 * s }}>
                <Card id={id} width={44 * s} className="shadow-[0_2px_6px_rgb(0_0_0/0.25)]" />
              </span>
            ))}
          </span>
          <span className="min-w-0 text-[0.9375rem] font-semibold leading-tight">{groupLabel(ids, ctx)}</span>
        </li>
      ))}
    </ol>
  );
}
