import { savedGameSummary } from '../../lib/local-connection';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';

/** Pergunta antes de começar outra partida por cima da que tá salva. */
export function ConfirmNewGame({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet open={open} onClose={onCancel} label="Começar outra partida">
      <p className="pr-10 text-lg font-semibold">Começar outra partida?</p>
      <p className="mt-1 text-tinta-2">A partida que tá salva ({savedGameSummary()}) se perde.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={onCancel}>Deixa quieto</Button>
        <Button variant="copas" onClick={onConfirm}>
          Começar outra
        </Button>
      </div>
    </Sheet>
  );
}
