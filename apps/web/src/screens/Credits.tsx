import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';

const CREDITS: { what: string; who: string; license: string; url: string }[] = [
  {
    what: 'Cartas: baralho de Heraclio Fournier (1878)',
    who: 'Ilustrações de Ignacio Díaz Olano e Emilio Soubrier; digitalização do Museo Fournier de Naipes de Álava',
    license: 'domínio público',
    url: 'https://commons.wikimedia.org/wiki/Category:Heraclio_Fournier%E2%80%99s_1878_card_deck',
  },
  { what: 'Sons de cartas e de interface', who: 'Kenney (Casino Audio, Interface Sounds)', license: 'CC0', url: 'https://kenney.nl' },
  { what: 'Música de vitória (bandoneón)', who: 'Fupi, "Win Jingle"', license: 'CC0', url: 'https://opengameart.org/content/win-jingle' },
  { what: 'Trompete de eliminação', who: '0new4y, "Game Over Trumpet SFX"', license: 'CC0', url: 'https://opengameart.org/content/game-over-trumpet-sfx' },
  { what: 'Som de palito queimado', who: 'Robin Lamb, "UI Sound Effects"', license: 'CC0', url: 'https://opengameart.org/content/ui-sound-effects-button-clicks-user-feedback-notifications' },
  { what: 'Avatares "Notionists"', who: 'Zoish, via DiceBear', license: 'CC0', url: 'https://www.dicebear.com/styles/notionists/' },
  { what: 'Fontes Fraunces, Figtree e Caveat', who: 'Undercase Type, Erik Kennedy, Impallari Type', license: 'SIL OFL 1.1', url: 'https://fonts.google.com' },
];

export function Credits() {
  return (
    <ScreenFrame title="Créditos">
      <Panel>
        <p>
          As cartas são o baralho espanhol que a Heraclio Fournier imprimiu em 1878, premiado na Exposição de Paris daquele ano,
          com o papel limpo para a tela. Mesa, verso e interface foram desenhados para este jogo.
        </p>
      </Panel>
      <Panel title="Recursos de terceiros">
        <ul className="flex flex-col divide-y divide-tinta/10">
          {CREDITS.map((c) => (
            <li key={c.what} className="py-2.5">
              <span className="block font-semibold">{c.what}</span>
              <span className="text-sm text-tinta-2">
                {c.who} · {c.license} ·{' '}
                <a href={c.url} target="_blank" rel="noreferrer" className="font-semibold text-espadas underline underline-offset-2">
                  fonte
                </a>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Código aberto">
        <p className="text-sm text-tinta-2">
          React, Motion, Tailwind CSS, zustand, howler.js, zod, Cloudflare Workers (wrangler), Capacitor, DiceBear e canvas-confetti, sob licença MIT/ISC.
        </p>
      </Panel>
      <Panel title="Privacidade">
        <p className="text-sm text-tinta-2">
          Sem conta, sem anúncio, sem rastreamento. O que o jogo online guarda, e por quanto tempo:{' '}
          <a href="/privacidade.html" target="_blank" rel="noreferrer" className="font-semibold text-espadas underline underline-offset-2">
            política de privacidade
          </a>
          .
        </p>
      </Panel>
    </ScreenFrame>
  );
}
