import { BookOpen, DoorOpen, Layers, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { SPEED_MULTIPLIER, useSettings, type Speed } from '../../stores/settings';
import { Button } from '../ui/Button';
import { Segmented, Toggle } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';

export interface PauseMenuProps {
  open: boolean;
  online: boolean;
  onClose: () => void;
  onRules: () => void;
  onHierarchy: () => void;
  onRestart?: () => void;
  onExit: () => void;
  onSpeed?: (multiplier: number) => void;
}

export function PauseMenu(p: PauseMenuProps) {
  const s = useSettings();
  const [confirm, setConfirm] = useState<'exit' | 'restart' | null>(null);
  return (
    <Sheet open={p.open} onClose={p.onClose} label="Menu da partida">
      <h2 className="font-display text-2xl font-bold" style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
        {p.online ? 'Menu' : 'Pausa'}
      </h2>
      {confirm ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-base">
            {confirm === 'exit'
              ? p.online
                ? 'Sair da sala? Um bot assume o seu lugar até o fim da partida.'
                : 'Sair para o início? A partida fica salva e você continua depois.'
              : 'Começar uma partida nova com as mesmas regras? A atual será perdida.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button variant="copas" onClick={confirm === 'exit' ? p.onExit : p.onRestart}>
              {confirm === 'exit' ? 'Sair' : 'Recomeçar'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="ouro" size="lg" icon={<Play size={20} />} onClick={p.onClose}>
            Continuar
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button icon={<Layers size={18} />} onClick={p.onHierarchy}>
              Força das cartas
            </Button>
            <Button icon={<BookOpen size={18} />} onClick={p.onRules}>
              Como jogar
            </Button>
          </div>
          <div className="mt-2 divide-y divide-tinta/10 rounded-2xl bg-tinta/5 px-4">
            <Toggle checked={s.sound} onChange={(sound) => s.set({ sound })} label="Som" />
            <Toggle checked={s.hints} onChange={(hints) => s.set({ hints })} label="Dicas" description="Sugere palpite e carta na sua vez." />
            {!p.online && (
              <div className="py-3">
                <span className="mb-2 block font-semibold">Velocidade dos bots</span>
                <Segmented<Speed>
                  label="Velocidade"
                  value={s.speed}
                  onChange={(speed) => {
                    s.set({ speed });
                    p.onSpeed?.(SPEED_MULTIPLIER[speed]);
                  }}
                  options={[
                    { value: 'normal', label: 'Normal' },
                    { value: 'rapida', label: 'Rápida' },
                    { value: 'turbo', label: 'Turbo' },
                  ]}
                />
              </div>
            )}
          </div>
          <div className={`mt-2 grid gap-2 ${p.onRestart ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {p.onRestart && (
              <Button icon={<RotateCcw size={18} />} onClick={() => setConfirm('restart')}>
                Recomeçar
              </Button>
            )}
            <Button icon={<DoorOpen size={18} />} onClick={() => setConfirm('exit')}>
              {p.online ? 'Sair da sala' : 'Sair'}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
