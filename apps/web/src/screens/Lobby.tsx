import { BOT_DIFFICULTIES, isAsyncTurn, type BotDifficulty } from '@fodinha/engine';
import { Bell, Crown, KeyRound, Share2, Trophy, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RoomSettings, roomSummary } from '../components/setup/RoomSettings';
import { RulesEditor, rulesSummary } from '../components/setup/RulesEditor';
import { Avatar } from '../components/ui/Avatar';
import { AdminNotice } from '../components/ui/AdminNotice';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Controls';
import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';
import { Sheet } from '../components/ui/Sheet';
import { enableNotify, isIos, notifyState } from '../lib/avisos';
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
  const [notify, setNotify] = useState(notifyState());
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
  const asyncRoom = isAsyncTurn(room.turnTimeoutSec);
  const park = () => {
    online.park();
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
              {room.seats.length < 2 ? 'Chama alguém ou bota um bot' : room.bestOf > 1 ? `Começar a série (melhor de ${room.bestOf})` : 'Começar partida'}
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
                  {s.playerId === room.hostId && <Crown size="1rem" className="shrink-0 text-ouros-escuro" aria-label="anfitrião" />}
                </span>
                <span className="text-sm text-tinta-2">
                  {s.playerId === room.youId
                    ? 'tu'
                    : s.kind === 'bot'
                      ? `bot ${DIFF_NAME[s.difficulty]}`
                      : s.connected
                        ? 'na mesa'
                        : 'saiu da tela, esperando voltar…'}
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
                  <X size="1.125rem" />
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

      <Panel title="Partida">
        {host ? (
          <RoomSettings room={room} onChange={online.update} />
        ) : (
          <div className="flex flex-col gap-2 text-tinta-2">
            <p>{roomSummary(room)}.</p>
            <p className="flex flex-wrap gap-2 text-sm font-semibold text-tinta">
              {room.ranked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-ouros/30 px-2.5 py-1">
                  <Trophy size="0.9rem" aria-hidden="true" /> Valendo ranking
                </span>
              )}
              {room.hasPassword && (
                <span className="inline-flex items-center gap-1 rounded-full bg-tinta/8 px-2.5 py-1">
                  <KeyRound size="0.9rem" aria-hidden="true" /> Com senha
                </span>
              )}
            </p>
          </div>
        )}
      </Panel>

      <Panel title="Regras">
        {host ? (
          <RulesEditor
            value={room.rules}
            onChange={(rules) => {
              void online.update({ rules });
              settings.set({ rules });
            }}
          />
        ) : (
          <p className="text-tinta-2">{rulesSummary(room.rules)}.</p>
        )}
      </Panel>

      {notify !== 'granted' || !settings.notify ? (
        <Panel>
          <div className="flex items-start gap-3">
            <Bell size="1.4rem" className="mt-0.5 shrink-0 text-ouros-escuro" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">Avisar quando for tua vez</p>
              <p className="text-sm text-tinta-2">
                {notify === 'unsupported'
                  ? isIos()
                    ? 'No iPhone, instala o jogo na tela inicial (Compartilhar → Adicionar à Tela de Início) pra receber avisos.'
                    : 'Esse navegador não mostra notificações; o título da aba avisa.'
                  : notify === 'denied'
                    ? 'As notificações estão bloqueadas neste navegador. Libera nas permissões do site.'
                    : asyncRoom
                      ? 'Nessa sala cada um joga no seu tempo: é o aviso que te chama quando chega a tua vez.'
                      : 'Se tu for pra outro app enquanto espera, o celular avisa.'}
              </p>
              {notify === 'default' || (notify === 'granted' && !settings.notify) ? (
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    await enableNotify();
                    setNotify(notifyState());
                  }}
                >
                  Ligar avisos
                </Button>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}

      <AdminNotice fixed />
      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} label="Sair da sala">
        {asyncRoom ? (
          <>
            <p className="text-lg font-semibold">Largar a sala {room.code} por agora?</p>
            <p className="mt-1 text-tinta-2">
              Teu lugar fica guardado: a sala aparece em "Tuas salas" e o aviso te chama quando for a tua vez.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="ouro" onClick={park}>
                Voltar depois
              </Button>
              <Button variant="copas" onClick={leave}>
                Sair de vez
              </Button>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </Sheet>
    </ScreenFrame>
  );
}
