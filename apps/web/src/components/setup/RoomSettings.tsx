import {
  BEST_OF_OPTIONS,
  MAX_LIVES,
  MIN_LIVES,
  PACES,
  PASSWORD_MAX_LENGTH,
  RANKED_MIN_HUMANS,
  TURN_TIMEOUT_OPTIONS,
  seriesTarget,
  type BestOf,
  type Pace,
  type RoomState,
  type RoomUpdatePayload,
} from '@fodinha/engine';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { Segmented, Stepper, Toggle } from '../ui/Controls';

const BEST_OF_LABEL: Record<BestOf, string> = { 1: 'Avulsa', 3: 'Melhor de 3', 5: 'de 5', 7: 'de 7' };
const TIMEOUT_LABEL = (t: number | null) => (t === null ? 'Livre' : t >= 60 ? `${t / 60} min` : `${t} s`);

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
  const [editingPassword, setEditingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const humans = room.seats.filter((s) => s.kind === 'human').length;

  const change = async (patch: RoomUpdatePayload) => {
    setError(await onChange(patch));
  };
  const savePassword = async () => {
    const clean = password.trim();
    if (!clean) return;
    const err = await onChange({ password: clean });
    setError(err);
    if (!err) {
      setEditingPassword(false);
      setPassword('');
    }
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
      <Field label="Tempo por jogada" hint="Quem estoura o tempo duas vezes seguidas fica ausente: a mesa joga por ele até ele voltar.">
        <Segmented<number | null>
          label="Tempo por jogada"
          value={room.turnTimeoutSec}
          onChange={(turnTimeoutSec) => void change({ turnTimeoutSec })}
          options={TURN_TIMEOUT_OPTIONS.map((t) => ({ value: t, label: TIMEOUT_LABEL(t) }))}
        />
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
          description="Quem tiver o código ainda precisa da senha pra entrar."
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
      {error && (
        <p role="alert" className="py-2 text-sm font-semibold text-copas">
          {error}
        </p>
      )}
    </div>
  );
}
