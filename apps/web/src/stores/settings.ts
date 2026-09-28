import {
  DEFAULT_RULES,
  PROFILE_KEY_PATTERN,
  normalizeRules,
  randomToken,
  type BotDifficulty,
  type Rules,
} from '@fodinha/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { randomAvatarSeed } from '../lib/avatar';
import { safeStateStorage } from '../lib/storage';

export type Speed = 'calma' | 'normal' | 'rapida' | 'turbo';
export const SPEED_MULTIPLIER: Record<Speed, number> = { calma: 0.7, normal: 1, rapida: 1.7, turbo: 4 };

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
  /** Dicas de primeira partida já vistas (ids). */
  seenTips: string[];
  /** Chave secreta do perfil de ranking (fica só neste aparelho; leva o perfil para outro). */
  profileKey: string;
  /** Pediu para ser avisado da vez (notificação do sistema). */
  notify: boolean;
  /** Apelido guardado com PIN (o nome fica fixo e vale em outros aparelhos), ou `null`. */
  claimed: string | null;
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
      seenTips: [],
      profileKey: randomToken(16),
      notify: false,
      claimed: null,
      set: (patch) => set(patch),
    }),
    {
      name: 'fodinha:ajustes',
      version: 2,
      storage: createJSONStorage(() => safeStateStorage),
      // v2: o padrão das cartas iguais virou "ninguém leva"; quem estava no padrão antigo acompanha.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        if (version < 2 && p.rules?.tieRule === 'cancel') p.rules = { ...p.rules, tieRule: 'nobody' };
        return p as SettingsState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        const key = typeof p.profileKey === 'string' && PROFILE_KEY_PATTERN.test(p.profileKey) ? p.profileKey : current.profileKey;
        const speed = p.speed && p.speed in SPEED_MULTIPLIER ? p.speed : current.speed;
        return { ...current, ...p, speed, profileKey: key, rules: normalizeRules(p.rules ?? current.rules) };
      },
    },
  ),
);

/** Nome para mostrar na mesa local (sem apelido, aparece como "Eu"). */
export function displayName(name: string): string {
  return name.trim() || 'Eu';
}
