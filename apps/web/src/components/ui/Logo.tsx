import { rem } from '../../lib/ui-scale';

/**
 * Logotipo: "Faz" escrito à mão sobre "quantas?", impresso, como a pergunta feita na mesa. `size` é
 * o tamanho de "quantas?" (número em px na escala 1, ou qualquer medida CSS, como um `clamp`).
 */
export function Logo({ size = 64, className }: { size?: number | string; className?: string }) {
  return (
    <span
      className={`inline-flex flex-col items-start ${className ?? ''}`}
      style={{ fontSize: typeof size === 'number' ? rem(size) : size }}
      role="img"
      aria-label="Faz quantas?"
    >
      <span
        className="font-hand font-bold leading-none text-luz"
        style={{ fontSize: '0.56em', transform: 'rotate(-4deg)', transformOrigin: 'left', marginLeft: '0.09em', marginBottom: '-0.16em' }}
      >
        Faz
      </span>
      <span
        className="whitespace-nowrap font-display font-black leading-[0.95] text-papel texto-gravado"
        style={{ fontVariationSettings: '"SOFT" 50, "WONK" 1, "opsz" 144', letterSpacing: '-0.02em' }}
      >
        quantas?
      </span>
    </span>
  );
}
