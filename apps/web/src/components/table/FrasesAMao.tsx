import { REACTIONS, type ReactionId } from '@fodinha/engine';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { haptic } from '../../lib/haptics';
import { useSettings } from '../../stores/settings';

/** Segurando a frase, ela vira grito: a cada tanto, um nível mais forte (até três). */
const GRITO_MS = 450;

/**
 * As três frases favoritas (★ no quadro) a um toque e o "+" que abre o quadro todo. Moram no canto de
 * baixo da mesa, perto do polegar (escolha do Thomas em 30/09/2026); a mesa reserva esse canto
 * (`PILULA_FRASES` em `layout.ts`).
 */
export function FrasesAMao({
  onFrase,
  onGrito,
  onMais,
  galo,
}: {
  onFrase: (id: ReactionId) => void;
  /** Segurou a frase: ela sai gritada (o balão cresce e a vogal estica). */
  onGrito?: (id: ReactionId, forca: 1 | 2 | 3) => void;
  onMais: () => void;
  galo: () => ReactionId;
}) {
  const favoritas = useSettings((s) => s.frasesFavoritas);
  const hapticsOn = useSettings((s) => s.haptics);
  // Toque manda a frase; segurar faz ela crescer até o grito (solta para mandar).
  const [segurando, setSegurando] = useState<{ id: ReactionId; forca: number } | null>(null);
  const timer = useRef<number | null>(null);
  const pressao = useRef<{ id: ReactionId; forca: number } | null>(null);
  const comecar = (id: ReactionId) => {
    if (!onGrito) return;
    pressao.current = { id, forca: 0 };
    const sobe = () => {
      const p = pressao.current;
      if (!p) return;
      p.forca = Math.min(3, p.forca + 1);
      setSegurando({ ...p });
      void haptic('tap', hapticsOn);
      if (p.forca < 3) timer.current = window.setTimeout(sobe, GRITO_MS);
    };
    timer.current = window.setTimeout(sobe, GRITO_MS);
  };
  const soltar = (enviar: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const p = pressao.current;
    pressao.current = null;
    setSegurando(null);
    if (!p) return false;
    if (enviar && p.forca > 0) {
      onGrito?.(p.id === 'galo' ? galo() : p.id, p.forca as 1 | 2 | 3);
      return true;
    }
    return false;
  };
  const gritou = useRef(false);
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
            onPointerDown={() => {
              gritou.current = false;
              comecar(id);
            }}
            onPointerUp={() => {
              gritou.current = soltar(true);
            }}
            onPointerLeave={() => soltar(false)}
            onPointerCancel={() => soltar(false)}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
              // Quem segurou já mandou o grito: o clique que vem junto não manda de novo.
              if (gritou.current) {
                gritou.current = false;
                return;
              }
              onFrase(id === 'galo' ? galo() : id);
            }}
            className={botao}
            style={segurando?.id === id ? { transform: `scale(${1 + segurando.forca * 0.18})` } : undefined}
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
