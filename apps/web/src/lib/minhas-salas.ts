import { storage } from './storage';

/**
 * As salas em que esta pessoa tem lugar (com o token para voltar a ele). Numa sala assíncrona a
 * gente fecha o jogo e volta horas depois, às vezes com várias partidas andando ao mesmo tempo.
 */
export interface SalaConhecida {
  code: string;
  token: string;
  playerId: string;
  /** Última vez que entrou (para ordenar e esquecer as velhas). */
  at: number;
}

const KEY = 'fodinha:salas';
const MAX = 12;
/** Sala sem visita há mais de 10 dias já acabou (a assíncrona dura 7 dias parada). */
const MAX_AGE_MS = 10 * 24 * 60 * 60_000;

export function knownRooms(now = Date.now()): SalaConhecida[] {
  const list = storage.get<SalaConhecida[]>(KEY);
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && typeof r.code === 'string' && typeof r.token === 'string' && now - (r.at ?? 0) < MAX_AGE_MS)
    .sort((a, b) => b.at - a.at);
}

export function knownRoom(code: string): SalaConhecida | undefined {
  return knownRooms().find((r) => r.code === code);
}

export function rememberRoom(room: Omit<SalaConhecida, 'at'>, now = Date.now()): void {
  const rest = knownRooms(now).filter((r) => r.code !== room.code);
  storage.set(KEY, [{ ...room, at: now }, ...rest].slice(0, MAX));
}

export function forgetRoom(code: string): void {
  storage.set(
    KEY,
    knownRooms().filter((r) => r.code !== code),
  );
}
