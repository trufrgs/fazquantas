/**
 * Avatares gaúchos desenhados à mão (a turma do Gaudério); os SVGs ficam no web, em
 * `apps/web/public/avatars/g/<slug>.svg`. O servidor usa a lista para os bots.
 * Gerado por `scripts/make-avatares.mjs` a partir de `brand/avatares.js` — edite lá.
 * O id é `g-<slug>`; a ordem é a da escolha no perfil, os mais carismáticos primeiro.
 */
export const GAUCHO_AVATARS: readonly { id: string; label: string }[] = [
  { id: 'g-gauderio', label: 'Gaudério bigodudo' },
  { id: 'g-capivara', label: 'Capivara plena' },
  { id: 'g-vo-do-chinelo', label: 'Vó do chinelo' },
  { id: 'g-cuia', label: 'Cuia matreira' },
  { id: 'g-tche-bagual', label: 'Tchê bagual' },
  { id: 'g-vo-do-chimarrao', label: 'Vó do chimarrão' },
  { id: 'g-cavalo-crioulo', label: 'Cavalo crioulo' },
  { id: 'g-tio-do-churrasco', label: 'Tio do churrasco' },
  { id: 'g-prenda', label: 'Prenda faceira' },
  { id: 'g-graxaim', label: 'Graxaim malandro' },
  { id: 'g-cusco', label: 'Cusco caramelo' },
  { id: 'g-gringo-do-vinho', label: 'Gringo do vinho' },
  { id: 'g-ovelha', label: 'Ovelha de boina' },
  { id: 'g-veio-de-pala', label: 'Véio de pala' },
  { id: 'g-maragato', label: 'Maragato brabo' },
  { id: 'g-chimango', label: 'Chimango desconfiado' },
  { id: 'g-guria-sapeca', label: 'Guria sapeca' },
  { id: 'g-bugio', label: 'Bugio berrador' },
  { id: 'g-ema', label: 'Ema curiosa' },
  { id: 'g-garnise', label: 'Garnisé invocado' },
  { id: 'g-gaiteiro', label: 'Gaiteiro apaixonado' },
  { id: 'g-quero-quero', label: 'Quero-quero fiscal' },
  { id: 'g-pinhao', label: 'Pinhão com frio' },
  { id: 'g-guri-de-bone', label: 'Guri de boné virado' },
  { id: 'g-zorrilho', label: 'Zorrilho perfumado' },
];

/** Um avatar da turma sorteado com o `random` dado (bots e quem chega sem avatar). */
export function randomGauchoAvatar(random: () => number): string {
  return GAUCHO_AVATARS[Math.floor(random() * GAUCHO_AVATARS.length)]?.id ?? 'g-gauderio';
}
