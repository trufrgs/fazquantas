import { fullDeck, SUITS } from '@fodinha/engine';
import { Card } from '../components/cards/Card';

/** Galeria de desenvolvimento (`?galeria`): todas as cartas, para revisão visual. */
export function Gallery() {
  const deck = fullDeck();
  return (
    <div className="mesa min-h-full p-4">
      <div className="flex flex-col gap-4">
        {SUITS.map((suit) => (
          <div key={suit} className="flex flex-wrap gap-2">
            {deck
              .filter((c) => c.suit === suit)
              .map((c) => (
                <Card key={c.id} id={c.id} width={84} title={c.id} />
              ))}
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <Card width={84} title="verso" />
          <Card id="E1" width={140} />
          <Card id="P11" width={140} />
          <Card id="O12" width={140} />
          <Card id="C3" width={60} />
          <Card id="E10" width={46} />
          <Card id="P7" width={34} />
        </div>
      </div>
    </div>
  );
}
