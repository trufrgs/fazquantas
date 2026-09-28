import { useApp } from '../stores/app';
import { useGame } from '../stores/game';
import { displayName, SPEED_MULTIPLIER, useSettings } from '../stores/settings';
import { clearSavedGame, LocalConnection } from './local-connection';

/** Começa uma partida local com os ajustes atuais e vai para a mesa. */
export function startLocalGame(): void {
  const s = useSettings.getState();
  clearSavedGame();
  const conn = LocalConnection.create({
    name: displayName(s.name),
    avatar: s.avatar,
    players: s.players,
    difficulty: s.difficulty,
    rules: s.rules,
    speed: SPEED_MULTIPLIER[s.speed],
  });
  useGame.getState().attach(conn);
  useApp.getState().reset('game');
}

/** Retoma a partida local salva. */
export function resumeLocalGame(): boolean {
  const s = useSettings.getState();
  const conn = LocalConnection.resume(SPEED_MULTIPLIER[s.speed]);
  if (!conn) return false;
  useGame.getState().attach(conn);
  useApp.getState().reset('game');
  return true;
}

/** Sai da mesa (a partida local continua salva) e volta ao início. */
export function leaveTable(): void {
  useGame.getState().detach();
  useApp.getState().reset('home');
}
