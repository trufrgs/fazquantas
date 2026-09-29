import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';

const CREDITS: { what: string; who: string; license: string; url: string }[] = [
  {
    what: 'Cartas: baralho de Heraclio Fournier (1878)',
    who: 'Ilustrações de Ignacio Díaz Olano e Emilio Soubrier; digitalização do Museo Fournier de Naipes de Álava',
    license: 'domínio público',
    url: 'https://commons.wikimedia.org/wiki/Category:Heraclio_Fournier%E2%80%99s_1878_card_deck',
  },
  { what: 'Sons de cartas, de interface e da espada', who: 'Kenney (Casino Audio, Interface Sounds, RPG Audio)', license: 'CC0', url: 'https://kenney.nl' },
  { what: 'Música de vitória (bandoneón)', who: 'Fupi, "Win Jingle"', license: 'CC0', url: 'https://opengameart.org/content/win-jingle' },
  {
    what: 'Tango de fundo: "Tango de Manzana"',
    who: 'Kevin MacLeod (incompetech.com)',
    license: 'CC BY 3.0',
    url: 'https://commons.wikimedia.org/wiki/File:Tango_de_Manzana_(ISRC_USUAN1100404).mp3',
  },
  {
    what: 'Tragada do palheiro (quando alguém demora)',
    who: 'Sintetizada para o jogo',
    license: 'MIT, como o jogo',
    url: 'https://github.com/trufrgs/fazquantas/tree/main/apps/web/public/sounds',
  },
  { what: 'Trompete de eliminação', who: '0new4y, "Game Over Trumpet SFX"', license: 'CC0', url: 'https://opengameart.org/content/game-over-trumpet-sfx' },
  { what: 'Som de palito queimado', who: 'Robin Lamb, "UI Sound Effects"', license: 'CC0', url: 'https://opengameart.org/content/ui-sound-effects-button-clicks-user-feedback-notifications' },
  { what: 'Avatares "Notionists"', who: 'Zoish, via DiceBear', license: 'CC0', url: 'https://www.dicebear.com/styles/notionists/' },
  { what: 'Fontes Fraunces, Figtree e Caveat', who: 'Undercase Type, Erik Kennedy, Impallari Type', license: 'SIL OFL 1.1', url: 'https://fonts.google.com' },
];

const REPO_DONO = 'trufrgs';
const REPO = `https://github.com/${REPO_DONO}/fazquantas`;
const LINK = 'font-semibold text-espadas underline underline-offset-2';

/** Para quem quiser olhar o código, contribuir ou fazer a sua versão. */
const ABERTO: { titulo: string; detalhe: string; url: string }[] = [
  { titulo: 'O código no GitHub', detalhe: 'Tudo: o jogo, o servidor, os testes e a documentação.', url: REPO },
  {
    titulo: 'Relatar um problema ou sugerir uma ideia',
    detalhe: 'Conta o aparelho, o navegador e o que aconteceu; print ajuda.',
    url: `${REPO}/issues/new/choose`,
  },
  { titulo: 'Como contribuir', detalhe: 'Rodar no teu computador, testar e mandar um pull request.', url: `${REPO}/blob/main/CONTRIBUTING.md` },
  {
    titulo: 'Fazer o teu (fork)',
    detalhe: 'Tua cópia no ar, de graça no Cloudflare, publicada sozinha pelo GitHub.',
    url: `${REPO}/blob/main/CONTRIBUTING.md#fazer-o-teu-fork-publicado`,
  },
  { titulo: 'Licença MIT', detalhe: 'Pode usar, mudar e distribuir, mantendo o aviso de autoria.', url: `${REPO}/blob/main/LICENSE` },
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
        <p>
          O Faz quantas? tem código aberto, sob licença MIT: dá para ver como é feito, relatar problema, sugerir ideia, mandar melhoria e
          fazer a tua própria versão. Criado por Thomas Rodrigues (
          <a href={`https://github.com/${REPO_DONO}`} target="_blank" rel="noreferrer" className={LINK}>
            @{REPO_DONO}
          </a>
          ).
        </p>
        <ul className="mt-3 flex flex-col divide-y divide-tinta/10">
          {ABERTO.map((l) => (
            <li key={l.url} className="py-2.5">
              <a href={l.url} target="_blank" rel="noreferrer" className={LINK}>
                {l.titulo}
              </a>
              <span className="block text-sm text-tinta-2">{l.detalhe}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-tinta-2">
          Vai publicar a tua versão para outras pessoas? Usa outro nome e outra marca: "Faz quantas?" e o Gaudério identificam este jogo.
        </p>
        <p className="mt-3 text-sm text-tinta-2">
          Feito com React, Motion, Tailwind CSS, zustand, howler.js, zod, Cloudflare Workers (wrangler), Capacitor, DiceBear e canvas-confetti, sob
          licença MIT/ISC.
        </p>
      </Panel>
      <Panel title="Privacidade">
        <p className="text-sm text-tinta-2">
          Sem conta obrigatória, sem anúncio, sem rastreamento. O que o jogo online guarda, e por quanto tempo:{' '}
          <a href="/privacidade" target="_blank" rel="noreferrer" className="font-semibold text-espadas underline underline-offset-2">
            política de privacidade
          </a>
          .
        </p>
      </Panel>
    </ScreenFrame>
  );
}
