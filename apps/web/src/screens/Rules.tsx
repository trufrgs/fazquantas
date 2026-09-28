import { Hierarchy } from '../components/table/ForcaChip';
import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';
import { useSettings } from '../stores/settings';

export function Rules() {
  const rules = useSettings((s) => s.rules);
  return (
    <ScreenFrame title="Como jogar">
      <Panel title="O objetivo">
        <p>
          A cada rodada, cada um diz quantas mãos vai fazer: o <strong>palpite</strong>. No fim da rodada, quem errou queima
          palitos, um pra cada mão de diferença. Quem fica sem palito sai. Ganha quem sobrar.
        </p>
      </Panel>

      <Panel title="A força das cartas">
        <p className="mb-3">
          Baralho espanhol de 40 cartas, sem 8 e 9. Não precisa seguir naipe: a carta mais forte leva a mão.
          {rules.hierarchy === 'gaucha' && ' Na regra gaúcha, espadão, bastião, 7 de espadas e 7 de ouros são as manilhas fixas.'}
          {rules.hierarchy === 'mineira' && ' Na regra mineira, 4 de paus, 7 de copas, ás de espadas e 7 de ouros são as manilhas fixas.'}
        </p>
        {rules.hierarchy === 'vira' ? (
          <p className="text-tinta-2">
            Com vira: depois de dar as cartas, uma carta é virada na mesa. As quatro do valor seguinte são as manilhas (7 → sota,
            rei → ás, 3 → 4) e ganham de todas, na ordem paus, copas, espadas, ouros. As outras, da mais fraca pra mais forte: 4,
            5, 6, 7, sota, cavalo, rei, ás, 2, 3.
          </p>
        ) : (
          <Hierarchy mode={rules.hierarchy} vira={null} />
        )}
      </Panel>

      <Panel title="A rodada">
        <ol className="flex list-decimal flex-col gap-2 pl-5 marker:font-display marker:font-bold">
          <li>
            <strong>Cartas.</strong> A primeira rodada dá 1 carta pra cada um, a segunda dá 2, e assim até o máximo. Depois volta
            pra 1.
          </li>
          <li>
            <strong>Palpites.</strong> Começa quem tá à direita de quem deu as cartas. Quem deu é o <strong>pé</strong> e
            palpita por último: não pode pedir o número que faz a soma dos palpites bater com o número de cartas. Assim, sempre
            alguém erra.
          </li>
          <li>
            <strong>Mãos.</strong> Quem palpitou primeiro começa. A carta mais forte leva a mão, e quem leva começa a próxima.
          </li>
          <li>
            <strong>Palitos.</strong> Pediu 2 e fez 0? Queima 2 palitos. Acertou na mosca, não perde nada.
          </li>
        </ol>
      </Panel>

      <Panel title="Cartas iguais empardam">
        <p>
          Quando duas cartas iguais disputam a mão, elas empardam (se anulam) e leva a maior que sobrou. Se todas empardarem,
          ninguém leva e quem começou a mão começa de novo.
        </p>
      </Panel>

      <Panel title="Carta na testa">
        <p>
          Nas rodadas de 1 carta, tu vê a carta de todo mundo, menos a tua. Palpita lendo a mesa (e o palpite de quem já viu a
          tua carta). Nessas rodadas a regra do pé não vale.
        </p>
      </Panel>

      <Panel title="Na tela">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Toca numa carta pra escolher e toca de novo pra jogar, ou arrasta pra cima.</li>
          <li>A estrela marca as manilhas entre as tuas cartas.</li>
          <li>O selo 1/2 mostra mãos feitas e palpite: verde tá certinho, vermelho já errou.</li>
          <li>A lâmpada é uma dica do jogo. Dá pra desligar nos ajustes.</li>
          <li>O chip no canto da mesa mostra as manilhas. Toca nele pra ver a força de todas as cartas.</li>
          <li>A caderneta, lá em cima, guarda os palpites de todas as rodadas.</li>
        </ul>
      </Panel>
    </ScreenFrame>
  );
}
