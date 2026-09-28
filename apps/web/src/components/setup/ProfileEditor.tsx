import { NAME_MAX_LENGTH } from '@fodinha/engine';
import { Shuffle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { randomAvatarSeed } from '../../lib/avatar';
import { play } from '../../lib/sound';
import { useSettings } from '../../stores/settings';
import { Avatar } from '../ui/Avatar';

/** Apelido + escolha de avatar. */
export function ProfileEditor() {
  const { name, avatar, set } = useSettings();
  const [batch, setBatch] = useState(0);
  const options = useMemo(() => [avatar, ...Array.from({ length: 7 }, () => randomAvatarSeed())], [batch]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Como te chamam na mesa?</span>
        <input
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Seu apelido"
          autoComplete="nickname"
          className="h-12 rounded-2xl border-0 bg-white/70 px-4 text-lg font-semibold text-tinta shadow-inner ring-1 ring-tinta/15 outline-none focus:ring-2 focus:ring-espadas"
        />
      </label>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold">Avatar</span>
          <button
            type="button"
            onClick={() => {
              play('click');
              setBatch((b) => b + 1);
            }}
            className="flex items-center gap-1 text-sm font-bold text-espadas"
          >
            <Shuffle size={16} /> Outros
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Avatar">
          {options.map((seed) => (
            <button
              key={seed}
              type="button"
              role="radio"
              aria-checked={seed === avatar}
              aria-label="Escolher este avatar"
              onClick={() => {
                play('click');
                set({ avatar: seed });
              }}
              className={`flex items-center justify-center rounded-2xl p-1.5 transition ${seed === avatar ? 'bg-ouros/40 ring-2 ring-ouros-escuro' : 'bg-tinta/5'}`}
            >
              <Avatar seed={seed} size={52} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
