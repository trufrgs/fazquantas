import {
  DEFAULT_RULES,
  FAVORITAS_PADRAO,
  GAUCHO_AVATARS,
  PROFILE_KEY_PATTERN,
  REACTIONS,
  normalizeRules,
  randomToken,
  type BotDifficulty,
  type ReactionId,
  type Rules,
} from '@fodinha/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { randomAvatarSeed } from '../lib/avatar';
import { atualizarRegrasAntigas } from '../lib/regras-antigas';
import { safeStateStorage } from '../lib/storage';

export type Speed = 'calma' | 'normal' | 'rapida' | 'turbo';
export const SPEED_MULTIPLIER: Record<Speed, number> = { calma: 0.7, normal: 1, rapida: 1.7, turbo: 4 };

export interface SettingsState {
  name: string;
  avatar: string;
  /** Efeitos sonoros (cartas, golpes, avisos). A música é outra chave (`musica`). */
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
  /** Tango de fundo, baixinho, na sala e na mesa (independente dos efeitos). */
  musica: boolean;
  /** O barulho do bolicho por baixo do tango (conversa ao fundo, copo, sinuca), na sala e na mesa. */
  bolicho: boolean;
  /** Ouvir a conversa da mesa online (o microfone de quem abriu). */
  ouvirConversa: boolean;
  /** As três frases que ficam no alto da mesa, a um toque (★ no quadro de frases). */
  frasesFavoritas: ReactionId[];
  /** Mostrar o resumo no fim de cada rodada (quem cantou, fez e queimou). */
  resumoDaRodada: boolean;
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
      hints: false,
      players: 4,
      difficulty: 'medio',
      rules: { ...DEFAULT_RULES },
      seenTutorial: false,
      seenTips: [],
      profileKey: randomToken(16),
      notify: false,
      claimed: null,
      musica: true,
      bolicho: true,
      ouvirConversa: true,
      frasesFavoritas: [...FAVORITAS_PADRAO],
      resumoDaRodada: true,
      set: (patch) => set(patch),
    }),
    {
      name: 'fodinha:ajustes',
      version: 6,
      storage: createJSONStorage(() => safeStateStorage),
      // v2: o padrão das cartas iguais virou "ninguém leva"; quem estava no padrão antigo acompanha.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        if (version < 2 && p.rules?.tieRule === 'cancel') p.rules = { ...p.rules, tieRule: 'nobody' };
        // v3: a sugestão de palpite e carta passou a vir desligada (quem quiser liga nos ajustes).
        if (version < 3) p.hints = false;
        // v4: os avatares antigos (DiceBear) deram lugar à turma do Gaudério.
        const antigo = typeof p.avatar === 'string' ? /^av-(\d+)$/.exec(p.avatar) : null;
        if (version < 4 && antigo) p.avatar = GAUCHO_AVATARS[Number(antigo[1]) % GAUCHO_AVATARS.length]!.id;
        // v5: o padrão virou 3 vidas perdendo 1 por erro; quem nunca mexeu nas regras acompanha.
        if (version < 5 && p.rules) p.rules = atualizarRegrasAntigas(p.rules);
        // v6: música e efeitos viraram chaves separadas (antes o "Som" calava os dois); quem estava
        // com o som desligado continua no silêncio.
        if (version < 6 && p.sound === false) p.musica = false;
        return p as SettingsState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        const key = typeof p.profileKey === 'string' && PROFILE_KEY_PATTERN.test(p.profileKey) ? p.profileKey : current.profileKey;
        const speed = p.speed && p.speed in SPEED_MULTIPLIER ? p.speed : current.speed;
        // Favoritas: só frases que existem, no máximo três (o resto some sem reclamar).
        const favoritas = Array.isArray(p.frasesFavoritas) ? p.frasesFavoritas.filter((id) => REACTIONS.some((r) => r.id === id)).slice(0, 3) : current.frasesFavoritas;
        return { ...current, ...p, speed, profileKey: key, frasesFavoritas: favoritas, rules: normalizeRules(p.rules ?? current.rules) };
      },
    },
  ),
);

/** Nome para mostrar na mesa local (sem apelido, aparece como "Eu"). */
export function displayName(name: string): string {
  return name.trim() || 'Eu';
}
