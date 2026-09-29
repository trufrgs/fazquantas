import { Hierarchy } from '../components/table/ForcaChip';
import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';
import { useGame } from '../stores/game';
import { useOnline } from '../stores/online';
import { useSettings } from '../stores/settings';

export function Rules() {
  // Aberto do menu da mesa, vale a regra daquela mesa (a sala pode ter outra que a dos teus ajustes).
  const daMesa = useGame((s) => s.update?.view.rules ?? null);
  const daSala = useOnline((s) => s.room?.rules ?? null);
  const minhas = useSettings((s) => s.rules);
  const rules = daMesa ?? daSala ?? minhas;
  return (
    <ScreenFrame title="Como jogar">
      <Panel title="O objetivo">
        <p>
          A cada rodada, cada um diz quantas mãos vai fazer: o <strong>palpite</strong>. No fim da rodada, quem errou queima{' '}
          {rules.penalty === 'fixed' ? 'um palito, erre por quanto errar' : 'palitos, um pra cada mão de diferença'}. Começa com{' '}
          {rules.startingLives} {rules.startingLives === 1 ? 'palito' : 'palitos'}; quem fica sem palito sai. Ganha quem sobrar.
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
            <strong>Cartas.</strong>{' '}
            {rules.progression === 'down'
              ? 'A primeira rodada dá o máximo de cartas pra cada um, a seguinte uma a menos, e assim até 1. Depois volta pro máximo.'
              : rules.progression === 'upDown'
                ? 'A primeira rodada dá 1 carta pra cada um, a segunda dá 2, e assim até o máximo. Depois desce de volta até 1, e sobe de novo.'
                : 'A primeira rodada dá 1 carta pra cada um, a segunda dá 2, e assim até o máximo. Depois volta pra 1.'}
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
            <strong>Palitos.</strong> Pediu 2 e fez 0? Queima {rules.penalty === 'fixed' ? '1 palito' : '2 palitos'}. Acertou na mosca,
            não perde nada.
          </li>
        </ol>
      </Panel>

      <Panel title={rules.tieRule === 'suit' ? 'Cartas iguais: o naipe desempata' : 'Cartas iguais empardam'}>
        <p>
          {rules.tieRule === 'nobody'
            ? 'Quando as cartas mais fortes da mão são iguais, elas empardam: ninguém leva a mão, e quem começou começa de novo.'
            : rules.tieRule === 'cancel'
              ? 'Quando duas cartas iguais disputam a mão, elas empardam (se anulam) e leva a maior que sobrou. Se todas empardarem, ninguém leva e quem começou a mão começa de novo.'
              : 'Não tem empate: entre cartas iguais, o naipe decide (ouros < espadas < copas < paus).'}
        </p>
      </Panel>

      <Panel title="Carta na testa">
        <p>
          {rules.blindRound === 'off'
            ? 'Nesta regra não tem rodada às cegas: na rodada de 1 carta, cada um vê a sua.'
            : `${rules.blindRound === 'first' ? 'Na primeira rodada de 1 carta da partida' : 'Nas rodadas de 1 carta'}, tu vê a carta de todo mundo, menos a tua. Palpita lendo a mesa (e o palpite de quem já viu a tua carta).${
                rules.dealerRestriction && !rules.dealerRestrictionInBlind ? ' Nessas rodadas a regra do pé não vale.' : ''
              }`}
        </p>
      </Panel>

      <Panel title="Na tela">
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Toca numa carta pra escolher e toca de novo pra jogar, ou arrasta pra cima.</li>
          <li>A estrela marca as manilhas entre as tuas cartas.</li>
          <li>O selo 1/2 mostra mãos feitas e palpite: verde tá certinho, vermelho já errou.</li>
          <li>Ligando “Sugerir palpite e carta” nos ajustes, a lâmpada mostra o que o jogo faria.</li>
          <li>A força de todas as cartas (quem mata quem) fica no menu da mesa. Na regra com vira, o chip no canto mostra as manilhas.</li>
          <li>A caderneta, lá em cima, anota quanto cada um pediu e fez em cada rodada (✓ é na mosca).</li>
        </ul>
      </Panel>
    </ScreenFrame>
  );
}
