import { DEFAULT_RULES, normalizeRules, type BotDifficulty, type Rules } from '@fodinha/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { randomAvatarSeed } from '../lib/avatar';
import { safeStateStorage } from '../lib/storage';

export type Speed = 'normal' | 'rapida' | 'turbo';
export const SPEED_MULTIPLIER: Record<Speed, number> = { normal: 1, rapida: 1.7, turbo: 4 };

export interface SettingsState {
  name: string;
  avatar: string;
  sound: boolean;
  haptics: boolean;
  speed: Speed;
  sortHand: 'forca' | 'naipe';
  hints: boolean;
  players: number;
  difficulty: BotDifficulty;
  rules: Rules;
  seenTutorial: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      name: '',
      avatar: randomAvatarSeed(),
      sound: true,
      haptics: true,
      speed: 'normal',
      sortHand: 'forca',
      hints: true,
      players: 4,
      difficulty: 'medio',
      rules: { ...DEFAULT_RULES },
      seenTutorial: false,
      set: (patch) => set(patch),
    }),
    {
      name: 'fodinha:ajustes',
      version: 1,
      storage: createJSONStorage(() => safeStateStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return { ...current, ...p, rules: normalizeRules(p.rules ?? current.rules) };
      },
    },
  ),
);

/** Nome para mostrar (quem ainda não escolheu apelido aparece como "Você"). */
export function displayName(name: string): string {
  return name.trim() || 'Você';
}
