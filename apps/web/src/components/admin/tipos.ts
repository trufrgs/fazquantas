import { serverUrl } from '../../lib/platform';

/** O que o servidor manda para o painel do admin (`/api/admin/painel`). */

export interface JogadorNaSala {
  nome: string;
  perfil: string | null;
  conectado: boolean;
  /** A mesa está jogando por ele (caiu e não voltou a tempo). */
  ausente: boolean;
}

export interface Sala {
  code: string;
  status: string;
  humanos: string[];
  jogadores?: JogadorNaSala[];
  bots: number;
  conectados: number;
  assincrona: boolean;
  ranqueada: boolean;
  senha: boolean;
  criada: number;
  atualizada?: number;
  /** Última mensagem ou conexão de uma pessoa (a sala avisa no máximo a cada 5 min). */
  atividade?: number;
  encerrada?: number;
  motivo?: string;
}

export interface Dia {
  dia: string;
  acessos: number;
  pessoas: number;
  salas: number;
  partidas: number;
  partidasFim: number;
  ranqueadas: number;
  avisos: number;
  /** Salas que o limite por endereço (ou a manutenção) barrou. */
  recusadas?: number;
}

export interface Acesso {
  dia: string;
  profileId: string;
  nome: string;
  avatar: string;
  ip: string;
  pais: string;
  cidade: string;
  aparelho: string;
  primeira: number;
  ultima: number;
  vezes: number;
}

export interface Automacao {
  lobbyParadoHoras: number;
  fimParadoHoras: number;
  resumoDiario: boolean;
  limiteSalasPorHora: number;
}

export interface Manutencao {
  ativa: boolean;
  mensagem: string;
  desde: number | null;
}

export interface RodadaAutomacao {
  quando: number;
  verificadas: number;
  sumidas: string[];
  encerradas: { code: string; motivo: string }[];
}

export interface AcaoRegistrada {
  quando: number;
  acao: string;
  alvo: string;
  detalhe: string;
}

export interface Jogador {
  profileId: string;
  nome: string;
  avatar: string;
  primeira: number;
  ultima: number;
  dias: number;
  ip: string;
  cidade: string;
  aparelho: string;
}

export interface Dados {
  painel: {
    hoje: string;
    dias: Dia[];
    salasAbertas: Sala[];
    salasRecentes: Sala[];
    acessos: Acesso[];
    paises: { pais: string; pessoas: number }[];
    jogadores: Jogador[];
    naMesa?: { perfil: string; nome: string; code: string; conectado: boolean }[];
    auditoria?: AcaoRegistrada[];
    automacao?: Automacao;
    ultimaAutomacao?: RodadaAutomacao | null;
    manutencao?: Manutencao;
    avisosAdmin?: number;
  };
  contas: {
    profileId: string;
    apelido: string | null;
    avatar: string | null;
    guardadoEm: number | null;
    bloqueadoAte: number | null;
    motivo: string | null;
    /** A piada interna do apelido (chegada e apelido de zoeira). */
    piada?: { chegada?: string; alcunha?: string } | null;
  }[];
  ranking: { profileId: string; nome: string; pontos: number; vitorias: number; partidas: number }[];
  padrao?: Automacao;
}

export type Resposta = Record<string, unknown> & { ok?: boolean; mensagem?: string };

export async function api<T>(path: string, token: string | null, body: unknown = {}): Promise<{ status: number; data: T & Resposta }> {
  const res = await fetch(`${serverUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => ({ ok: false }))) as T & Resposta };
}

/** Roda uma ação do admin, mostra o resultado e recarrega o painel. */
export type RodarAcao = (path: string, body: object, pronto: string | ((r: Resposta) => string)) => Promise<Resposta | null>;

export type Aba = 'agora' | 'salas' | 'jogadores' | 'numeros' | 'automacao' | 'historico';
export type FiltroSalas = 'todas' | 'paradas' | 'vazias' | 'aovivo' | 'assincronas';

export const AUTOMACAO_PADRAO: Automacao = { lobbyParadoHoras: 12, fimParadoHoras: 2, resumoDiario: true, limiteSalasPorHora: 30 };

const FUSO = 'America/Sao_Paulo';

/** Dia e hora em Brasília ("28/09 21:10"). */
export const hora = (t: number) =>
  new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO });

/** Só a hora em Brasília ("21:10"). */
export const soHora = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });

/** Quanto tempo faz, curto: "agora", "12 min", "3 h", "2 dias". */
export function faz(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} dias`;
}

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export const STATUS: Record<string, string> = { lobby: 'no lobby', playing: 'jogando', finished: 'partida terminada' };

/** Desde quando ninguém mexe na sala (mensagem ou conexão de gente; a sala só acordar não conta). */
export const ultimaAtividade = (s: Sala) => s.atividade ?? s.criada;

export const HORA_MS = 3_600_000;
/**
 * Mesa parada além do prazo: sem ninguém conectado e sem mexer há mais de 12 h (7 dias na de cada um
 * no seu tempo). Antes disso é normal: o lugar de cada um fica guardado, e a sala acaba sozinha no
 * prazo. Passou dele, algo falhou nela (a automação encerra em seguida).
 */
export const estaParada = (s: Sala, agora: number) =>
  s.conectados === 0 && agora - ultimaAtividade(s) >= (s.assincrona ? 7 * 24 : 12) * HORA_MS;

/** Uma linha sobre a rodada da automação ("conferiu 3, encerrou 1, 0 sumidas"). */
export function resumoRodada(r: RodadaAutomacao): string {
  const partes = [`conferiu ${plural(r.verificadas, 'sala', 'salas')}`, `encerrou ${r.encerradas.length}`];
  if (r.sumidas.length) partes.push(`${plural(r.sumidas.length, 'sumida fechada', 'sumidas fechadas')} no painel`);
  return partes.join(', ');
}

/**
 * "ativa agora" ou "parada há 3 h". A sala avisa a atividade no máximo a cada 5 min, então menos
 * de 10 min conta como agora.
 */
export const situacao = (msParada: number) => (msParada < 10 * 60_000 ? 'ativa agora' : `parada há ${faz(msParada)}`);
