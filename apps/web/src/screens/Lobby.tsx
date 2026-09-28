import { BOT_DIFFICULTIES, TURN_TIMEOUT_OPTIONS, type BotDifficulty } from '@fodinha/engine';
import { Crown, Share2, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RulesEditor, rulesSummary } from '../components/setup/RulesEditor';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Controls';
import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';
import { Sheet } from '../components/ui/Sheet';
import { shareInvite } from '../lib/platform';
import { useApp } from '../stores/app';
import { useOnline } from '../stores/online';
import { useSettings } from '../stores/settings';

const DIFF_NAME: Record<BotDifficulty, string> = { facil: 'fácil', medio: 'médio', dificil: 'difícil' };

export function Lobby() {
  const online = useOnline();
  const reset = useApp((s) => s.reset);
  const settings = useSettings();
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(settings.difficulty);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Botão voltar do Android na sala: pergunta antes de sair (sair de verdade libera o lugar).
  useEffect(() => {
    const ask = () => setConfirmLeave((open) => !open);
    window.addEventListener('fodinha:voltar', ask);
    return () => window.removeEventListener('fodinha:voltar', ask);
  }, []);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const room = online.room;

  if (!room) {
    return (
      <ScreenFrame title="Sala" onBack={() => reset('online')}>
        <Panel>
          <p>{online.status === 'reconnecting' || online.status === 'connecting' ? 'Conectando na sala…' : 'Tu não está em nenhuma sala.'}</p>
        </Panel>
      </ScreenFrame>
    );
  }

  const host = room.hostId === room.youId;
  const hostName = room.seats.find((s) => s.playerId === room.hostId)?.name ?? 'o anfitrião';
  const full = room.seats.length >= room.capacity;
  const leave = () => {
    online.leave();
    reset('home');
  };

  return (
    <ScreenFrame
      title="Sala"
      onBack={() => setConfirmLeave(true)}
      right={
        <Button
          variant="vidro"
          size="sm"
          icon={<Share2 size={16} />}
          onClick={async () => {
            const r = await shareInvite(room.code);
            setShareMsg(r === 'copied' ? 'Convite copiado.' : r === 'failed' ? 'Não deu pra compartilhar: dita o código pra gurizada.' : null);
            window.setTimeout(() => setShareMsg(null), 2500);
          }}
        >
          Convidar
        </Button>
      }
      footer={
        host ? (
          <div className="flex flex-col gap-2">
            {startError && <p className="text-center text-sm font-semibold text-luz">{startError}</p>}
            <Button
              variant="ouro"
              size="lg"
              className="w-full"
              disabled={room.seats.length < 2}
              onClick={async () => setStartError(await online.start())}
            >
              {room.seats.length < 2 ? 'Chama alguém ou bota um bot' : 'Começar partida'}
            </Button>
          </div>
        ) : (
          <p className="rounded-2xl bg-noite/45 px-4 py-3 text-center font-semibold ring-1 ring-papel/10">
            Esperando {hostName} começar a partida…
          </p>
        )
      }
    >
      <div className="flex flex-col items-center gap-1 pt-1">
        <span className="text-sm text-papel/75">Código da sala</span>
        <div className="flex gap-2" role="img" aria-label={`Código ${room.code.split('').join(' ')}`}>
          {room.code.split('').map((c, i) => (
            <span
              key={i}
              className="papel flex h-16 w-14 items-center justify-center rounded-2xl font-display text-4xl font-bold shadow-[0_6px_0_#b9a47f,0_10px_20px_rgb(0_0_0/0.4)]"
            >
              {c}
            </span>
          ))}
        </div>
        {shareMsg && <span className="text-sm font-semibold text-luz">{shareMsg}</span>}
      </div>

      <Panel title={`Na mesa (${room.seats.length}/${room.capacity})`}>
        <ul className="flex flex-col divide-y divide-tinta/10">
          {room.seats.map((s) => (
            <li key={s.playerId} className="flex items-center gap-3 py-2">
              <Avatar seed={s.avatar} size={40} dim={s.kind === 'human' && !s.connected} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="truncate">{s.name}</span>
                  {s.playerId === room.hostId && <Crown size={16} className="shrink-0 text-ouros-escuro" aria-label="anfitrião" />}
                </span>
                <span className="text-sm text-tinta-2">
                  {s.playerId === room.youId
                    ? 'tu'
                    : s.kind === 'bot'
                      ? `bot ${DIFF_NAME[s.difficulty]}`
                      : s.connected
                        ? 'na mesa'
                        : 'reconectando…'}
                </span>
              </span>
              {host && s.kind === 'bot' && (
                <select
                  aria-label={`Dificuldade de ${s.name}`}
                  value={s.difficulty}
                  onChange={(e) => online.setBot(s.playerId, e.target.value as BotDifficulty)}
                  className="h-9 rounded-xl bg-tinta/8 px-2 text-sm font-semibold ring-1 ring-tinta/10"
                >
                  {BOT_DIFFICULTIES.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              {host && s.playerId !== room.youId && (
                <button
                  type="button"
                  onClick={() => online.removeSeat(s.playerId)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-tinta/8 text-tinta-2"
                  aria-label={`Tirar ${s.name} da sala`}
                >
                  <X size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {host && !full && (
          <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-tinta/5 p-3">
            <Segmented<BotDifficulty>
              label="Dificuldade do bot"
              value={botDifficulty}
              onChange={setBotDifficulty}
              options={BOT_DIFFICULTIES.map((d) => ({ value: d.id, label: d.name }))}
            />
            <Button icon={<UserPlus size={18} />} onClick={() => online.addBot(botDifficulty)}>
              Adicionar bot
            </Button>
          </div>
        )}
      </Panel>

      <Panel title="Regras">
        {host ? (
          <>
            <RulesEditor
              value={room.rules}
              onChange={(rules) => {
                online.update({ rules });
                settings.set({ rules });
              }}
            />
            <div className="mt-4">
              <span className="mb-2 block font-semibold">Tempo por jogada</span>
              <Segmented<number | null>
                label="Tempo por jogada"
                value={room.turnTimeoutSec}
                onChange={(turnTimeoutSec) => online.update({ turnTimeoutSec })}
                options={TURN_TIMEOUT_OPTIONS.map((t) => ({ value: t, label: t === null ? 'Sem limite' : `${t} s` }))}
              />
            </div>
          </>
        ) : (
          <p className="text-tinta-2">
            {rulesSummary(room.rules)}
            {room.turnTimeoutSec ? `, ${room.turnTimeoutSec} s por jogada` : ', sem limite de tempo'}.
          </p>
        )}
      </Panel>

      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} label="Sair da sala">
        <p className="text-lg font-semibold">Sair da sala {room.code}?</p>
        {host && room.seats.some((s) => s.kind === 'human' && s.playerId !== room.youId) && (
          <p className="mt-1 text-tinta-2">Outra pessoa vira anfitriã.</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={() => setConfirmLeave(false)}>Ficar</Button>
          <Button variant="copas" onClick={leave}>
            Sair
          </Button>
        </div>
      </Sheet>
    </ScreenFrame>
  );
}
