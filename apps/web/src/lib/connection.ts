import type { AutoReason, BotDifficulty, ClientAction, PlayerView, ReactionId, Zoeira, ZoeiraNaMesa } from '@fodinha/engine';

export interface SeatInfo {
  id: string;
  name: string;
  avatar: string;
  kind: 'human' | 'bot';
  difficulty?: BotDifficulty;
  connected: boolean;
  /** A mesa está jogando por ele (caiu ou estourou o tempo seguidas vezes). */
  away?: boolean;
}

export interface ViewUpdate {
  view: PlayerView;
  /** A mudança foi automática (bot, tempo esgotado, jogada forçada…). */
  auto: boolean;
  /** Motivo da jogada automática (só `timeout` vira aviso). */
  reason: AutoReason | null;
  actorId: string | null;
}

export interface ReactionEvent {
  playerId: string;
  reaction: ReactionId;
}

/** O que a mesa precisa de uma partida — igual para o modo local e o online. */
export interface GameConnection {
  readonly kind: 'local' | 'online';
  readonly youId: string;
  current(): ViewUpdate | null;
  seats(): SeatInfo[];
  subscribe(listener: (u: ViewUpdate) => void): () => void;
  onReaction(listener: (r: ReactionEvent) => void): () => void;
  /** Resolve com a mensagem de erro, ou `null` se deu certo. */
  act(action: ClientAction): Promise<string | null>;
  react(reaction: ReactionId): void;
  /** Zoar alguém (só enfeite): resolve com o recado do limite, ou `null` se foi. */
  zoar?(z: Zoeira): Promise<string | null>;
  onZoeira?(listener: (z: ZoeiraNaMesa) => void): () => void;
  /** Controles só do modo local. */
  pause?(): void;
  resume?(): void;
  skipPause?(): void;
  setSpeed?(multiplier: number): void;
  /** Só sobraram bots na mesa: o resto da partida em câmera rápida (online, a sala toda). */
  acelerar?(): void;
  /** O ritmo em que o jogo local está agora (1 = normal). */
  speed?(): number;
  dispose(): void;
}
