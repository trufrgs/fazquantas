import { REACTIONS, type ItemDeAtirar, type ReactionId } from '@fodinha/engine';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, type ComponentType } from 'react';
import { haptic } from '../../../lib/haptics';
import { play } from '../../../lib/sound';
import { useSettings } from '../../../stores/settings';
import type { LiveZoeira } from '../../../stores/game';
import { Carimbo } from '../../ui/Carimbo';
import type { Point } from '../layout';
import { Bergamota, Chinelo, Mancha, Ovo, Rachadura, Tomate } from './desenhos';

/**
 * A zoeira que os jogadores mandam, na mesa (caderno de zoeira, 02/10/2026): o tiro que cruza a mesa
 * e mancha o rosto, o cutucão em quem demora, a frase carimbada na testa, a rachadura da pancada. A
 * virada de mesa e o tremor da pancada mexem na mesa inteira (quem chama passa `sacudir`).
 *
 * Os limites do diretor valem aqui também: no máximo `MAX_TIROS` coisas voando ao mesmo tempo (as
 * outras não saem), um carimbo por rosto, e nada pega toque. Sem letrinha de gibi.
 */
export const MAX_TIROS = 3;

const ITENS: Record<ItemDeAtirar, { Desenho: ComponentType<{ w: string }>; cor: string; miolo?: string; som: number }> = {
  tomate: { Desenho: Tomate, cor: '#C92F22', som: 0.6 },
  ovo: { Desenho: Ovo, cor: '#FFF8E6', miolo: '#F2B21D', som: 0.9 },
  chinelo: { Desenho: Chinelo, cor: '', som: 0.5 },
  bergamota: { Desenho: Bergamota, cor: '#EF7F1A', som: 0.75 },
};

export function ZoeiraNaMesa({
  zoeiras,
  pontoDe,
  tamanho,
  youId,
  sacudir,
}: {
  zoeiras: readonly LiveZoeira[];
  /** Onde está o rosto de cada um, em px da mesa (`null`: não aparece). */
  pontoDe: (id: string) => Point | null;
  /** Diâmetro dos rostos (px na tela). */
  tamanho: number;
  youId: string | null;
  /** Mexe na mesa inteira: o tremor da pancada e a virada. */
  sacudir: (tipo: 'pancada' | 'virar', forca: number) => void;
}) {
  const reduce = useReducedMotion();
  const hapticsOn = useSettings((s) => s.haptics);
  // Cada zoeira faz o seu som e a sua sacudida uma vez, quando chega.
  const feitas = useRef(new Set<number>());
  useEffect(() => {
    for (const { key, z } of zoeiras) {
      if (feitas.current.has(key)) continue;
      feitas.current.add(key);
      if (z.tipo === 'atirar') play(z.item === 'chinelo' ? 'play' : 'pop', { delayMs: 520, rate: ITENS[z.item].som });
      if (z.tipo === 'cutucar') {
        play('turn', { rate: 0.7 });
        if (z.alvo === youId) void haptic('heavy', hapticsOn);
      }
      if (z.tipo === 'carimbo') play('bid', { delayMs: 250, rate: 0.6 });
      if (z.tipo === 'pancada') {
        play('pau', { rate: 1.3 - z.forca * 0.15 });
        sacudir('pancada', z.forca);
      }
      if (z.tipo === 'virar') {
        play('sweep', { rate: 0.7 });
        play('pau', { delayMs: 900, rate: 0.6 });
        sacudir('virar', 1);
      }
    }
  }, [zoeiras, sacudir, youId, hapticsOn]);
  if (reduce) return <CarimbosParados zoeiras={zoeiras} pontoDe={pontoDe} tamanho={tamanho} />;

  const tiros = zoeiras.filter((x) => x.z.tipo === 'atirar').slice(-MAX_TIROS);
  const carimbos = ultimoPorAlvo(zoeiras.filter((x) => x.z.tipo === 'carimbo'));
  const cutucoes = ultimoPorAlvo(zoeiras.filter((x) => x.z.tipo === 'cutucar'));
  const pancada = zoeiras.filter((x) => x.z.tipo === 'pancada').at(-1);
  return (
    <div className="pointer-events-none absolute inset-0 z-[35] overflow-visible" aria-hidden="true">
      <AnimatePresence>
        {tiros.map(({ key, z }) => {
          if (z.tipo !== 'atirar') return null;
          const de = pontoDe(z.de);
          const para = pontoDe(z.alvo);
          if (!de || !para) return null;
          return <Tiro key={key} de={de} para={para} item={z.item} tamanho={tamanho} />;
        })}
        {cutucoes.map(({ key, z }) => {
          const p = 'alvo' in z ? pontoDe(z.alvo) : null;
          return p ? <Cutucao key={key} p={p} tamanho={tamanho} /> : null;
        })}
        {carimbos.map(({ key, z }) => {
          const p = 'alvo' in z ? pontoDe(z.alvo) : null;
          const frase = z.tipo === 'carimbo' ? semEmoji(z.reaction) : '';
          return p ? <CarimboNaTesta key={key} p={p} tamanho={tamanho} frase={frase} /> : null;
        })}
        {pancada && (
          <motion.span
            key={pancada.key}
            className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2"
            style={{ width: '38%', maxWidth: 220 }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1, 1, 1] }}
            transition={{ duration: 3.6, times: [0, 0.05, 0.8, 1] }}
          >
            <Rachadura w="100%" />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A frase sem o emoji, em maiúsculas de carimbo ("É GALO, HEIN!" vira "É GALO"). */
function semEmoji(id: ReactionId): string {
  const label = REACTIONS.find((r) => r.id === id)?.label ?? '';
  return label.replace(/[!,.].*$/, '').trim() || label;
}

function ultimoPorAlvo(xs: readonly LiveZoeira[]): LiveZoeira[] {
  const m = new Map<string, LiveZoeira>();
  for (const x of xs) if ('alvo' in x.z) m.set(x.z.alvo, x);
  return [...m.values()];
}

/** A coisa voando num arco, girando, e a mancha no rosto (o chinelo só bate e cai). */
function Tiro({ de, para, item, tamanho }: { de: Point; para: Point; item: ItemDeAtirar; tamanho: number }) {
  const { Desenho, cor, miolo } = ITENS[item];
  const w = Math.max(26, tamanho * 0.5);
  const alto = Math.min(de.y, para.y) - Math.max(60, Math.abs(de.x - para.x) * 0.35);
  return (
    <>
      <motion.span
        className="absolute block"
        style={{ left: 0, top: 0, width: w, marginLeft: -w / 2, marginTop: -w / 2 }}
        initial={{ x: de.x, y: de.y, rotate: 0, scale: 0.7 }}
        animate={{ x: [de.x, (de.x + para.x) / 2, para.x], y: [de.y, alto, para.y], rotate: [0, 300, 620], scale: [0.7, 1.25, 1], opacity: [1, 1, item === 'chinelo' ? 1 : 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.55, ease: 'linear', times: [0, 0.5, 1] }}
      >
        <Desenho w="100%" />
      </motion.span>
      {item === 'chinelo' ? (
        <motion.span
          className="absolute block"
          style={{ left: para.x, top: para.y, width: w, marginLeft: -w / 2, marginTop: -w / 2 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0], y: [0, 0, tamanho * 0.6, tamanho * 0.9], rotate: [20, 20, 90, 120] }}
          transition={{ duration: 1.3, delay: 0.55, times: [0, 0.01, 0.6, 1], ease: 'easeIn' }}
        >
          <Chinelo w="100%" />
        </motion.span>
      ) : (
        <motion.span
          className="absolute block"
          style={{ left: para.x, top: para.y, width: tamanho * 0.95, marginLeft: -tamanho * 0.475, marginTop: -tamanho * 0.45 }}
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.2, 1.15, 1, 1], y: [0, 0, 0, tamanho * 0.25] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.6, delay: 0.55, times: [0, 0.06, 0.75, 1] }}
        >
          <Mancha w="100%" cor={cor} miolo={miolo} />
        </motion.span>
      )}
    </>
  );
}

/** O cutucão: o rosto de quem demora leva um tranco (as ondas do sacudão em volta). */
function Cutucao({ p, tamanho }: { p: Point; tamanho: number }) {
  return (
    <>
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute block rounded-full border-[3px] border-luz"
          style={{ left: p.x, top: p.y, width: tamanho, height: tamanho, marginLeft: -tamanho / 2, marginTop: -tamanho / 2 }}
          initial={{ scale: 1, opacity: 0.9 }}
          animate={{ scale: 1.9, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: i * 0.25, ease: 'easeOut' }}
        />
      ))}
    </>
  );
}

function CarimboNaTesta({ p, tamanho, frase }: { p: Point; tamanho: number; frase: string }) {
  return (
    <motion.span
      className="absolute block"
      style={{ left: p.x, top: p.y - tamanho * 0.12 }}
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 3.2, times: [0, 0.85, 1] }}
    >
      <Carimbo bate atraso={0} texto={frase} tamanho={Math.max(9, tamanho * 0.17)} className="left-0 top-0 -translate-x-1/2 -translate-y-1/2" />
    </motion.span>
  );
}

/** Com "reduzir movimento": só os carimbos, parados. */
function CarimbosParados({ zoeiras, pontoDe, tamanho }: { zoeiras: readonly LiveZoeira[]; pontoDe: (id: string) => Point | null; tamanho: number }) {
  const carimbos = ultimoPorAlvo(zoeiras.filter((x) => x.z.tipo === 'carimbo'));
  return (
    <div className="pointer-events-none absolute inset-0 z-[35]" aria-hidden="true">
      {carimbos.map(({ key, z }) => {
        const p = 'alvo' in z ? pontoDe(z.alvo) : null;
        return p && z.tipo === 'carimbo' ? <CarimboNaTesta key={key} p={p} tamanho={tamanho} frase={semEmoji(z.reaction)} /> : null;
      })}
    </div>
  );
}
