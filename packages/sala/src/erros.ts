import { RANKED_MIN_HUMANS, type ErrorCode, type ProtocolError } from '@fodinha/engine';

/** Códigos além do contrato: erro inesperado. */
export type ServerErrorCode = ErrorCode | 'INTERNAL_ERROR';

/** Mensagens mostradas ao jogador (pt-BR, curtas e diretas). */
export const MESSAGES = {
  roomNotFound: 'Sala não encontrada. Confere o código.',
  roomGone: 'Essa sala já acabou: ficou horas sem ninguém. Cria uma sala nova e manda o convite de novo.',
  roomGoneVazia: 'Essa sala já acabou: todo mundo saiu dela. Cria uma sala nova e manda o convite de novo.',
  roomGoneAdmin: 'Essa sala foi encerrada pela administração do jogo. Cria uma sala nova e manda o convite de novo.',
  roomGoneParada: 'Essa sala foi encerrada por ficar parada. Cria uma sala nova e manda o convite de novo.',
  seatTaken: 'Tu estás nessa sala em outro aparelho ou aba. Segue por lá, ou toca em "Voltar pra sala" pra jogar aqui.',
  seatLost: 'Tu saiu dessa sala (aqui ou em outro aparelho) e o lugar ficou livre. Pra voltar, entra de novo pelo código.',
  kicked: 'O anfitrião te tirou da sala.',
  seatBusy: 'Tem alguém com teu apelido jogando nessa mesa agora. Se és tu em outro aparelho, segue por lá, ou fecha lá e tenta de novo daqui a 30 segundos.',
  roomFull: 'A sala está cheia.',
  roomTaken: 'Esse código acabou de ser usado. Tenta criar de novo.',
  // No meio da partida ninguém senta; depois do fim, o anfitrião pode voltar a sala para o lobby.
  joinInProgress: 'Essa sala tá no meio de uma partida. Espera acabar e o anfitrião voltar pra sala.',
  locked: 'Não dá pra mudar isso com a partida rolando.',
  alreadyPlaying: 'A partida já tá rolando.',
  botInGame: 'Não dá pra tirar um bot no meio da partida.',
  notHost: 'Só o anfitrião pode fazer isso.',
  notInRoom: 'Tu não está em nenhuma sala.',
  notEnoughPlayers: 'Precisa de pelo menos 2 jogadores pra começar.',
  notRankable: `Pra valer ranking, precisa de pelo menos ${RANKED_MIN_HUMANS} pessoas na mesa.`,
  noGame: 'Nenhuma partida em andamento.',
  acelerar: 'Só dá pra acelerar quando só sobram bots na mesa.',
  voz: 'A conversa por voz é só para quem está na sala.',
  seatGone: 'Esse jogador não está mais na sala.',
  notBot: 'Esse assento não é de um bot.',
  kickSelf: 'Pra sair da sala, usa o botão de sair.',
  passwordRequired: 'Essa sala tem senha.',
  wrongPassword: 'Senha errada. Confere com quem te convidou.',
  tooManyAttempts: 'Muitas senhas erradas seguidas. Confere a senha com quem te convidou e tenta de novo.',
  rateLimited: 'Muitas ações seguidas. Espera um pouquinho.',
  blocked: 'Esse perfil está bloqueado no jogo online.',
  nickReserved: 'Esse apelido já tem dono: é guardado com PIN. Se é o teu, entra com o PIN; se não é, escolhe outro apelido.',
  internal: 'Deu um erro no servidor. Tenta de novo.',
  payload: 'Dados inválidos.',
  name: 'Apelido inválido: usa de 1 a 16 caracteres.',
  avatar: 'Avatar inválido.',
  code: 'Código inválido: são 4 letras ou números.',
  token: 'Credencial de reconexão inválida.',
  rules: 'Regras inválidas.',
  lives: 'Vidas iniciais inválidas.',
  maxCards: 'Máximo de cartas inválido.',
  turnTimeout: 'Tempo por jogada inválido.',
  pace: 'Ritmo inválido.',
  bestOf: 'Série inválida: partida avulsa ou melhor de 3, 5 ou 7.',
  ranked: 'Opção de ranking inválida.',
  password: 'Senha inválida: usa de 1 a 24 caracteres.',
  profile: 'Perfil inválido.',
  difficulty: 'Dificuldade inválida.',
  playerId: 'Jogador inválido.',
  action: 'Jogada inválida.',
  reaction: 'Reação inválida.',
  presence: 'Presença inválida.',
} as const;

/** Falha esperada de uma operação; vira `{ ok: false, error }` na resposta. */
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
