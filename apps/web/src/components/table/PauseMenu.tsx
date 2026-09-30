import { BookOpen, Clock, DoorOpen, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { PACES, type HierarchyMode, type Pace } from '@fodinha/engine';
import { SPEED_MULTIPLIER, useSettings, type Speed } from '../../stores/settings';
import { Button } from '../ui/Button';
import { Segmented, Toggle } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';
import { useTemConversa } from '../ui/Midia';
import { midia, useMidia } from '../../lib/midia';
import { IconeForca } from './ForcaChip';

export interface PauseMenuProps {
  open: boolean;
  online: boolean;
  onClose: () => void;
  onRules: () => void;
  onHierarchy: () => void;
  /** Regra da força das cartas (o ícone mostra as manilhas dela). */
  hierarchy: HierarchyMode;
  onRestart?: () => void;
  onExit: () => void;
  /** Sala assíncrona: larga a mesa sem sair (o lugar fica, o aviso chama na vez). */
  onPark?: () => void;
  onSpeed?: (multiplier: number) => void;
  /** Online, anfitrião: ritmo da mesa (vale para todos). */
  pace?: Pace;
  onPace?: (pace: Pace) => void;
}

export function PauseMenu(p: PauseMenuProps) {
  const s = useSettings();
  const aberto = useMidia();
  const conversaPossivel = useTemConversa() && p.online;
  const [confirm, setConfirm] = useState<'exit' | 'restart' | null>(null);
  // Cada abertura começa no menu principal. Ajusta no render (e não remontando a folha) para a
  // animação de saída continuar mostrando o que estava na tela.
  const [wasOpen, setWasOpen] = useState(p.open);
  if (p.open !== wasOpen) {
    setWasOpen(p.open);
    if (p.open) setConfirm(null);
  }
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
                ? p.onPark
                  ? 'Sair de vez? Um bot assume teu lugar até o fim da partida. Pra só largar a mesa, usa "Voltar depois".'
                  : 'Sair da sala? Um bot assume teu lugar até o fim da partida.'
                : 'Sair pro início? A partida fica salva e tu continua depois.'
              : 'Começar outra partida com as mesmas regras? Essa aqui se perde.'}
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
            {/* A consulta que ficava num selo na mesa: com as cartas no ícone, fica claro o que é. */}
            <Button icon={<IconeForca mode={p.hierarchy} />} onClick={p.onHierarchy} aria-label="Força das cartas: quem mata quem">
              Força das cartas
            </Button>
            <Button icon={<BookOpen size={18} />} onClick={p.onRules}>
              Como jogar
            </Button>
          </div>
          <div className="mt-2 divide-y divide-tinta/10 rounded-2xl bg-tinta/5 px-4">
            <Toggle checked={s.sound} onChange={(sound) => s.set({ sound })} label="Efeitos" description="Cartas, golpes e avisos." />
            <Toggle checked={s.musica} onChange={(musica) => s.set({ musica })} label="Música" description="O tango de fundo." />
            {conversaPossivel && (
              <>
                <Toggle
                  checked={aberto.mic}
                  onChange={() => void midia.alternarMic()}
                  label="Microfone"
                  description="A sala toda te ouve. O botão no alto da mesa abre e fecha na hora."
                />
                <Toggle
                  checked={aberto.camera}
                  onChange={() => void midia.alternarCamera()}
                  label="Câmera"
                  description="Teu rosto aparece no lugar do avatar para a sala toda."
                />
                <Toggle
                  checked={s.ouvirConversa}
                  onChange={(ouvirConversa) => s.set({ ouvirConversa })}
                  label="Ouvir a conversa"
                  description="O microfone de quem abriu. Desligado, tu segue vendo as câmeras."
                />
              </>
            )}
            <Toggle checked={s.hints} onChange={(hints) => s.set({ hints })} label="Sugerir palpite e carta" description="Na tua vez, marca o palpite e a carta que o jogo faria. Vem desligado." />
            <Toggle checked={s.resumoDaRodada} onChange={(resumoDaRodada) => s.set({ resumoDaRodada })} label="Resumo da rodada" description="No fim de cada rodada, quem cantou, quem fez e quem queimou palito." />
            {!p.online && (
              <div className="py-3">
                <span className="mb-2 block font-semibold">Ritmo do jogo</span>
                <Segmented<Speed>
                  label="Velocidade"
                  value={s.speed}
                  onChange={(speed) => {
                    s.set({ speed });
                    p.onSpeed?.(SPEED_MULTIPLIER[speed]);
                  }}
                  options={[
                    { value: 'calma', label: 'Calma' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'rapida', label: 'Rápida' },
                    { value: 'turbo', label: 'Turbo' },
                  ]}
                />
              </div>
            )}
            {p.online && p.pace && p.onPace && (
              <div className="py-3">
                <span className="mb-2 block font-semibold">Ritmo da mesa</span>
                <Segmented<Pace>
                  label="Ritmo da mesa"
                  value={p.pace}
                  onChange={p.onPace}
                  options={PACES.map((x) => ({ value: x.id, label: x.label }))}
                />
              </div>
            )}
          </div>
          <div className={`mt-2 grid gap-2 ${p.onRestart || p.onPark ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {p.onRestart && (
              <Button icon={<RotateCcw size={18} />} onClick={() => setConfirm('restart')}>
                Recomeçar
              </Button>
            )}
            {p.onPark && (
              <Button variant="ouro" icon={<Clock size={18} />} onClick={p.onPark}>
                Voltar depois
              </Button>
            )}
            <Button icon={<DoorOpen size={18} />} onClick={() => setConfirm('exit')}>
              {p.online ? (p.onPark ? 'Sair de vez' : 'Sair da sala') : 'Sair'}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
