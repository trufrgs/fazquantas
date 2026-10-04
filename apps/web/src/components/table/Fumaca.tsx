import { motion, useAnimate } from 'motion/react';
import { useEffect, type CSSProperties, type ReactNode } from 'react';

/**
 * A fumaça de quem espera ("uma animação de fumaça mais exagerada, e que conforme demora mais vai
 * enchendo a tela", o Thomas, 01/10/2026). Começa quando os palheiros acendem (`DEMORA_MS`, 9 s de
 * demora) e sobe em duas etapas:
 *
 * 1. `FumacaNaMesa`: enche a mesa até sumirem assentos, palitos e cantadas. As cartas da mão que está
 *    na mesa, as cartas na testa, a vira e o painel de cantar ficam por cima dela: no limite, sobra à
 *    mostra só o que quem está na vez precisa para jogar (com a mão dele, que fica fora da mesa).
 * 2. `FumacaPorCima`: daí em diante um véu passa por cima de tudo, a mão inclusive, e fica difícil de
 *    ver. Nunca fecha de todo: dá para jogar.
 *
 * É a mesma fumaça na tela de todos (o bolicho inteiro enche). Quem pediu menos movimento não vê
 * (decide quem chama), e sala de vez longa (uma hora ou mais por jogada) também não: lá ninguém está
 * esperando ao vivo. Tudo anda por CSS e `transform`/`opacity`, sem filtro de desfoque, que pesa no
 * celular.
 *
 * Quem está no meio dela abana (arrasto rápido) ou sopra o microfone e ela abre por um instante, só
 * na tela de quem abanou (`abano` muda a cada abanada).
 */

/** Segundos, a contar de quando os palheiros acendem. */
export const FUMACA = {
  /** A mesa some em tanto tempo (dos 9 aos 40 s de demora). */
  encheS: 31,
  /** Quando o véu começa a passar por cima das cartas (aos 45 s de demora). */
  veuAposS: 36,
  /** Em quanto tempo o véu chega ao máximo (1 min 15 s de demora). */
  veuS: 30,
  /** O quanto o véu tapa no máximo: difícil de ver, mas dá para jogar. */
  veuMax: 0.55,
} as const;

/** As nuvens da mesa: onde ficam (% da mesa), o tamanho (% da largura), quando entram e o vaivém. */
const NUVENS = Array.from({ length: 14 }, (_, i) => ({
  x: (i * 37 + 9) % 100,
  y: (i * 53 + 12) % 96,
  tam: 44 + (i % 4) * 13,
  entra: (i / 14) * FUMACA.encheS * 0.85,
  vai: 8 + (i % 5) * 2.2,
  cheia: 0.5 + (i % 3) * 0.13,
}));

/** As do véu: maiores, poucas, por cima de tudo. */
const VEUS = Array.from({ length: 6 }, (_, i) => ({
  x: (i * 41 + 14) % 100,
  y: (i * 29 + 8) % 100,
  tam: 70 + (i % 3) * 18,
  entra: FUMACA.veuAposS + (i / 6) * FUMACA.veuS * 0.6,
  vai: 11 + (i % 4) * 2.6,
}));

function Nuvem({ x, y, tam, entra, vai, ate, sobe = 5 }: { x: number; y: number; tam: number; entra: number; vai: number; ate: number; sobe?: number }) {
  return (
    <motion.span
      className="absolute block aspect-square"
      style={{ left: `${x}%`, top: `${y}%`, width: `${tam}%`, x: '-50%', y: '-50%' }}
      initial={{ opacity: 0, scale: 0.25 }}
      animate={{ opacity: ate, scale: 1 }}
      transition={{ delay: entra, duration: sobe, ease: 'easeOut' }}
    >
      <span className="fumaca-nuvem block h-full w-full rounded-full" style={{ '--vai': `${vai}s` } as CSSProperties} />
    </motion.span>
  );
}

/** A abanada: a fumaça abre quase toda e volta a fechar em dois segundos. */
function Abanada({ abano, children }: { abano: number; children: ReactNode }) {
  const [el, animar] = useAnimate<HTMLDivElement>();
  useEffect(() => {
    if (abano > 0 && el.current) void animar(el.current, { opacity: [1, 0.12, 0.12, 1], scale: [1, 1.08, 1.08, 1] }, { duration: 2, times: [0, 0.12, 0.55, 1], ease: 'easeInOut' });
  }, [abano, animar, el]);
  return (
    <div ref={el} className="absolute inset-0">
      {children}
    </div>
  );
}

/** A fumaça que enche a mesa (dentro da área da mesa, por cima dos assentos e por baixo das cartas). */
export function FumacaNaMesa({ abano = 0 }: { abano?: number }) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      // A borda de baixo desmancha: a fumaça não corta reta em cima da tua faixa.
      style={{ maskImage: 'linear-gradient(to bottom, #000 86%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 86%, transparent)' }}
      exit={{ opacity: 0, scale: 1.25, transition: { duration: 0.55, ease: 'easeOut' } }}
    >
      <Abanada abano={abano}>
        {/* O fundo: fecha devagar, até a mesa sumir. */}
        <motion.div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 120% 90% at 50% 40%, rgb(222 215 204 / 0.97), rgb(205 198 188 / 0.95))' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.93 }}
          transition={{ duration: FUMACA.encheS, ease: [0.45, 0, 0.75, 0.6] }}
        />
        {NUVENS.map((n, i) => (
          <Nuvem key={i} x={n.x} y={n.y} tam={n.tam} entra={n.entra} vai={n.vai} ate={n.cheia} />
        ))}
      </Abanada>
    </motion.div>
  );
}

/** O véu que, passado o limite, passa por cima de tudo (a tela inteira, a tua mão inclusive). */
export function FumacaPorCima({ abano = 0 }: { abano?: number }) {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[45] overflow-hidden"
      exit={{ opacity: 0, scale: 1.25, transition: { duration: 0.55, ease: 'easeOut' } }}
    >
      <Abanada abano={abano}>
        <motion.div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgb(222 215 204), rgb(210 203 192))' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: FUMACA.veuMax * 0.7 }}
          transition={{ delay: FUMACA.veuAposS, duration: FUMACA.veuS, ease: 'linear' }}
        />
        {VEUS.map((n, i) => (
          <Nuvem key={i} x={n.x} y={n.y} tam={n.tam} entra={n.entra} vai={n.vai} ate={FUMACA.veuMax * 0.75} sobe={8} />
        ))}
      </Abanada>
    </motion.div>
  );
}
