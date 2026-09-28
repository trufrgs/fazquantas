/**
 * Sprite SVG com naipes, figuras e verso — renderizado uma vez na raiz e referenciado por `<use>`.
 * Não usar `display: none` aqui: gradientes dentro de SVG escondido assim somem no Chrome/Firefox.
 *
 * Figuras: ícones de game-icons.net (CC BY 3.0) — coroa de Lorc; cavalo e chapéu de Delapouite.
 */

const CROWN =
  'm408.256 119.46-37.7 52.165 19.57 44.426 34.8-37.214-16.67-59.375zm86.074 12.513L384.44 249.498 334.01 135.02l-75.162 132.947-86.948-131.78-33.334 114.122L17.922 132.83l39.3 127.6c1.945-.348 3.94-.54 5.98-.54 18.812 0 34.26 15.452 34.26 34.262 0 13.823-8.346 25.822-20.235 31.22l5.337 17.33c12.425 25.466 71.863 45.152 176.582 47.206 110.805 2.174 178.12-17.54 189.854-47.207h-.002l4.357-20.26c-16.836-2.114-30.02-16.612-30.02-33.986 0-18.81 15.45-34.262 34.263-34.262 3.513 0 6.91.54 10.11 1.54l26.622-123.762zm-391.77 2.04 1.22 56.337 25.56 24.89 9.592-32.842-36.37-48.386zm150.585 2.91-24.483 51.36 28.955 43.885 24.922-44.08-29.395-51.166zm204.453 135.962c-8.712 0-15.575 6.862-15.575 15.572 0 8.71 6.863 15.574 15.575 15.574s15.572-6.863 15.572-15.573-6.86-15.572-15.572-15.572zM63.2 278.58c-8.71 0-15.573 6.864-15.573 15.574s6.862 15.573 15.574 15.573c8.713 0 15.573-6.862 15.573-15.573 0-8.71-6.86-15.574-15.572-15.574zm130.33 17.842c18.812 0 34.26 15.45 34.26 34.262 0 18.81-15.448 34.26-34.26 34.26-18.813 0-34.262-15.45-34.262-34.26s15.45-34.262 34.26-34.262zm131.234 0c18.812 0 34.26 15.45 34.26 34.262 0 18.81-15.448 34.26-34.26 34.26-18.813 0-34.262-15.45-34.262-34.26s15.45-34.262 34.262-34.262zm-131.235 18.69c-8.713 0-15.573 6.86-15.573 15.572 0 8.71 6.86 15.574 15.572 15.574 8.71 0 15.572-6.864 15.572-15.574s-6.86-15.573-15.573-15.573zm131.234 0c-8.712 0-15.573 6.86-15.573 15.572 0 8.71 6.862 15.574 15.574 15.574s15.574-6.864 15.574-15.574-6.862-15.573-15.574-15.573z';

const HORSE =
  'M400 16c-21.335 9.73-58.244 17.34-73.086 48.232-22.36 1.948-72.753 10.673-122.22 40.25-58.098 34.74-116.017 97.417-131.776 213.702l-.48 3.537-2.774 2.25c-30.87 25.002-40.657 38.937-44.416 61.153-3.536 20.9-.72 51.46-.363 101.877H328.36c3.455-16.892 10.44-29.245 12.472-41.568 2.337-14.176.19-29.938-20.812-58.547-43.078-58.683-46.853-129.458-12.916-171.28-8.654-2.765-15.09-6.887-19.458-12.546-6.115-7.924-7.4-17.006-8.57-25.884l17.848-2.352c1.112 8.446 2.38 13.88 4.97 17.237 2.59 3.356 7.31 6.472 19.55 8.46l-.022.128.172-.17 5.998 9.424c19.957 31.358 42.84 51.292 73.332 54.44l6.51.672 1.367 6.4c2.74 12.828 8.626 19.095 15.116 22.238 6.49 3.143 14.225 2.944 20.47.205 9.316-4.086 14.518-11.35 16.7-22.712 2.122-11.05.546-25.834-5.137-42.106-33.538-38.248-44.475-87.277-63.903-128.772-6.055-9.947-12.448-18.518-20.385-24.856C376.808 55.126 386.456 34.852 400 16zM214.068 34.97C179.55 35.06 146.075 43.06 96 58.58c31.146 9.92 70.397 18.9 86.037 39.01 4.463-3.017 8.94-5.88 13.418-8.56 40.51-24.22 80.387-35.286 108.23-40.04-35.854-9.477-63.047-14.094-89.617-14.023zM157.16 96.712c-1.13-.01-2.265-.01-3.402.004-30.353.37-63.1 9.745-96.647 31.283 27.186 3.672 54.67 3.724 72.58 15.398 15.9-17.92 33.144-32.634 50.677-44.668a151.904 151.904 0 0 0-23.207-2.017zM368 128a13.214 13.215 0 0 1 13.213 13.215A13.214 13.215 0 0 1 368 154.432a13.214 13.215 0 0 1-13.213-13.217A13.214 13.215 0 0 1 368 128zm-238.906 16.068c-36.395 1.495-68.903 6.53-104.76 24.766 33.236 7.095 50.913 13.507 65.025 33.83 11.522-22.53 25.045-41.93 39.734-58.596zM74.518 201.46C53.53 201.65 36.614 213.14 16 224c27.854 0 46.067 3.862 58.71 12.055 4.33-11.652 9.16-22.615 14.41-32.924-5.12-1.19-9.963-1.71-14.602-1.67zm-.623 36.82c-17.933 5.845-35.452 7.15-54.23 22.284 17.62 4.638 34.79 9.596 41.398 22.034 3.496-15.77 7.814-30.523 12.832-44.32zm370.142 8.57a42.449 42.449 0 0 1 4.783.187l-1.64 17.926c-3.928-.36-5.513.416-5.57.465-.058.048-1.035.656-.635 5.886l-17.95 1.372c-.638-8.35 1.297-16.207 6.955-20.997 4.245-3.593 9.206-4.735 14.057-4.84zM52.215 290.723c-10.352.13-23.76 5.646-34.656 12.334 12.173 6.83 12.357 23.472 8.938 37.668 7.3-9.105 16.855-18.323 29.158-28.48 1.016-7.043 2.19-13.9 3.506-20.585-2.082-.67-4.42-.97-6.947-.937z';

const HAT =
  'M479.748 54.52c-3.247.052-8.496 1.107-16.535 4.175-38.124 14.552-81.353 54.73-108.15 102.532-21.36 38.1-32.264 80.38-24.58 118.46 31.922-79.072 53.33-134.06 120.095-202.58l6.28-6.447 12.894 12.563-6.28 6.445c-66.477 68.224-85.57 120.75-118.79 202.922l28.898-19.266c1.446-2.054 31.707-45.064 61.922-92.43 15.47-24.255 30.696-49.33 41.455-69.707 5.38-10.188 9.64-19.23 12.207-26.132 2.57-6.9 2.526-12.237 2.838-11.098l-.023-.088-.023-.09c-3.218-12.73-6.556-17.57-8.64-18.665-.522-.274-1.272-.48-2.297-.56a13.42 13.42 0 0 0-1.272-.035zM285.166 171.604c-46.497 19.48-85.4 67.53-125.963 122.62-34.715 47.15-70.717 99.035-115.605 140.862 63.072-22.56 133.71-45.586 194.03-67.822 24.73-9.118 47.717-18.105 67.66-26.823l2.444-5.7c4.238-9.888 8.137-19.27 11.91-28.44-12.014-29.86-12.136-62.28-4.413-93.86-5.04-9.554-9.87-18.16-14.44-24.98-3.872-5.773-7.586-10.252-10.65-12.913-2.297-1.993-3.82-2.65-4.974-2.943zm-152.143 127.89c-19.718 7.986-37.81 17.73-51.03 29.512-25.002 22.282-40.403 59.83-51.815 94.012 38.65-35.812 71.293-80.407 102.845-123.524zm231.08 1.78-27.107 18.072-4.492 2.994c-.93 2.232-1.88 4.5-2.836 6.775 16.537-8.255 29.662-16.335 37.842-23.234a182.47 182.47 0 0 1-3.406-4.607zm15.274 18.27c-11.21 9.74-27.214 18.788-46.977 28.292-24.655 11.857-55.104 23.987-88.548 36.316-50.326 18.552-107.424 37.533-161.155 56.235 37.62-3.482 83.504-10.964 128.188-22.75 39.996-10.55 79.145-24.41 110.832-41.276 28.665-15.255 50.853-33.042 62.726-52.057-1.72-1.505-3.407-3.1-5.066-4.76z';

export function CardSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <linearGradient id="g-ouro" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe28e" />
          <stop offset="0.55" stopColor="#e3a82b" />
          <stop offset="1" stopColor="#b47a18" />
        </linearGradient>
        <linearGradient id="g-copas" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e65a4f" />
          <stop offset="0.6" stopColor="#c4372d" />
          <stop offset="1" stopColor="#962219" />
        </linearGradient>
        <linearGradient id="g-lamina" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8fb4e6" />
          <stop offset="0.5" stopColor="#3a6cb0" />
          <stop offset="1" stopColor="#1f4579" />
        </linearGradient>
        <linearGradient id="g-paus" x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="#6db364" />
          <stop offset="0.55" stopColor="#3d7a3a" />
          <stop offset="1" stopColor="#285426" />
        </linearGradient>
        <linearGradient id="g-madeira" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c48d4c" />
          <stop offset="0.5" stopColor="#95622f" />
          <stop offset="1" stopColor="#62391a" />
        </linearGradient>
        <linearGradient id="palito" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f6dcac" />
          <stop offset="1" stopColor="#c99a5c" />
        </linearGradient>
        <radialGradient id="chama" cx="0.5" cy="0.7" r="0.6">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="0.45" stopColor="#ffb534" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="g-papel" cx="0.35" cy="0.25" r="0.9">
          <stop offset="0" stopColor="#fffbf1" />
          <stop offset="1" stopColor="#f1e6cd" />
        </radialGradient>
        <pattern
          id="p-losango"
          width="9"
          height="9"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="9" height="9" fill="#962a22" />
          <path d="M0 0H9M0 0V9" stroke="#d0685a" strokeWidth="1.3" />
          <circle cx="4.5" cy="4.5" r="0.9" fill="#e8b96a" />
        </pattern>

        {/* Ouros: moeda com estrela de oito pontas */}
        <symbol id="suit-O" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="url(#g-ouro)" stroke="#7a4f0c" strokeWidth="4" />
          <circle cx="50" cy="50" r="34" fill="none" stroke="#9c6a14" strokeWidth="3" />
          <path
            d="M50 22 L54.6 38.9 L69.8 30.2 L61.1 45.4 L78 50 L61.1 54.6 L69.8 69.8 L54.6 61.1 L50 78 L45.4 61.1 L30.2 69.8 L38.9 54.6 L22 50 L38.9 45.4 L30.2 30.2 L45.4 38.9 Z"
            fill="#fde7a8"
            stroke="#7a4f0c"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="50" r="7" fill="#c4372d" stroke="#7a4f0c" strokeWidth="2" />
          <path
            d="M20 36 A32 32 0 0 1 36 19"
            fill="none"
            stroke="#fff4cf"
            strokeWidth="3.4"
            strokeLinecap="round"
            opacity="0.75"
          />
        </symbol>

        {/* Copas: cálice vermelho com dourado */}
        <symbol id="suit-C" viewBox="0 0 100 100">
          <path
            d="M18 16 H82 C82 44 69 57 50 59 C31 57 18 44 18 16 Z"
            fill="url(#g-copas)"
            stroke="#6b1510"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
          <path
            d="M24 29 C37 35 63 35 76 29"
            fill="none"
            stroke="#f3c85e"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <circle cx="50" cy="43" r="5" fill="#f3c85e" stroke="#7a4f0c" strokeWidth="1.8" />
          <path
            d="M27 22 C28 33 32 42 39 48"
            fill="none"
            stroke="#ffc0b5"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.55"
          />
          <rect x="13" y="9" width="74" height="10" rx="5" fill="url(#g-ouro)" stroke="#7a4f0c" strokeWidth="3" />
          <path
            d="M44 58 H56 L54 76 H46 Z"
            fill="url(#g-ouro)"
            stroke="#7a4f0c"
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
          <ellipse cx="50" cy="67" rx="9" ry="4.6" fill="url(#g-ouro)" stroke="#7a4f0c" strokeWidth="2.4" />
          <path
            d="M27 92 C27 83 38 76 50 76 C62 76 73 83 73 92 Z"
            fill="url(#g-ouro)"
            stroke="#7a4f0c"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </symbol>

        {/* Espadas: lâmina azul, guarda e pomo dourados */}
        <symbol id="suit-E" viewBox="0 0 100 100">
          <path
            d="M50 3 L58.5 15 V62 H41.5 V15 Z"
            fill="url(#g-lamina)"
            stroke="#1b3560"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M50 10 V58" stroke="#e1ecfa" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
          <rect x="21" y="59" width="58" height="10" rx="5" fill="url(#g-ouro)" stroke="#7a4f0c" strokeWidth="2.6" />
          <rect x="44.5" y="69" width="11" height="17" rx="2" fill="#6d3f1d" stroke="#3b200c" strokeWidth="2.2" />
          <path d="M44.5 74 H55.5 M44.5 79 H55.5" stroke="#3b200c" strokeWidth="1.6" />
          <circle cx="50" cy="91" r="6.5" fill="url(#g-ouro)" stroke="#7a4f0c" strokeWidth="2.4" />
        </symbol>

        {/* Paus (bastos): porrete de madeira com galhos cortados e faixa verde */}
        <symbol id="suit-P" viewBox="0 0 100 100">
          <g transform="rotate(-12 50 50)">
            <path d="M37 36 L26 30" stroke="#3f230d" strokeWidth="9.5" strokeLinecap="round" />
            <path d="M37 36 L26 30" stroke="url(#g-madeira)" strokeWidth="5.5" strokeLinecap="round" />
            <ellipse cx="25.6" cy="29.8" rx="3.4" ry="3.1" fill="#f0cf93" stroke="#3f230d" strokeWidth="1.7" />
            <path d="M63 60 L74 55" stroke="#3f230d" strokeWidth="9" strokeLinecap="round" />
            <path d="M63 60 L74 55" stroke="url(#g-madeira)" strokeWidth="5" strokeLinecap="round" />
            <ellipse cx="74.3" cy="54.9" rx="3.2" ry="2.9" fill="#f0cf93" stroke="#3f230d" strokeWidth="1.7" />
            <path
              d="M43 96 C41 79 34 53 34 33 C34 15 42 5 52 5 C62 5 68 14 67 28 C66 47 60 73 57 96 Z"
              fill="url(#g-madeira)"
              stroke="#3f230d"
              strokeWidth="3.2"
              strokeLinejoin="round"
            />
            <path
              d="M45 13 C41.5 29 42 49 46 70"
              fill="none"
              stroke="#d7a868"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.75"
            />
            <path
              d="M58 18 C59 35 57 52 53.5 66"
              fill="none"
              stroke="#4f2e12"
              strokeWidth="1.8"
              strokeLinecap="round"
              opacity="0.55"
            />
            <ellipse cx="51.5" cy="24" rx="4.2" ry="2.8" fill="#4f2e12" />
            <ellipse cx="47" cy="50" rx="3.4" ry="2.3" fill="#4f2e12" />
            <path d="M42.2 83.5 H58.3" stroke="#3d7a3a" strokeWidth="7" />
            <path d="M42.4 88.6 H58" stroke="#c4372d" strokeWidth="2.2" />
          </g>
        </symbol>

        <symbol id="fig-10" viewBox="0 0 512 512">
          <path d={HAT} fill="currentColor" />
        </symbol>
        <symbol id="fig-11" viewBox="0 0 512 512">
          <path d={HORSE} fill="currentColor" />
        </symbol>
        <symbol id="fig-12" viewBox="0 0 512 512">
          <path d={CROWN} fill="currentColor" />
        </symbol>

        {/* Verso: bordô com treliça e medalhão com os quatro naipes */}
        <symbol id="card-back" viewBox="0 0 100 150">
          <rect x="0.5" y="0.5" width="99" height="149" rx="7" fill="#7f231c" stroke="#5a1611" />
          <rect x="5" y="5" width="90" height="140" rx="4.5" fill="url(#p-losango)" />
          <rect x="5" y="5" width="90" height="140" rx="4.5" fill="none" stroke="#f0d9a8" strokeWidth="1.6" />
          <rect x="8.5" y="8.5" width="83" height="133" rx="3" fill="none" stroke="#f0d9a8" strokeWidth="0.6" opacity="0.7" />
          <circle cx="50" cy="75" r="21" fill="#f7efde" stroke="#f0d9a8" strokeWidth="2" />
          <circle cx="50" cy="75" r="17.5" fill="none" stroke="#7f231c" strokeWidth="0.9" />
          <use href="#suit-O" x="36.5" y="61.5" width="12" height="12" />
          <use href="#suit-C" x="51.5" y="61.5" width="12" height="12" />
          <use href="#suit-E" x="36.5" y="76.5" width="12" height="12" />
          <use href="#suit-P" x="51.5" y="76.5" width="12" height="12" />
        </symbol>
      </defs>
    </svg>
  );
}
