import {
  BEST_OF_OPTIONS,
  MAX_LIVES,
  MIN_LIVES,
  PACES,
  PASSWORD_MAX_LENGTH,
  RANKED_MIN_HUMANS,
  TURN_TIMEOUT_OPTIONS,
  isAsyncTurn,
  seriesTarget,
  type BestOf,
  type Pace,
  type RoomState,
  type RoomUpdatePayload,
} from '@fodinha/engine';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { play } from '../../lib/sound';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { Segmented, Stepper, Toggle } from '../ui/Controls';

const BEST_OF_LABEL: Record<BestOf, string> = { 1: 'Avulsa', 3: 'Melhor de 3', 5: 'de 5', 7: 'de 7' };
const TIMEOUT_LABEL = (t: number | null) =>
  t === null ? 'Sem limite' : t >= 3600 ? `${t / 3600} h` : t >= 60 ? `${t / 60} min` : `${t} s`;
const LIVE_TIMEOUTS = TURN_TIMEOUT_OPTIONS.filter((t) => !isAsyncTurn(t));
const ASYNC_TIMEOUTS = TURN_TIMEOUT_OPTIONS.filter((t) => isAsyncTurn(t));

/**
 * Tempo por jogada num seletor só: a primeira linha é para jogar todo mundo junto, a segunda para
 * cada um jogar no seu tempo (a sala fica assíncrona). Uma escolha entre todas.
 */
function TimeoutPicker({ value, onChange }: { value: number | null; onChange: (t: number | null) => void }) {
  const row = (label: string, options: readonly (number | null)[], cols: string) => (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-xs font-semibold text-tinta-2">{label}</span>
      <div className={`grid gap-1 ${cols}`}>
        {options.map((t) => {
          const active = t === value;
          return (
            <button
              key={String(t)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                play('click');
                onChange(t);
              }}
              className={`min-h-10 whitespace-nowrap rounded-xl px-1 text-sm font-semibold transition ${
                active ? 'bg-tinta text-papel shadow' : 'text-tinta/70'
              }`}
            >
              {TIMEOUT_LABEL(t)}
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div role="radiogroup" aria-label="Tempo por jogada" className="flex flex-col gap-2 rounded-2xl bg-tinta/8 p-2 ring-1 ring-tinta/10">
      {row('Todo mundo junto', LIVE_TIMEOUTS, 'grid-cols-5')}
      {row('Cada um no seu tempo', ASYNC_TIMEOUTS, 'grid-cols-4')}
    </div>
  );
}

function timeoutHint(t: number | null): string {
  if (!isAsyncTurn(t)) return 'Quem estoura o tempo duas vezes seguidas fica ausente: a mesa joga por ele até ele voltar.';
  if (t === null) return 'Cada um joga quando puder: quem fecha o jogo segue na mesa e a vez chega por notificação. A vez espera o tempo que for.';
  return 'Cada um joga quando puder: quem fecha o jogo segue na mesa e a vez chega por notificação, com lembrete antes do fim. Estourou o prazo, a mesa joga aquela vez.';
}

export function paceLabel(pace: Pace): string {
  return PACES.find((p) => p.id === pace)?.label ?? 'Normal';
}

/** Como a sala vai jogar, numa linha (para quem não é o anfitrião). */
export function roomSummary(room: RoomState): string {
  const parts = [
    room.bestOf === 1 ? 'Partida avulsa' : `Melhor de ${room.bestOf}`,
    `${room.rules.startingLives} ${room.rules.startingLives === 1 ? 'palito' : 'palitos'}`,
    `ritmo ${paceLabel(room.pace).toLowerCase()}`,
    room.turnTimeoutSec === null ? 'sem limite de tempo' : `${TIMEOUT_LABEL(room.turnTimeoutSec)} por jogada`,
    ...(isAsyncTurn(room.turnTimeoutSec) ? ['cada um no seu tempo'] : []),
  ];
  if (room.ranked) parts.push('valendo ranking');
  return parts.join(' · ');
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <span className="block font-semibold">{label}</span>
      {hint && <span className="mb-2 block text-sm text-tinta-2">{hint}</span>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </div>
  );
}

export interface RoomSettingsProps {
  room: RoomState;
  onChange: (patch: RoomUpdatePayload) => Promise<string | null>;
}

/** Ajustes da sala, para o anfitrião: série, palitos, ritmo, tempo, ranking e senha. */
export function RoomSettings({ room, onChange }: RoomSettingsProps) {
  const [error, setError] = useState<string | null>(null);
  const humans = room.seats.filter((s) => s.kind === 'human').length;

  const change = async (patch: RoomUpdatePayload) => {
    setError(await onChange(patch));
  };
  return (
    <div className="divide-y divide-tinta/10">
      <Field
        label="Partidas"
        hint={room.bestOf === 1 ? 'Uma partida só.' : `Série: leva quem ganhar ${seriesTarget(room.bestOf)} partidas primeiro.`}
      >
        <Segmented<BestOf>
          label="Partidas"
          value={room.bestOf}
          onChange={(bestOf) => void change({ bestOf })}
          options={BEST_OF_OPTIONS.map((n) => ({ value: n, label: BEST_OF_LABEL[n] }))}
        />
      </Field>
      <Field label="Palitos de cada um" hint="Errou o palpite, perde palito. Acabou, tá fora da partida.">
        <Stepper
          label="palitos"
          value={room.rules.startingLives}
          min={MIN_LIVES}
          max={MAX_LIVES}
          onChange={(startingLives) => void change({ rules: { startingLives } })}
        />
      </Field>
      <Field label="Ritmo" hint={PACES.find((p) => p.id === room.pace)?.description}>
        <Segmented<Pace>
          label="Ritmo"
          value={room.pace}
          onChange={(pace) => void change({ pace })}
          options={PACES.map((p) => ({ value: p.id, label: p.label }))}
        />
      </Field>
      <Field label="Tempo por jogada" hint={timeoutHint(room.turnTimeoutSec)}>
        <TimeoutPicker value={room.turnTimeoutSec} onChange={(turnTimeoutSec) => void change({ turnTimeoutSec })} />
      </Field>
      <Toggle
        checked={room.ranked}
        onChange={(ranked) => void change({ ranked })}
        label="Valendo ranking"
        description={
          humans < RANKED_MIN_HUMANS && room.ranked
            ? `Falta gente: precisa de ${RANKED_MIN_HUMANS} pessoas na mesa pra valer.`
            : 'Conta no ranking da semana, do mês e do ano. Quem sair no meio fica em último.'
        }
      />
      <SenhaDaSala room={room} onChange={onChange} onError={setError} />
      {error && (
        <p role="alert" className="py-2 text-sm font-semibold text-copas">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A senha da sala: liga, mostra, troca e tira. Vale também no meio da partida (no menu ☰), para o
 * caso de começar a entrar muita gente de fora (pedido do Thomas em 02/10/2026).
 */
export function SenhaDaSala({
  room,
  onChange,
  onError,
  descricao = 'Quem tiver o código ainda precisa da senha pra entrar.',
}: RoomSettingsProps & { onError: (erro: string | null) => void; descricao?: string }) {
  const [editingPassword, setEditingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const change = async (patch: RoomUpdatePayload) => onError(await onChange(patch));
  const savePassword = async () => {
    const clean = password.trim();
    if (!clean) return;
    const err = await onChange({ password: clean });
    onError(err);
    if (!err) {
      setEditingPassword(false);
      setPassword('');
    }
  };
  return (
      <div className="py-3">
        <Toggle
          checked={room.hasPassword}
          onChange={(on) => {
            if (on) setEditingPassword(true);
            else {
              setEditingPassword(false);
              void change({ password: null });
            }
          }}
          label="Sala com senha"
          description={descricao}
        />
        {room.hasPassword && room.password && !editingPassword && (
          <div className="flex items-center gap-2 rounded-2xl bg-tinta/5 px-3 py-2">
            <KeyRound size="1.1rem" className="shrink-0 text-tinta-2" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-mono text-lg font-semibold" aria-label="Senha da sala">
              {showPassword ? room.password : '•'.repeat(Math.min(room.password.length, 8))}
            </span>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-tinta/8 text-tinta-2"
              aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size="1.1rem" /> : <Eye size="1.1rem" />}
            </button>
            <Button size="sm" onClick={() => setEditingPassword(true)}>
              Trocar
            </Button>
          </div>
        )}
        {editingPassword && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void savePassword();
            }}
          >
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value.slice(0, PASSWORD_MAX_LENGTH))}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="Nova senha"
              aria-label="Nova senha da sala"
              className="h-12 min-w-0 flex-1 rounded-2xl border-0 bg-white/70 px-4 text-lg font-semibold text-tinta shadow-inner ring-1 ring-tinta/15 outline-none placeholder:text-tinta/30 focus:ring-2 focus:ring-espadas"
            />
            <Button type="submit" variant="ouro" disabled={!password.trim()}>
              Salvar
            </Button>
            <Button
              onClick={() => {
                setEditingPassword(false);
                setPassword('');
              }}
            >
              Cancelar
            </Button>
          </form>
        )}
      </div>
  );
}
