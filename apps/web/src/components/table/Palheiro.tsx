import { motion, useReducedMotion } from 'motion/react';

/** Uma tragada a cada tantos segundos (a brasa acende, a fumaça sobe). */
const CICLO = 3.6;

/**
 * O palheiro no canto da boca de quem espera alguém que demora ("puxando fumo quando o cara demora",
 * o Igor, e o Thomas: "uma animação dos avatares", 29/09/2026). A brasa acende a cada tragada e a
 * fumaça sobe em baforadas grossas, que crescem e se espalham ("mais exagerada", o Thomas,
 * 01/10/2026; a que enche a tela é a `Fumaca`); `atraso` desencontra os avatares (cada um traga na
 * sua hora). Com "reduzir movimento", o palheiro fica parado, sem fumaça.
 */
export function Palheiro({ size, atraso = 0 }: { size: number; atraso?: number }) {
  const reduce = useReducedMotion();
  const comp = size * 0.46;
  const grossura = Math.max(3, size * 0.08);
  const brasa = grossura * 1.25;
  const nuvem = size * 0.6;
  return (
    <motion.span
      className="pointer-events-none absolute z-20 block"
      style={{ left: size * 0.54, top: size * 0.64, width: comp, height: grossura, rotate: -16, originX: 0, originY: 0.5 }}
      initial={{ opacity: 0, scaleX: 0.3 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      aria-hidden="true"
    >
      {/* O cigarro de palha de milho. */}
      <span
        className="absolute inset-0 block rounded-full"
        style={{ background: 'linear-gradient(180deg, #f1e3b6, #d8bf86 60%, #b99a5c)', boxShadow: '0 1px 2px rgb(0 0 0 / 0.45)' }}
      />
      {/* A brasa na ponta. */}
      <motion.span
        className="absolute block rounded-full"
        style={{ right: -brasa * 0.35, top: (grossura - brasa) / 2, width: brasa, height: brasa, background: 'radial-gradient(circle, #ffe08a, #ff6a1f 55%, #8a2408)' }}
        animate={reduce ? undefined : { scale: [1, 1.7, 1.15, 1], opacity: [0.75, 1, 0.9, 0.75] }}
        transition={{ duration: CICLO, delay: atraso, repeat: Infinity, times: [0, 0.12, 0.35, 1], ease: 'easeOut' }}
      />
      {/* As baforadas: sobem da ponta, crescem e somem. */}
      {!reduce &&
        [0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            className="absolute block rounded-full"
            style={{
              right: -nuvem / 2,
              top: -nuvem / 2,
              width: nuvem,
              height: nuvem,
              rotate: 16,
              background: 'radial-gradient(circle, rgb(246 244 238 / 0.97), rgb(226 221 212 / 0.75) 48%, transparent 72%)',
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 1, 0.85, 0],
              x: [0, size * (0.08 + i * 0.06), size * ((i % 2 ? -0.1 : 0.3) + i * 0.08), size * ((i % 2 ? -0.4 : 0.6) + i * 0.05)],
              y: [0, -size * 0.5, -size * 1.1, -size * 1.9],
              scale: [0.35, 1.2, 2.2, 3.4],
            }}
            transition={{ duration: 3.3, delay: atraso + 0.45 + i * 0.22, repeat: Infinity, repeatDelay: CICLO - 3.3, ease: 'easeOut' }}
          />
        ))}
    </motion.span>
  );
}
