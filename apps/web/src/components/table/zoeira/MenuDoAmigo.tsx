import { GAUCHO_AVATARS, ITENS_DE_ATIRAR, REACTIONS, temGolpe, type ItemDeAtirar, type ReactionId, type Zoeira } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { Video } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useSettings } from '../../../stores/settings';
import type { Point } from '../layout';
import { Avatar } from '../../ui/Avatar';
import { Bergamota, Chinelo, Ovo, Tomate } from './desenhos';

const DESENHO: Record<ItemDeAtirar, ComponentType<{ w: string }>> = { tomate: Tomate, ovo: Ovo, chinelo: Chinelo, bergamota: Bergamota };
const NOME: Record<ItemDeAtirar, string> = { tomate: 'tomate', ovo: 'ovo', chinelo: 'chinelo', bergamota: 'bergamota' };

export interface AlvoDoMenu {
  id: string;
  nome: string;
  /** Onde fica o rosto (px da mesa). */
  p: Point;
  /** Está na vez e demorando: dá para cutucar. */
  cutucavel: boolean;
  /** Está de câmera aberta: dá para ver grande. */
  camera: boolean;
}

/**
 * O menu do amigo: tocar no rosto de alguém abre o que dá para fazer com ele. Atirar (tomate, ovo,
 * chinelo, bergamota e, para quem tem, o golpe do teu avatar: três por rodada), cutucar ou soprar a
 * fumaça na cara dele se é ele quem está demorando, carimbar uma das tuas frases favoritas na testa
 * dele, e ver a câmera grande. Pequeno, perto do rosto, fecha com um toque fora; nada nele mexe na
 * jogada.
 */
export function MenuDoAmigo({
  alvo,
  largura,
  altura,
  onZoar,
  onCamera,
  onFechar,
  meuAvatar,
}: {
  alvo: AlvoDoMenu | null;
  /** O teu avatar: o golpe da casa é dele. */
  meuAvatar?: string;
  largura: number;
  altura: number;
  onZoar: (z: Zoeira) => Promise<string | null>;
  onCamera: (id: string) => void;
  onFechar: () => void;
}) {
  const favoritas = useSettings((s) => s.frasesFavoritas);
  const caixa = useRef<HTMLDivElement>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [visto, setVisto] = useState(alvo?.id);
  if (visto !== alvo?.id) {
    setVisto(alvo?.id);
    setRecado(null);
  }
  useEffect(() => {
    if (!alvo) return undefined;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) onFechar();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    // Espera o toque que abriu terminar, senão ele mesmo fecha o menu.
    const t = window.setTimeout(() => window.addEventListener('pointerdown', fora), 0);
    window.addEventListener('keydown', esc);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', fora);
      window.removeEventListener('keydown', esc);
    };
  }, [alvo, onFechar]);
  const W = 232;
  const fazer = async (z: Zoeira) => {
    const r = await onZoar(z);
    if (r) setRecado(r);
    else onFechar();
  };
  const frases = favoritas.filter((id) => id !== 'galo').slice(0, 3) as ReactionId[];
  const golpe = temGolpe(meuAvatar) ? meuAvatar : null;
  const nomeDoAvatar = GAUCHO_AVATARS.find((a) => a.id === golpe)?.label.split(' ')[0] ?? '';
  return (
    <AnimatePresence>
      {alvo && (
        <motion.div
          ref={caixa}
          key={alvo.id}
          role="dialog"
          aria-label={`Zoar ${alvo.nome}`}
          className="papel absolute z-[66] flex flex-col gap-2 rounded-2xl p-2.5 shadow-[0_14px_34px_rgb(0_0_0/0.55)] ring-1 ring-black/10"
          style={{
            width: W,
            left: Math.max(8, Math.min(largura - W - 8, alvo.p.x - W / 2)),
            top: Math.max(8, Math.min(altura - 210, alvo.p.y + 34)),
          }}
          initial={{ opacity: 0, scale: 0.85, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 520, damping: 30 }}
        >
          <span className="px-1 font-display text-lg font-bold leading-none" style={{ fontVariationSettings: '"SOFT" 100' }}>
            {alvo.nome}
          </span>
          <div className={`grid gap-1.5 ${golpe ? 'grid-cols-5' : 'grid-cols-4'}`} role="group" aria-label="Atirar">
            {ITENS_DE_ATIRAR.map((item) => {
              const D = DESENHO[item];
              return (
                <button
                  key={item}
                  type="button"
                  aria-label={`Atirar ${NOME[item]} em ${alvo.nome}`}
                  onClick={() => void fazer({ tipo: 'atirar', alvo: alvo.id, item })}
                  className="flex h-12 items-center justify-center rounded-xl bg-tinta/8 p-1.5 transition active:scale-90"
                >
                  <D w={golpe ? '1.7rem' : '2rem'} />
                </button>
              );
            })}
            {golpe && (
              <button
                type="button"
                aria-label={`O golpe do teu ${nomeDoAvatar.toLowerCase()} em ${alvo.nome}`}
                title="O golpe do teu avatar"
                onClick={() => void fazer({ tipo: 'golpe', alvo: alvo.id })}
                className="flex h-12 items-center justify-center rounded-xl bg-ouros/30 p-1 ring-2 ring-ouros transition active:scale-90"
              >
                <Avatar seed={golpe} size={34} />
              </button>
            )}
          </div>
          {frases.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Carimbar na testa">
              {frases.map((id) => {
                const r = REACTIONS.find((x) => x.id === id);
                return r ? (
                  <button
                    key={id}
                    type="button"
                    aria-label={`Carimbar "${r.label}" na testa de ${alvo.nome}`}
                    onClick={() => void fazer({ tipo: 'carimbo', alvo: alvo.id, reaction: id })}
                    className="rounded-lg border-2 border-copas/70 px-2 py-1 font-display text-sm font-black uppercase leading-none text-copas active:scale-95"
                  >
                    {r.label.replace(/[!,.].*$/, '')}
                  </button>
                ) : null;
              })}
            </div>
          )}
          {(alvo.cutucavel || alvo.camera) && (
            <div className="flex gap-1.5">
              {alvo.cutucavel && (
                <button type="button" onClick={() => void fazer({ tipo: 'cutucar', alvo: alvo.id })} className="ficha ficha-ouro min-h-10 flex-1 rounded-xl text-sm">
                  Cutucar
                </button>
              )}
              {alvo.cutucavel && (
                <button type="button" onClick={() => void fazer({ tipo: 'baforada', alvo: alvo.id })} className="ficha ficha-papel min-h-10 flex-1 rounded-xl text-sm">
                  Baforada
                </button>
              )}
              {alvo.camera && (
                <button
                  type="button"
                  onClick={() => {
                    onCamera(alvo.id);
                    onFechar();
                  }}
                  className="ficha ficha-papel min-h-10 flex-1 rounded-xl text-sm"
                >
                  <Video size={16} /> Ver a câmera
                </button>
              )}
            </div>
          )}
          {recado && (
            <p role="alert" className="px-1 text-sm font-semibold text-copas">
              {recado}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
