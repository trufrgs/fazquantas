import { useId, type CSSProperties } from 'react';

/**
 * Os adereços da zoeira, na mesma língua dos avatares (`brand/avatares.js`): formas chapadas,
 * contorno grosso de tinta, paleta quente. Nada de emoji nem ícone genérico: o que aparece na mesa
 * tem cara de galpão. Cada um é um SVG que ocupa a largura dada (`w`, em qualquer medida CSS).
 */
const T = '#2B1D14';
const P = {
  copas: '#C4372D',
  copasClaro: '#E0584B',
  papel: '#FBF2DF',
  ouro: '#E3A82B',
  ouroClaro: '#F6D77A',
  chapeu: '#3B291D',
  aba: '#2A1C13',
  pedra: '#B9B2A6',
  pedraEscura: '#948D82',
  azul: '#2F6FB5',
};
const s = (w = 6) => ({ stroke: T, strokeWidth: w, strokeLinejoin: 'round', strokeLinecap: 'round' }) as const;

interface Desenho {
  /** Largura (medida CSS); a altura segue a proporção do desenho. */
  w: string;
  className?: string;
  style?: CSSProperties;
}
const svg = (p: Desenho, viewBox: string) => ({
  viewBox,
  className: p.className,
  style: { width: p.w, height: 'auto', display: 'block', overflow: 'visible', ...p.style } as CSSProperties,
  'aria-hidden': true,
});

/** A coroa de lata de quem lidera em palitos (o líder do campeonato; o último carrega a lanterna). */
export function Coroa(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 104 76')}>
      <path d="M10 66 L6 22 L30 42 L52 8 L74 42 L98 22 L94 66 Z" fill={P.ouro} {...s()} />
      <path d="M12 54 H92 L94 66 H10 Z" fill="#A8741A" {...s(5)} />
      <circle cx="52" cy="8" r="6" fill={P.copas} {...s(4)} />
      <circle cx="6" cy="22" r="5" fill={P.ouroClaro} {...s(4)} />
      <circle cx="98" cy="22" r="5" fill={P.ouroClaro} {...s(4)} />
    </svg>
  );
}

/** O chapéu campeiro do patrão da mesa, quem manda na sala (o mesmo desenho do chapéu dos avatares). */
export function Chapeu(p: Desenho) {
  return (
    <svg {...svg(p, '-102 -66 204 90')}>
      <ellipse cx="0" cy="0" rx="96" ry="17" fill={P.aba} {...s()} />
      <path d="M-48 2 C-50 -26 -45 -48 -37 -55 C-16 -61 16 -61 37 -55 C45 -48 50 -26 48 2 C24 7 -24 7 -48 2 Z" fill={P.chapeu} {...s()} />
      <path d="M-49 -12 C-24 -6 24 -6 49 -12 L48 2 C24 7 -24 7 -48 2 Z" fill={P.ouro} {...s(5)} />
      <path d="M-22 -55 Q0 -45 22 -55" fill="none" {...s(5)} />
    </svg>
  );
}

/** A lanterna de quem está em último (o lampião do fim do trem). */
export function Lanterna(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 48 66')}>
      <path d="M14 16 C14 2 34 2 34 16" fill="none" {...s(4)} />
      <path d="M12 16 H36 L33 24 H15 Z" fill={P.copas} {...s(4)} />
      <path d="M15 24 C8 34 8 44 15 52 H33 C40 44 40 34 33 24 Z" fill={P.ouroClaro} {...s(4)} />
      <path d="M24 30 C29 36 30 41 27 46 C25 49 22 49 20 46 C18 42 20 38 24 30 Z" fill="#F0892B" />
      <path d="M11 52 H37 L39 62 H9 Z" fill={P.copas} {...s(4)} />
    </svg>
  );
}

/** O chinelo da vó (o mesmo do avatar), para varrer quem saiu. */
export function Chinelo(p: Desenho) {
  return (
    <svg {...svg(p, '-34 -70 68 128')}>
      <path d="M-22 -40 C-16 -62 18 -64 24 -42 L26 30 C26 52 -24 52 -24 30 Z" fill={P.azul} {...s()} />
      <path d="M-17 -38 C-12 -54 13 -56 19 -40 L20 26 C20 42 -18 42 -18 26 Z" fill="#F4EEE2" {...s(4)} />
      <path d="M0 -34 L-17 0 M0 -34 L19 0" fill="none" {...s(11)} />
      <path d="M0 -34 L-17 0 M0 -34 L19 0" fill="none" stroke={P.azul} strokeWidth={5} strokeLinecap="round" />
    </svg>
  );
}

/**
 * A lápide de quem saiu: fica atrás do rosto, que vira o retrato dela. `viewBox` de 120×140 com o
 * retrato centrado em (60, 60).
 */
export function Lapide(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 120 140')}>
      <path d="M12 126 V56 C12 6 108 6 108 56 V126 Z" fill={P.pedra} {...s()} />
      <path d="M94 126 V56 C94 30 80 16 62 12 C92 12 108 30 108 56 V126 Z" fill={P.pedraEscura} />
      <path d="M12 126 V56 C12 6 108 6 108 56 V126 Z" fill="none" {...s()} />
      <path d="M2 124 H118 V138 H2 Z" fill={P.pedraEscura} {...s()} />
      <path d="M22 122 L26 110 L31 122 M88 122 L93 108 L98 122" fill="none" stroke="#3D7A3A" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A vaca que cai em quem errou feio ("a vaca foi pro brejo"). */
export function Vaca(p: Desenho) {
  const id = useId();
  return (
    <svg {...svg(p, '0 0 204 136')}>
      {/* rabo */}
      <path d="M176 46 C192 50 196 64 190 80" fill="none" {...s(5)} />
      <path d="M190 78 C196 84 194 92 188 94 C184 90 184 82 190 78 Z" fill={T} {...s(3)} />
      {/* pernas */}
      {[62, 84, 132, 154].map((x) => (
        <g key={x}>
          <path d={`M${x} 90 L${x - 2} 122 H${x + 14} L${x + 14} 90 Z`} fill={P.papel} {...s(5)} />
          <path d={`M${x - 3} 116 H${x + 15} V126 H${x - 3} Z`} fill={T} {...s(3)} />
        </g>
      ))}
      {/* úbere */}
      <path d="M100 96 C100 114 128 114 128 96 Z" fill="#F2A7B0" {...s(5)} />
      {/* corpo, com as manchas recortadas nele */}
      <clipPath id={id}>
        <path d="M44 52 C44 26 72 18 112 18 C152 18 180 30 180 60 C180 88 158 100 112 100 C68 100 44 86 44 52 Z" />
      </clipPath>
      <path d="M44 52 C44 26 72 18 112 18 C152 18 180 30 180 60 C180 88 158 100 112 100 C68 100 44 86 44 52 Z" fill={P.papel} />
      <g clipPath={`url(#${id})`} fill={T}>
        <path d="M84 10 C92 40 126 46 138 14 Z" />
        <path d="M150 50 C140 66 150 96 176 92 C192 78 186 52 150 50 Z" />
        <path d="M66 76 C76 70 92 78 90 104 L56 104 Z" />
      </g>
      <path d="M44 52 C44 26 72 18 112 18 C152 18 180 30 180 60 C180 88 158 100 112 100 C68 100 44 86 44 52 Z" fill="none" {...s()} />
      {/* cabeça */}
      <path d="M4 34 C-2 24 6 16 16 22 Z" fill={P.papel} {...s(4)} />
      <path d="M62 30 C70 20 62 12 52 18 Z" fill={P.papel} {...s(4)} />
      <path d="M14 22 C12 10 20 4 26 8 C24 14 22 18 22 24 Z" fill={P.ouroClaro} {...s(4)} />
      <path d="M52 20 C54 8 46 2 40 6 C42 12 44 16 44 22 Z" fill={P.ouroClaro} {...s(4)} />
      <path d="M10 44 C8 26 22 16 34 16 C48 16 60 26 58 46 C56 66 46 78 34 78 C20 78 12 64 10 44 Z" fill={P.papel} {...s()} />
      <path d="M40 18 C52 22 58 32 58 46 C58 52 56 58 54 62 C46 52 42 34 40 18 Z" fill={T} />
      <ellipse cx="34" cy="64" rx="20" ry="13" fill="#F2A7B0" {...s(5)} />
      <ellipse cx="27" cy="64" rx="3" ry="4" fill={T} />
      <ellipse cx="41" cy="64" rx="3" ry="4" fill={T} />
      <ellipse cx="24" cy="38" rx="6" ry="8" fill="#fff" {...s(4)} />
      <ellipse cx="45" cy="38" rx="6" ry="8" fill="#fff" {...s(4)} />
      <circle cx="25" cy="40" r="3" fill={T} />
      <circle cx="44" cy="40" r="3" fill={T} />
    </svg>
  );
}

/** A traíra (o peixe) que dá de rabo em quem trai o "é galo". */
export function Traira(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 204 104')}>
      <path d="M150 50 L196 16 C188 40 188 62 196 88 Z" fill="#5E7A3A" {...s()} />
      <path d="M92 20 C104 4 128 6 132 22 Z" fill="#5E7A3A" {...s(5)} />
      <path d="M96 82 C104 96 122 96 126 82 Z" fill="#5E7A3A" {...s(5)} />
      <path d="M8 52 C30 14 110 8 158 46 C158 52 158 54 158 58 C110 96 30 92 8 52 Z" fill="#8B9B52" {...s()} />
      <path d="M12 56 C40 84 104 88 152 58 C110 74 50 74 12 56 Z" fill="#E9E2C4" />
      <path d="M8 52 C30 14 110 8 158 46 C158 52 158 54 158 58 C110 96 30 92 8 52 Z" fill="none" {...s()} />
      <path d="M62 30 Q70 50 62 72 M84 26 Q92 50 84 76 M106 28 Q114 50 106 74 M128 34 Q134 50 128 68" fill="none" stroke={T} strokeWidth={3} strokeLinecap="round" opacity={0.45} />
      <path d="M10 54 L40 60" fill="none" {...s(5)} />
      <path d="M16 55 L19 61 L22 56 L25 62 L28 57 L31 63 L34 58" fill="#fff" stroke={T} strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx="36" cy="40" r="8" fill="#fff" {...s(4)} />
      <circle cx="35" cy="41" r="3.5" fill={T} />
      <path d="M26 28 L46 32" fill="none" {...s(5)} />
    </svg>
  );
}

/** A chama da mão quente (atrás do rosto). */
export function Chama(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 100 108')}>
      <path d="M50 4 C66 28 88 42 84 68 C82 92 64 104 50 104 C34 104 16 92 16 66 C14 46 28 42 32 24 C40 36 46 28 50 4 Z" fill="#F0892B" {...s()} />
      <path d="M50 46 C60 60 68 68 64 84 C62 96 54 100 50 100 C44 100 36 94 36 82 C36 68 46 62 50 46 Z" fill={P.ouroClaro} />
    </svg>
  );
}

/** O cinzeiro da espera, com as bitucas que cabem à vista (`bitucas`, até nove). */
export function Cinzeiro(p: Desenho & { bitucas: number }) {
  const lugares = [
    [44, 34, -24],
    [70, 30, 18],
    [58, 40, -6],
    [84, 38, -30],
    [36, 42, 12],
    [62, 26, 40],
    [50, 30, -48],
    [76, 44, 4],
    [90, 30, 30],
  ] as const;
  return (
    <svg {...svg(p, '0 0 124 74')}>
      <ellipse cx="62" cy="40" rx="56" ry="28" fill="#CFD6D2" {...s()} />
      <ellipse cx="62" cy="36" rx="44" ry="19" fill="#3A332D" {...s(5)} />
      <path d="M6 40 C6 58 30 68 62 68 C94 68 118 58 118 40" fill="none" stroke={T} strokeWidth={3} opacity={0.35} />
      {lugares.slice(0, Math.min(p.bitucas, lugares.length)).map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
          <rect x="-11" y="-3.5" width="22" height="7" rx="3" fill="#F1EAD8" stroke={T} strokeWidth={2.5} />
          <rect x="-11" y="-3.5" width="8" height="7" rx="3" fill="#D9A35B" stroke={T} strokeWidth={2.5} />
          <rect x="8" y="-2.5" width="3" height="5" fill="#3A332D" />
        </g>
      ))}
    </svg>
  );
}

/** O tomate, para atirar em quem merece. */
export function Tomate(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 60 58')}>
      <path d="M30 12 C48 10 58 24 56 36 C54 50 42 56 30 56 C16 56 4 48 4 34 C4 20 14 12 30 12 Z" fill={P.copas} {...s(5)} />
      <path d="M14 26 C16 20 22 17 26 18" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" opacity={0.55} />
      <path d="M30 14 L22 6 L28 10 L30 2 L33 10 L40 5 L35 14 Z" fill="#3D7A3A" {...s(4)} />
    </svg>
  );
}

/** O ovo. */
export function Ovo(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 48 60')}>
      <path d="M24 4 C38 4 44 30 44 38 C44 50 35 56 24 56 C13 56 4 50 4 38 C4 30 10 4 24 4 Z" fill="#F7EFDE" {...s(5)} />
      <path d="M14 22 C15 16 18 12 21 11" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" />
    </svg>
  );
}

/** A bergamota passada (a tangerina do Sul). */
export function Bergamota(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 60 56')}>
      <path d="M30 10 C46 8 56 18 56 32 C56 46 44 54 30 54 C16 54 4 46 4 32 C4 18 14 10 30 10 Z" fill="#E98A1E" {...s(5)} />
      <path d="M16 30 C16 26 18 24 20 24 M42 22 C44 24 44 26 44 28 M28 42 C30 44 32 44 34 42" fill="none" stroke="#B4600F" strokeWidth={3} strokeLinecap="round" />
      <path d="M30 11 C32 5 38 2 44 4 C40 8 36 10 30 11 Z" fill="#3D7A3A" {...s(4)} />
      <circle cx="44" cy="40" r="5" fill="#6B8E2A" opacity={0.8} />
    </svg>
  );
}

/** A mancha que fica no rosto de quem levou o tiro (cor de cada coisa). */
export function Mancha({ cor, miolo, ...p }: Desenho & { cor: string; miolo?: string }) {
  return (
    <svg {...svg(p, '0 0 120 110')}>
      <path
        d="M58 8 C70 22 84 6 88 24 C102 22 98 40 112 44 C100 54 116 66 100 72 C104 90 84 86 80 100 C68 90 58 108 48 96 C36 104 30 88 18 90 C22 76 4 72 14 60 C2 50 16 40 10 30 C24 30 22 12 38 18 C42 6 52 18 58 8 Z"
        fill={cor}
        {...s(4)}
      />
      {miolo && <circle cx="58" cy="56" r="20" fill={miolo} {...s(4)} />}
      <path d="M30 40 C34 34 40 32 44 34" fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.45} />
    </svg>
  );
}

/** A rachadura que a pancada deixa na madeira. */
export function Rachadura(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 100 100')}>
      <path d="M50 50 22 36 8 40M50 50l20-27-2-15M50 50l37 9 9-6M50 50 41 81l6 13M50 50 27 63l-9 12M50 50l14 22" fill="none" stroke="#1d120b" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
      <path d="M50 50 22 36 8 40M50 50l20-27-2-15M50 50l37 9 9-6M50 50 41 81l6 13M50 50 27 63l-9 12M50 50l14 22" fill="none" stroke="#ffd9a0" strokeWidth={0.8} strokeLinecap="round" opacity={0.35} transform="translate(1 1)" />
    </svg>
  );
}

/** A cuia vista de cima, com a erva e a bomba (que aponta quem dá as cartas). */
export function CuiaDeCima({ giro = 0, ...p }: Desenho & { giro?: number }) {
  return (
    <svg {...svg(p, '0 0 120 120')}>
      <circle cx="60" cy="60" r="52" fill="#8A5733" {...s()} />
      <circle cx="60" cy="60" r="40" fill="#C9A24A" {...s(5)} />
      <circle cx="60" cy="60" r="32" fill="#5C7F2A" {...s(4)} />
      <path d="M44 52 C50 46 58 48 60 54 M66 66 C72 62 78 66 76 72" fill="none" stroke="#3F5A1C" strokeWidth={3} strokeLinecap="round" />
      <g transform={`rotate(${giro} 60 60)`}>
        <path d="M60 60 L60 6" fill="none" stroke={T} strokeWidth={11} strokeLinecap="round" />
        <path d="M60 60 L60 6" fill="none" stroke="#D9D6CC" strokeWidth={6} strokeLinecap="round" />
        <circle cx="60" cy="60" r="7" fill="#D9D6CC" {...s(4)} />
      </g>
    </svg>
  );
}

/** O galo de perfil, de peito estufado (atravessa a mesa quando alguém canta "é galo"). */
export function Galo(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 120 120')}>
      <path d="M30 104 L34 88 M50 104 L48 88" fill="none" stroke="#E3A82B" strokeWidth={6} strokeLinecap="round" />
      <path d="M20 46 C6 30 10 14 24 18 C22 30 30 36 34 44 Z" fill="#2E5C9C" {...s(5)} />
      <path d="M14 56 C2 44 8 30 20 34 C20 44 26 50 30 56 Z" fill="#3D7A3A" {...s(5)} />
      <path d="M26 54 C26 40 44 34 62 40 L84 34 C92 50 90 70 78 82 C66 94 40 94 30 84 C24 76 24 64 26 54 Z" fill="#C4372D" {...s()} />
      <path d="M40 66 C48 76 62 78 72 70" fill="none" stroke="#8E231C" strokeWidth={5} strokeLinecap="round" />
      <path d="M78 40 C76 26 84 14 96 16 C106 18 108 30 104 40 C100 48 88 48 78 40 Z" fill="#E0892F" {...s()} />
      <path d="M84 16 C82 6 90 4 92 12 C94 4 102 4 100 14 C106 8 112 14 104 20 Z" fill="#C4372D" {...s(4)} />
      <path d="M104 28 L116 32 L104 36 Z" fill="#F6D77A" {...s(4)} />
      <path d="M100 40 C104 48 98 54 94 48 Z" fill="#C4372D" {...s(4)} />
      <circle cx="96" cy="27" r="3.5" fill={T} />
    </svg>
  );
}

/** O gato preto da sexta-feira 13, de perfil. */
export function GatoPreto(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 130 100')}>
      <path d="M14 40 C2 30 8 12 18 16 C12 24 18 34 24 40" fill="none" stroke="#1d1d22" strokeWidth={9} strokeLinecap="round" />
      <path d="M22 50 C22 36 40 32 70 34 C90 36 98 44 98 56 C98 70 86 76 64 76 C40 76 22 66 22 50 Z" fill="#1d1d22" {...s(4)} />
      {[34, 48, 74, 88].map((x) => (
        <path key={x} d={`M${x} 70 L${x - 2} 94`} fill="none" stroke="#1d1d22" strokeWidth={8} strokeLinecap="round" />
      ))}
      <path d="M90 40 C88 24 100 16 112 20 C124 24 124 40 116 48 C108 54 94 52 90 40 Z" fill="#1d1d22" {...s(4)} />
      <path d="M96 24 L98 8 L106 20 M110 20 L118 8 L118 26" fill="#1d1d22" {...s(4)} />
      <ellipse cx="112" cy="33" rx="3.5" ry="5" fill="#F6D77A" />
      <ellipse cx="102" cy="33" rx="3.5" ry="5" fill="#F6D77A" />
    </svg>
  );
}

/** O espeto de churrasco do 24 de abril. */
export function Espeto(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 180 40')}>
      <path d="M6 20 H170" fill="none" stroke={T} strokeWidth={7} strokeLinecap="round" />
      <path d="M6 20 H170" fill="none" stroke="#D9D6CC" strokeWidth={3} strokeLinecap="round" />
      <path d="M150 12 L174 20 L150 28 Z" fill="#D9D6CC" {...s(3)} />
      {[[28, '#8E3B26'], [62, '#A9542F'], [96, '#8E3B26'], [128, '#C66B3D']].map(([x, cor]) => (
        <path key={x as number} d={`M${(x as number) - 14} 8 C${(x as number) - 4} 2 ${(x as number) + 12} 4 ${(x as number) + 14} 14 C${(x as number) + 16} 28 ${(x as number) + 4} 36 ${(x as number) - 8} 34 C${(x as number) - 18} 30 ${(x as number) - 20} 14 ${(x as number) - 14} 8 Z`} fill={cor as string} {...s(4)} />
      ))}
    </svg>
  );
}

/** A bola de capim seco que rola no duelo. */
export function Capim(p: Desenho) {
  return (
    <svg {...svg(p, '0 0 100 100')}>
      <circle cx="50" cy="50" r="40" fill="none" stroke="#B48A4E" strokeWidth={5} />
      <path d="M18 40 C40 20 70 30 82 58 M22 66 C40 46 64 52 78 34 M36 84 C40 60 58 40 66 16 M50 10 C46 40 60 66 54 90" fill="none" stroke="#9C7340" strokeWidth={4} strokeLinecap="round" />
    </svg>
  );
}

/** O lenço do 20 de setembro, amarrado no pescoço (vermelho de maragato ou branco de chimango). */
export function Lenco({ cor, ...p }: Desenho & { cor: string }) {
  return (
    <svg {...svg(p, '0 0 100 50')}>
      <path d="M6 6 C30 16 70 16 94 6 L60 26 L50 46 L40 26 Z" fill={cor} {...s(5)} />
      <path d="M42 20 C46 16 54 16 58 20 L56 28 C52 30 48 30 44 28 Z" fill={cor} {...s(4)} />
    </svg>
  );
}
