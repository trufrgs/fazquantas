import { ApelidoGuardado } from '../components/setup/ApelidoGuardado';
import { InstalarApp } from '../components/setup/InstalarApp';
import { ProfileEditor } from '../components/setup/ProfileEditor';
import { disableNotify, enableNotify, notifyState } from '../lib/avisos';
import { sincronizarAvatar } from '../lib/conta';
import { multiplayer } from '../lib/platform';
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
        <ProfileEditor onAvatar={sincronizarAvatar} />
      </Panel>
      <Panel title="Jogo">
        <div className="divide-y divide-tinta/10">
          <Toggle checked={s.sound} onChange={(sound) => s.set({ sound })} label="Som" />
          <Toggle checked={s.musica} onChange={(musica) => s.set({ musica })} label="Música" description="Um tango de fundo, baixinho (toca com o som ligado)." />
          <Toggle checked={s.haptics} onChange={(haptics) => s.set({ haptics })} label="Vibração" description="Na tua vez e quando perde palito." />
          <Toggle checked={s.hints} onChange={(hints) => s.set({ hints })} label="Sugerir palpite e carta" description="Na tua vez, marca o palpite e a carta que o jogo faria. Vem desligado." />
          {multiplayer && notifyState() !== 'unsupported' && (
            <Toggle
              checked={s.notify && notifyState() === 'granted'}
              onChange={(on) => void (on ? enableNotify() : disableNotify())}
              label="Avisar quando for tua vez"
              description={
                notifyState() === 'denied'
                  ? 'Bloqueado no navegador: libera nas permissões do site.'
                  : 'No jogo online, com o celular em outra tela.'
              }
            />
          )}
          <div className="py-3">
            <span className="mb-2 block font-semibold">Ritmo do jogo</span>
            <span className="mb-2 block text-sm opacity-70">Quanto os bots pensam e quanto cada mão fica na mesa.</span>
            <Segmented<Speed>
              label="Ritmo do jogo"
              value={s.speed}
              onChange={(speed) => s.set({ speed })}
              options={[
                { value: 'calma', label: 'Calma' },
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
      {multiplayer && (
        <Panel title="Apelido guardado">
          <ApelidoGuardado />
        </Panel>
      )}
      {/* O destaque fica no início (botão dourado ao lado dos ajustes); aqui é o atalho. */}
      <InstalarApp />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="vidro" onClick={() => go('rules')}>
          Como jogar
        </Button>
        <Button variant="vidro" onClick={() => go('credits')}>
          Créditos
        </Button>
      </div>
      <p className="text-center text-xs text-papel/55">Faz quantas? {__APP_VERSION__} · build {__BUILD_ID__}</p>
    </ScreenFrame>
  );
}
