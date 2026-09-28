import { Hierarchy } from '../components/table/ForcaChip';
import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';
import { useSettings } from '../stores/settings';

export function Rules() {
  const rules = useSettings((s) => s.rules);
  return (
    <ScreenFrame title="Como jogar">
      <Panel title="O objetivo">
        <p>
          A cada rodada, cada um diz quantas vazas vai fazer: o <strong>palpite</strong>. No fim da rodada, quem errou queima
          palitos, um para cada vaza de diferença. Quem fica sem palitos sai. Vence quem sobrar.
        </p>
      </Panel>

      <Panel title="A força das cartas">
        <p className="mb-3">
          Baralho espanhol de 40 cartas, sem 8 e 9. Não precisa seguir naipe: a carta mais forte leva a vaza.
          {rules.hierarchy === 'gaucha' && ' Na regra gaúcha, espadão, bastião, 7 de espadas e 7 de ouros são as manilhas fixas.'}
          {rules.hierarchy === 'mineira' && ' Na regra mineira, 4 de paus, 7 de copas, ás de espadas e 7 de ouros são as manilhas fixas.'}
        </p>
        {rules.hierarchy === 'vira' ? (
          <p className="text-tinta-2">
            Com vira: depois de dar as cartas, uma carta é virada na mesa. As quatro cartas do valor seguinte são as manilhas
            (7 → sota, rei → ás, 3 → 4) e vencem tudo, na ordem paus, copas, espadas, ouros. As demais, da mais fraca para a mais
            forte: 4, 5, 6, 7, sota, cavalo, rei, ás, 2, 3.
          </p>
        ) : (
          <Hierarchy mode={rules.hierarchy} vira={null} />
        )}
      </Panel>

      <Panel title="A rodada">
        <ol className="flex list-decimal flex-col gap-2 pl-5 marker:font-display marker:font-bold">
          <li>
            <strong>Cartas.</strong> A primeira rodada dá 1 carta para cada um, a segunda dá 2, e assim até o máximo. Depois volta
            a 1.
          </li>
          <li>
            <strong>Palpites.</strong> Começa quem está à direita de quem deu as cartas. Quem deu é o <strong>pé</strong> e
            palpita por último: ele não pode dar o número que faria a soma dos palpites bater com o número de cartas. Assim,
            sempre alguém erra.
          </li>
          <li>
            <strong>Vazas.</strong> Quem palpitou primeiro começa. A carta mais forte leva, e quem leva começa a próxima.
          </li>
          <li>
            <strong>Palitos.</strong> Pediu 2 e fez 0? Queima 2 palitos. Acertou na mosca, não perde nada.
          </li>
        </ol>
      </Panel>

      <Panel title="Cartas iguais melam">
        <p>
          Quando duas cartas iguais disputam a vaza, elas se anulam e vence a maior que sobrou. Se todas melarem, ninguém leva e
          quem começou a vaza começa de novo.
        </p>
      </Panel>

      <Panel title="Carta na testa">
        <p>
          Nas rodadas de 1 carta você vê a carta de todo mundo, menos a sua. Palpite lendo a mesa (e o palpite de quem já viu a
          sua carta). Nessas rodadas a regra do pé não vale.
        </p>
      </Panel>

      <Panel title="Na tela">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Toque numa carta para escolher e toque de novo para jogar, ou arraste para cima.</li>
          <li>A estrela marca as manilhas da sua mão.</li>
          <li>O selo 1/2 mostra vazas feitas e palpite: verde é certinho, vermelho já errou.</li>
          <li>A lâmpada é uma dica do jogo. Dá para desligar nos ajustes.</li>
          <li>O chip no canto da mesa mostra as manilhas. Toque nele para ver a força de todas as cartas.</li>
          <li>A caderneta, no canto de cima, guarda os palpites de todas as rodadas.</li>
        </ul>
      </Panel>
    </ScreenFrame>
  );
}
