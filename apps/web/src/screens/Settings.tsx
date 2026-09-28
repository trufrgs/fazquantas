import { ProfileEditor } from '../components/setup/ProfileEditor';
import { Button } from '../components/ui/Button';
import { Segmented, Toggle } from '../components/ui/Controls';
import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';
import { useApp } from '../stores/app';
import { useSettings, type Speed } from '../stores/settings';

export function Settings() {
  const s = useSettings();
  const go = useApp((st) => st.go);
  return (
    <ScreenFrame title="Ajustes">
      <Panel title="Perfil">
        <ProfileEditor />
      </Panel>
      <Panel title="Jogo">
        <div className="divide-y divide-tinta/10">
          <Toggle checked={s.sound} onChange={(sound) => s.set({ sound })} label="Som" />
          <Toggle checked={s.haptics} onChange={(haptics) => s.set({ haptics })} label="Vibração" description="Na tua vez e quando perde palito." />
          <Toggle checked={s.hints} onChange={(hints) => s.set({ hints })} label="Dicas" description="Sugere palpite e carta na tua vez." />
          <div className="py-3">
            <span className="mb-2 block font-semibold">Velocidade dos bots</span>
            <Segmented<Speed>
              label="Velocidade dos bots"
              value={s.speed}
              onChange={(speed) => s.set({ speed })}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'rapida', label: 'Rápida' },
                { value: 'turbo', label: 'Turbo' },
              ]}
            />
          </div>
          <div className="py-3">
            <span className="mb-2 block font-semibold">Ordem das tuas cartas</span>
            <Segmented<'forca' | 'naipe'>
              label="Ordem das tuas cartas"
              value={s.sortHand}
              onChange={(sortHand) => s.set({ sortHand })}
              options={[
                { value: 'forca', label: 'Por força' },
                { value: 'naipe', label: 'Por naipe' },
              ]}
            />
          </div>
        </div>
      </Panel>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="vidro" onClick={() => go('rules')}>
          Como jogar
        </Button>
        <Button variant="vidro" onClick={() => go('credits')}>
          Créditos
        </Button>
      </div>
      <p className="text-center text-xs text-papel/55">Fodinha {__APP_VERSION__}</p>
    </ScreenFrame>
  );
}
