import { REACTIONS, temGolpe, type AvatarComGolpe, type ItemDeAtirar, type ReactionId } from '@fodinha/engine';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, type ComponentType } from 'react';
import { haptic } from '../../../lib/haptics';
import { play } from '../../../lib/sound';
import { useSettings } from '../../../stores/settings';
import type { LiveZoeira } from '../../../stores/game';
import { Carimbo } from '../../ui/Carimbo';
import type { Point } from '../layout';
import { sintetizar } from '../../../lib/sintetizado';
import { Bergamota, Chinelo, FocinhoDePorco, FumacaDaOrelha, Galo, JatoDeVinho, Lagrima, Mancha, NuvemDoZorrilho, Ovo, QueroQuero, Rachadura, Tomate } from './desenhos';

/**
 * A zoeira que os jogadores mandam, na mesa (caderno de zoeira, 02/10/2026): o tiro que cruza a mesa
 * e mancha o rosto (na Capivara plena escorrega sem sujar), o golpe de cada avatar, o cutucão e a
 * baforada em quem demora, a frase carimbada na testa (algumas com efeito no rosto: as lágrimas do
 * "Chorão!", o chinelo do "Chinelão!", o focinho do "Guloso!"), a rachadura da pancada. A virada de
 * mesa, o tremor da pancada e o berro do bugio mexem na mesa inteira (quem chama passa `sacudir`).
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
  avatarDe,
}: {
  zoeiras: readonly LiveZoeira[];
  /** Onde está o rosto de cada um, em px da mesa (`null`: não aparece). */
  pontoDe: (id: string) => Point | null;
  /** Diâmetro dos rostos (px na tela). */
  tamanho: number;
  youId: string | null;
  /** Mexe na mesa inteira: o tremor da pancada e a virada. */
  sacudir: (tipo: 'pancada' | 'virar', forca: number) => void;
  /** O avatar de cada um (o golpe é do avatar de quem manda; na capivara nada suja). */
  avatarDe: (id: string) => string | undefined;
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
      if (z.tipo === 'golpe') {
        const a = avatarDe(z.de);
        if (a === 'g-vo-do-chinelo') [450, 1150].forEach((d) => play('play', { delayMs: d, rate: 0.55 }));
        if (a === 'g-zorrilho') sintetizar('pum', { delayMs: 350 });
        if (a === 'g-bugio') {
          sintetizar('berro');
          sacudir('pancada', 2);
        }
        if (a === 'g-garnise') [500, 720, 940, 1160].forEach((d) => play('tick', { delayMs: d, rate: 1.6 }));
        if (a === 'g-quero-quero') sintetizar('alarme', { delayMs: 150 });
        if (a === 'g-gringo-do-vinho') play('pop', { delayMs: 480, rate: 0.5 });
      }
      if (z.tipo === 'baforada') sintetizar('sopro');
      if (z.tipo === 'carimbo' && z.reaction === 'guloso') sintetizar('ronco', { delayMs: 500 });
      if (z.tipo === 'carimbo' && z.reaction === 'chinelao') [450, 800].forEach((d) => play('play', { delayMs: d, rate: 0.5 }));
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
  }, [zoeiras, sacudir, youId, hapticsOn, avatarDe]);
  if (reduce) return <CarimbosParados zoeiras={zoeiras} pontoDe={pontoDe} tamanho={tamanho} />;

  // O golpe conta como tiro: no máximo `MAX_TIROS` coisas voando, somando os dois.
  const tiros = zoeiras.filter((x) => x.z.tipo === 'atirar' || x.z.tipo === 'golpe').slice(-MAX_TIROS);
  const baforadas = ultimoPorAlvo(zoeiras.filter((x) => x.z.tipo === 'baforada'));
  const carimbos = ultimoPorAlvo(zoeiras.filter((x) => x.z.tipo === 'carimbo'));
  const cutucoes = ultimoPorAlvo(zoeiras.filter((x) => x.z.tipo === 'cutucar'));
  // A rachadura é só da pancada forte; a leve só treme a mesa.
  const pancada = zoeiras.filter((x) => x.z.tipo === 'pancada' && x.z.forca >= 2).at(-1);
  return (
    <div className="pointer-events-none absolute inset-0 z-[35] overflow-visible" aria-hidden="true">
      <AnimatePresence>
        {tiros.map(({ key, z }) => {
          if (z.tipo !== 'atirar' && z.tipo !== 'golpe') return null;
          const de = pontoDe(z.de);
          const para = pontoDe(z.alvo);
          if (!de || !para) return null;
          const liso = avatarDe(z.alvo) === 'g-capivara';
          if (z.tipo === 'atirar') return <Tiro key={key} de={de} para={para} item={z.item} tamanho={tamanho} liso={liso} />;
          const a = avatarDe(z.de);
          return temGolpe(a) ? <Golpe key={key} avatar={a} de={de} para={para} tamanho={tamanho} liso={liso} /> : null;
        })}
        {baforadas.map(({ key, z }) => {
          const de = pontoDe(z.de);
          const para = 'alvo' in z ? pontoDe(z.alvo) : null;
          return de && para ? <Baforada key={key} de={de} para={para} tamanho={tamanho} /> : null;
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
        {carimbos.map(({ key, z }) => {
          const p = 'alvo' in z ? pontoDe(z.alvo) : null;
          return p && z.tipo === 'carimbo' ? <EfeitoDoCarimbo key={`e${key}`} p={p} tamanho={tamanho} reaction={z.reaction} /> : null;
        })}
        {pancada && (
          <motion.span
            key={pancada.key}
            data-rachadura
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
function Tiro({ de, para, item, tamanho, liso }: { de: Point; para: Point; item: ItemDeAtirar; tamanho: number; liso: boolean }) {
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
      {liso ? (
        // A Capivara plena nem se abala: o que bate escorrega pelo rosto e cai, sem sujar.
        <motion.span
          className="absolute block"
          style={{ left: para.x, top: para.y, width: w, marginLeft: -w / 2, marginTop: -w / 2 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0], y: [0, 0, tamanho * 0.5, tamanho * 1.1], x: [0, 0, tamanho * 0.1, tamanho * 0.25], rotate: [0, 0, 40, 160] }}
          transition={{ duration: 1.4, delay: 0.55, times: [0, 0.01, 0.55, 1], ease: 'easeIn' }}
        >
          <Desenho w="100%" />
        </motion.span>
      ) : item === 'chinelo' ? (
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

/**
 * O golpe da casa de cada avatar, sem palavra: a vó atira o chinelo, ele volta e bate de novo; o
 * zorrilho solta a nuvem verde; o bugio berra e a mesa inteira treme; o
 * garnisé voa na cabeça e bica; o quero-quero dá o rasante por cima; o gringo joga o vinho.
 */
function Golpe({ avatar, de, para, tamanho, liso }: { avatar: AvatarComGolpe; de: Point; para: Point; tamanho: number; liso: boolean }) {
  const w = Math.max(26, tamanho * 0.5);
  const alto = Math.min(de.y, para.y) - Math.max(60, Math.abs(de.x - para.x) * 0.35);
  const meio = { x: (de.x + para.x) / 2, y: alto };
  const caixa = (largura: number) => ({ left: 0, top: 0, width: largura, marginLeft: -largura / 2, marginTop: -largura / 2 });
  switch (avatar) {
    case 'g-vo-do-chinelo':
      return (
        <motion.span
          className="absolute block"
          style={caixa(w * 1.1)}
          initial={{ x: de.x, y: de.y }}
          animate={{ x: [de.x, meio.x, para.x, meio.x + 30, para.x, para.x], y: [de.y, meio.y, para.y, meio.y + 20, para.y, para.y + tamanho], rotate: [0, 360, 700, 900, 1260, 1330], opacity: [1, 1, 1, 1, 1, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.7, times: [0, 0.15, 0.3, 0.5, 0.7, 1], ease: 'linear' }}
        >
          <Chinelo w="100%" />
        </motion.span>
      );
    case 'g-zorrilho':
      return (
        <motion.span
          className="absolute block"
          style={caixa(tamanho * 1.25)}
          initial={{ x: para.x, y: para.y, scale: 0.2, opacity: 0 }}
          animate={{ x: [para.x, para.x + 4, para.x - 4, para.x], scale: [0.2, 1, 1.05, 1.2], opacity: [0, 0.95, 0.9, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.8, delay: 0.3, times: [0, 0.12, 0.7, 1] }}
        >
          <NuvemDoZorrilho w="100%" />
        </motion.span>
      );
    case 'g-bugio':
      // O berro é o som e o tranco da mesa inteira (em `sacudir`): desenho por cima só atrapalharia.
      return null;
    case 'g-garnise':
      return (
        <motion.span
          className="absolute block"
          style={caixa(w)}
          initial={{ x: de.x, y: de.y, scaleX: para.x < de.x ? 1 : -1 }}
          animate={{
            x: [de.x, meio.x, para.x, para.x, para.x, para.x, para.x, para.x + 200],
            y: [de.y, meio.y, para.y - tamanho * 0.55, para.y - tamanho * 0.42, para.y - tamanho * 0.55, para.y - tamanho * 0.42, para.y - tamanho * 0.55, para.y - tamanho * 1.4],
            rotate: [0, 0, 0, 22, 0, 22, 0, -10],
            opacity: [1, 1, 1, 1, 1, 1, 1, 0],
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.9, times: [0, 0.14, 0.28, 0.38, 0.48, 0.58, 0.68, 1], ease: 'easeInOut' }}
        >
          <Galo w="100%" />
        </motion.span>
      );
    case 'g-quero-quero': {
      const ida = de.x < para.x ? 1 : -1;
      return (
        <motion.span
          className="absolute block"
          style={caixa(w * 2.2)}
          initial={{ x: para.x - ida * 260, y: para.y - tamanho * 2, scaleX: ida }}
          animate={{ x: [para.x - ida * 260, para.x, para.x + ida * 260], y: [para.y - tamanho * 2, para.y - tamanho * 0.55, para.y - tamanho * 2.2], rotate: [ida * 18, 0, ida * -18] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
        >
          <QueroQuero w="100%" />
        </motion.span>
      );
    }
    case 'g-gringo-do-vinho': {
      const graus = (Math.atan2(para.y - de.y, para.x - de.x) * 180) / Math.PI;
      return (
        <>
          <motion.span
            className="absolute block"
            style={{ ...caixa(w * 1.4), rotate: `${graus}deg` }}
            initial={{ x: de.x, y: de.y, scaleX: 0.3, opacity: 1 }}
            animate={{ x: [de.x, para.x], y: [de.y, para.y], scaleX: [0.3, 1.2, 0.6], opacity: [1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeIn' }}
          >
            <JatoDeVinho w="100%" />
          </motion.span>
          {!liso && (
            <motion.span
              className="absolute block"
              style={{ left: para.x, top: para.y, width: tamanho * 0.95, marginLeft: -tamanho * 0.475, marginTop: -tamanho * 0.45 }}
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.2, 1.15, 1, 1], y: [0, 0, 0, tamanho * 0.3] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.6, delay: 0.5, times: [0, 0.06, 0.75, 1] }}
            >
              <Mancha w="100%" cor="#8E1E35" miolo="#5E0F22" />
            </motion.span>
          )}
        </>
      );
    }
  }
}

/** A baforada: quem espera no fumo sopra o palheiro na cara de quem está demorando. */
function Baforada({ de, para, tamanho }: { de: Point; para: Point; tamanho: number }) {
  const w = tamanho * 0.9;
  return (
    <motion.span
      className="absolute block"
      style={{ left: 0, top: 0, width: w, marginLeft: -w / 2, marginTop: -w / 2 }}
      initial={{ x: de.x, y: de.y, scale: 0.3, opacity: 0.9 }}
      animate={{ x: [de.x, para.x, para.x], y: [de.y, para.y, para.y - tamanho * 0.3], scale: [0.3, 1.2, 1.8], opacity: [0.9, 0.95, 0] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.6, times: [0, 0.45, 1], ease: 'easeOut' }}
    >
      <FumacaDaOrelha w="100%" />
    </motion.span>
  );
}

/**
 * Algumas frases carimbadas mexem no rosto do alvo: o chafariz de lágrimas do "Chorão!", o chinelo
 * que estala dos dois lados no "Chinelão!" e o focinho de porco do "Guloso!".
 */
function EfeitoDoCarimbo({ p, tamanho, reaction }: { p: Point; tamanho: number; reaction: ReactionId }) {
  if (reaction === 'chorao') {
    return (
      <>
        {Array.from({ length: 8 }, (_, i) => {
          const lado = i % 2 ? 1 : -1;
          const w = Math.max(9, tamanho * 0.17);
          return (
            <motion.span
              key={i}
              className="absolute block"
              style={{ left: p.x + lado * tamanho * 0.16, top: p.y - tamanho * 0.05, width: w, marginLeft: -w / 2 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0], x: [0, lado * tamanho * 0.35, lado * tamanho * 0.6], y: [0, -tamanho * 0.25, tamanho * 0.45] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.3 + Math.floor(i / 2) * 0.22, ease: 'easeOut' }}
            >
              <Lagrima w="100%" />
            </motion.span>
          );
        })}
      </>
    );
  }
  if (reaction === 'chinelao') {
    const w = Math.max(24, tamanho * 0.42);
    return (
      <motion.span
        className="absolute block"
        style={{ left: p.x, top: p.y, width: w, marginLeft: -w / 2, marginTop: -w }}
        initial={{ x: tamanho * 0.8, opacity: 0 }}
        animate={{ x: [tamanho * 0.8, tamanho * 0.15, tamanho * 0.5, -tamanho * 0.15, -tamanho * 0.8], rotate: [40, -10, 20, 10, -40], opacity: [0, 1, 1, 1, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.9, delay: 0.3, times: [0, 0.25, 0.5, 0.65, 1], ease: 'easeInOut' }}
      >
        <Chinelo w="100%" />
      </motion.span>
    );
  }
  if (reaction === 'guloso') {
    const w = tamanho * 0.38;
    return (
      <motion.span
        className="absolute block"
        style={{ left: p.x, top: p.y + tamanho * 0.04, width: w, marginLeft: -w / 2 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1, 1], opacity: [0, 1, 1, 0] }}
        exit={{ opacity: 0 }}
        transition={{ duration: 2.6, delay: 0.35, times: [0, 0.08, 0.15, 1] }}
      >
        <FocinhoDePorco w="100%" />
      </motion.span>
    );
  }
  return null;
}
