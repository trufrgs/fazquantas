import { BOT_DIFFICULTIES, MAX_PLAYERS, MIN_PLAYERS, type BotDifficulty } from '@fodinha/engine';
import { RulesEditor } from '../components/setup/RulesEditor';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Segmented, Stepper } from '../components/ui/Controls';
import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';
import { startLocalGame } from '../lib/game-actions';
import { useSettings } from '../stores/settings';

const BOT_SEEDS = ['bento', 'neca', 'juca', 'lurdes', 'tonho', 'zeca', 'cida'];

export function NewGame() {
  const s = useSettings();
  return (
    <ScreenFrame
      title="Montar partida"
      footer={
        <Button variant="ouro" size="lg" className="w-full" onClick={startLocalGame}>
          Começar partida
        </Button>
      }
    >
      <Panel title="Na mesa">
        <div className="flex items-center justify-between gap-3">
          <span className="text-tinta-2">Você e {s.players - 1} {s.players - 1 === 1 ? 'bot' : 'bots'}</span>
          <Stepper label="jogadores" value={s.players} min={MIN_PLAYERS} max={MAX_PLAYERS} onChange={(players) => s.set({ players })} />
        </div>
        <div className="mt-3 flex -space-x-2">
          <Avatar seed={s.avatar} size={40} className="ring-2 ring-papel" />
          {BOT_SEEDS.slice(0, s.players - 1).map((seed) => (
            <Avatar key={seed} seed={seed} size={40} className="ring-2 ring-papel" />
          ))}
        </div>
      </Panel>
      <Panel title="Bots">
        <Segmented<BotDifficulty>
          label="Dificuldade dos bots"
          value={s.difficulty}
          onChange={(difficulty) => s.set({ difficulty })}
          options={BOT_DIFFICULTIES.map((d) => ({ value: d.id, label: d.name }))}
        />
        <p className="mt-2 text-sm text-tinta-2">{BOT_DIFFICULTIES.find((d) => d.id === s.difficulty)?.description}</p>
      </Panel>
      <Panel title="Regras">
        <RulesEditor value={s.rules} onChange={(rules) => s.set({ rules })} />
      </Panel>
    </ScreenFrame>
  );
}
