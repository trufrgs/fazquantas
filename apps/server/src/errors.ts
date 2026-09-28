import type { ErrorCode, ProtocolError } from '@fodinha/engine';

/** Códigos além do contrato: erro inesperado e servidor lotado. */
export type ServerErrorCode = ErrorCode | 'INTERNAL_ERROR' | 'SERVER_FULL';

/** Mensagens mostradas ao jogador (pt-BR, curtas e diretas). */
export const MESSAGES = {
  roomNotFound: 'Sala não encontrada. Confira o código.',
  roomFull: 'A sala está cheia.',
  // A sala não volta ao lobby depois de começar: o jeito é outra sala.
  joinInProgress: 'Essa sala já está jogando. Para entrar, peça ao anfitrião uma sala nova.',
  locked: 'Não dá para mudar isso com a partida em andamento.',
  alreadyPlaying: 'A partida já está em andamento.',
  botInGame: 'Não dá para tirar um bot no meio da partida.',
  notHost: 'Só o anfitrião pode fazer isso.',
  notInRoom: 'Você não está em nenhuma sala.',
  notEnoughPlayers: 'Precisa de pelo menos 2 jogadores para começar.',
  noGame: 'Nenhuma partida em andamento.',
  seatGone: 'Esse jogador não está mais na sala.',
  notBot: 'Esse assento não é de um bot.',
  kickSelf: 'Para sair da sala, use o botão de sair.',
  rateLimited: 'Muitas ações seguidas. Espere um instante.',
  serverFull: 'O servidor está lotado agora. Tente de novo em instantes.',
  internal: 'Erro inesperado no servidor. Tente de novo.',
  payload: 'Dados inválidos.',
  name: 'Apelido inválido: use de 1 a 16 caracteres.',
  avatar: 'Avatar inválido.',
  code: 'Código inválido: são 4 letras ou números.',
  token: 'Credencial de reconexão inválida.',
  rules: 'Regras inválidas.',
  lives: 'Vidas iniciais inválidas.',
  maxCards: 'Máximo de cartas inválido.',
  turnTimeout: 'Tempo por jogada inválido.',
  difficulty: 'Dificuldade inválida.',
  playerId: 'Jogador inválido.',
  action: 'Jogada inválida.',
  reaction: 'Reação inválida.',
} as const;

/** Falha esperada de uma operação; vira `{ ok: false, error }` no ack. */
export class ProtocolFailure extends Error {
  constructor(
    readonly code: ServerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProtocolFailure';
  }

  toProtocolError(): ProtocolError {
    return { code: this.code, message: this.message };
  }
}

export function fail(code: ServerErrorCode, message: string): ProtocolFailure {
  return new ProtocolFailure(code, message);
}
