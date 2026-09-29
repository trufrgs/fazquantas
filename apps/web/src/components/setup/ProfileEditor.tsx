import { GAUCHO_AVATARS, NAME_MAX_LENGTH } from '@fodinha/engine';
import { useEffect } from 'react';
import { avatarLabel } from '../../lib/avatar';
import { consultarApelido, useDonoDoApelido } from '../../lib/conta';
import { multiplayer } from '../../lib/platform';
import { play } from '../../lib/sound';
import { useSettings } from '../../stores/settings';
import { Avatar } from '../ui/Avatar';
import { ApelidoDeOutro } from './ApelidoGuardado';

/** Apelido + escolha de avatar (a turma do Gaudério inteira, para escolher o teu). */
export function ProfileEditor({ onAvatar }: { onAvatar?: (seed: string) => void } = {}) {
  const { name, avatar, set, claimed } = useSettings();
  const label = avatarLabel(avatar);
  // Apelido guardado por outra pessoa (ou por ti, em outro aparelho): avisa enquanto se escreve.
  const dono = useDonoDoApelido(name);
  useEffect(() => {
    if (!multiplayer || claimed || [...name.trim()].length < 2) return;
    const t = window.setTimeout(() => void consultarApelido(name.trim()), 450);
    return () => window.clearTimeout(t);
  }, [name, claimed]);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Como te chamam na mesa?</span>
        <input
          value={name}
          maxLength={NAME_MAX_LENGTH}
          readOnly={!!claimed}
          title={claimed ? 'Apelido guardado: pra trocar, usa o PIN em "Apelido guardado".' : undefined}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Teu apelido"
          autoComplete="nickname"
          className="h-12 rounded-2xl border-0 bg-white/70 px-4 text-lg font-semibold text-tinta shadow-inner ring-1 ring-tinta/15 outline-none read-only:bg-white/40 focus:ring-2 focus:ring-espadas"
        />
        {claimed && <span className="text-xs text-tinta-2">Apelido guardado com PIN: pra trocar, vai em Ajustes → Apelido guardado.</span>}
      </label>
      {multiplayer && !claimed && dono === 'outro' && <ApelidoDeOutro nome={name} />}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="font-semibold">Avatar</span>
          {label && <span className="truncate text-sm font-bold text-espadas">{label}</span>}
        </div>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Avatar">
          {GAUCHO_AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={a.id === avatar}
              aria-label={a.label}
              title={a.label}
              onClick={() => {
                play('click');
                set({ avatar: a.id });
                onAvatar?.(a.id);
              }}
              className={`flex items-center justify-center rounded-2xl p-1 transition ${a.id === avatar ? 'bg-ouros/40 ring-2 ring-ouros-escuro' : 'bg-tinta/5'}`}
            >
              <Avatar seed={a.id} size={46} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
