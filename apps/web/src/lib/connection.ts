import type { BotDifficulty, ClientAction, PlayerView, ReactionId } from '@fodinha/engine';

export interface SeatInfo {
  id: string;
  name: string;
  avatar: string;
  kind: 'human' | 'bot';
  difficulty?: BotDifficulty;
  connected: boolean;
}

export interface ViewUpdate {
  view: PlayerView;
  /** A mudança foi automática (bot, tempo esgotado, jogada forçada…). */
  auto: boolean;
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
  /** Controles só do modo local. */
  pause?(): void;
  resume?(): void;
  skipPause?(): void;
  setSpeed?(multiplier: number): void;
  dispose(): void;
}
