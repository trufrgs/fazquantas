import { DurableObject } from 'cloudflare:workers';
import { brtDay } from './contas';
import type { PushSubscriptionJSON } from './push';

/** Uma visita ao jogo: um por perfil por dia (a primeira e a última hora ficam). */
export type Visita = {
  profileId: string;
  nome: string;
  avatar: string;
  ip: string;
  pais: string;
  cidade: string;
  aparelho: string;
};

/** Como a sala está, para a lista do admin. */
export interface ResumoSala {
  code: string;
  status: string;
  humanos: string[];
  /** Cada pessoa sentada: perfil, se está conectada e se a mesa está jogando por ela. */
  jogadores?: { nome: string; perfil: string | null; conectado: boolean; ausente: boolean }[];
  bots: number;
  conectados: number;
  assincrona: boolean;
  ranqueada: boolean;
  senha: boolean;
}

export type Contador = 'salas' | 'partidas' | 'partidas_fim' | 'ranqueadas' | 'avisos' | 'recusadas';

/** O que a automação faz sozinha (o admin ajusta; 0 desliga a regra). */
export interface Automacao {
  /** Mesa no lobby sem ninguém mexer há tantas horas: encerra. */
  lobbyParadoHoras: number;
  /** Partida terminada e ninguém puxa a próxima há tantas horas: encerra. */
  fimParadoHoras: number;
  /** Resumo do dia por push para os aparelhos do admin, às 21:00 BRT. */
  resumoDiario: boolean;
  /** Salas criadas por hora por endereço de internet (protege o plano gratuito). */
  limiteSalasPorHora: number;
}

export const AUTOMACAO_PADRAO: Automacao = { lobbyParadoHoras: 12, fimParadoHoras: 2, resumoDiario: true, limiteSalasPorHora: 30 };

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

export interface SalaAberta {
  code: string;
  status: string;
  assincrona: boolean;
  conectados: number;
  criada: number;
  atividade: number;
}

export type Acao = {
  quando: number;
  acao: string;
  alvo: string;
  detalhe: string;
};

export interface PainelDados {
  hoje: string;
  dias: { dia: string; acessos: number; pessoas: number; salas: number; partidas: number; partidasFim: number; ranqueadas: number; avisos: number; recusadas: number }[];
  salasAbertas: (ResumoSala & { criada: number; atualizada: number; atividade: number })[];
  salasRecentes: (ResumoSala & { criada: number; encerrada: number; motivo: string })[];
  acessos: (Visita & { dia: string; primeira: number; ultima: number; vezes: number })[];
  paises: { pais: string; pessoas: number }[];
  jogadores: { profileId: string; nome: string; avatar: string; primeira: number; ultima: number; dias: number; ip: string; cidade: string; aparelho: string }[];
  /** Quem está numa sala agora (perfil → sala e se está conectado). */
  naMesa: { perfil: string; nome: string; code: string; conectado: boolean }[];
  auditoria: Acao[];
  automacao: Automacao;
  ultimaAutomacao: RodadaAutomacao | null;
  manutencao: Manutencao;
  avisosAdmin: number;
}

const DIAS_GUARDADOS = 90;

/**
 * O painel do admin: acessos por dia (IP truncado), salas abertas e encerradas e contadores. Um
 * objeto só, com SQLite; as salas avisam quando mudam de situação, o web avisa quando abre.
 */
export class PainelDO extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS acessos (
        dia TEXT NOT NULL,
        perfil TEXT NOT NULL,
        nome TEXT NOT NULL,
        avatar TEXT NOT NULL,
        ip TEXT NOT NULL,
        pais TEXT NOT NULL,
        cidade TEXT NOT NULL,
        aparelho TEXT NOT NULL,
        primeira INTEGER NOT NULL,
        ultima INTEGER NOT NULL,
        vezes INTEGER NOT NULL,
        PRIMARY KEY (dia, perfil)
      );
      CREATE INDEX IF NOT EXISTS acessos_perfil ON acessos (perfil);
      CREATE TABLE IF NOT EXISTS salas (
        code TEXT PRIMARY KEY,
        resumo TEXT NOT NULL,
        criada INTEGER NOT NULL,
        atualizada INTEGER NOT NULL,
        encerrada INTEGER,
        motivo TEXT
      );
      CREATE TABLE IF NOT EXISTS contadores (
        dia TEXT NOT NULL,
        nome TEXT NOT NULL,
        valor INTEGER NOT NULL,
        PRIMARY KEY (dia, nome)
      );
      CREATE TABLE IF NOT EXISTS auditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quando INTEGER NOT NULL,
        acao TEXT NOT NULL,
        alvo TEXT NOT NULL,
        detalhe TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS criacoes (
        ip TEXT NOT NULL,
        quando INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS criacoes_ip ON criacoes (ip, quando);
    `);
    // Coluna nova numa tabela que já existe em produção.
    try {
      this.sql.exec('ALTER TABLE salas ADD COLUMN atividade INTEGER');
    } catch {
      // já existe
    }
  }

  // --- configuração e manutenção --------------------------------------------

  async automacao(): Promise<Automacao> {
    return { ...AUTOMACAO_PADRAO, ...((await this.ctx.storage.get<Partial<Automacao>>('automacao')) ?? {}) };
  }

  async salvarAutomacao(patch: Partial<Automacao>): Promise<Automacao> {
    const nova = { ...(await this.automacao()), ...patch };
    await this.ctx.storage.put('automacao', nova);
    return nova;
  }

  async manutencao(): Promise<Manutencao> {
    return (await this.ctx.storage.get<Manutencao>('manutencao')) ?? { ativa: false, mensagem: '', desde: null };
  }

  async salvarManutencao(ativa: boolean, mensagem: string): Promise<Manutencao> {
    const m: Manutencao = { ativa, mensagem: mensagem.slice(0, 200), desde: ativa ? Date.now() : null };
    await this.ctx.storage.put('manutencao', m);
    return m;
  }

  /**
   * Pode criar sala? Não em manutenção, nem acima do limite de salas por hora do mesmo endereço
   * (`ip` já chega resumido: o endereço em si não é guardado). `semLimite`: os testes E2E, que
   * criam dezenas de salas do mesmo endereço.
   */
  async podeCriarSala(ip: string, semLimite = false): Promise<{ ok: true } | { ok: false; motivo: 'manutencao' | 'limite'; mensagem: string }> {
    const m = await this.manutencao();
    if (m.ativa) return { ok: false, motivo: 'manutencao', mensagem: m.mensagem || 'O jogo está em manutenção. Volta daqui a pouco.' };
    const { limiteSalasPorHora } = await this.automacao();
    const now = Date.now();
    if (limiteSalasPorHora > 0 && !semLimite) {
      const n = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM criacoes WHERE ip = ? AND quando > ?', ip, now - 3_600_000).one().n;
      if (n >= limiteSalasPorHora) {
        await this.contar('recusadas');
        return { ok: false, motivo: 'limite', mensagem: 'Muitas salas criadas daqui na última hora. Espera um pouco e tenta de novo.' };
      }
    }
    this.sql.exec('INSERT INTO criacoes (ip, quando) VALUES (?, ?)', ip, now);
    return { ok: true };
  }

  async assinaturasAdmin(): Promise<PushSubscriptionJSON[]> {
    return (await this.ctx.storage.get<PushSubscriptionJSON[]>('admin:assinaturas')) ?? [];
  }

  async assinarAdmin(sub: PushSubscriptionJSON): Promise<number> {
    const outras = (await this.assinaturasAdmin()).filter((s) => s.endpoint !== sub.endpoint);
    const todas = [sub, ...outras].slice(0, 5);
    await this.ctx.storage.put('admin:assinaturas', todas);
    return todas.length;
  }

  async cancelarAdmin(endpoint: string): Promise<number> {
    const restantes = (await this.assinaturasAdmin()).filter((s) => s.endpoint !== endpoint);
    await this.ctx.storage.put('admin:assinaturas', restantes);
    return restantes.length;
  }

  // --- histórico e automação ------------------------------------------------

  async registrar(acao: string, alvo: string, detalhe = ''): Promise<void> {
    this.sql.exec('INSERT INTO auditoria (quando, acao, alvo, detalhe) VALUES (?, ?, ?, ?)', Date.now(), acao.slice(0, 80), alvo.slice(0, 80), detalhe.slice(0, 300));
  }

  async salvarRodada(r: RodadaAutomacao): Promise<void> {
    await this.ctx.storage.put('automacao:ultima', r);
  }

  /** Salas que o painel acha abertas, com a última atividade (para a automação conferir). */
  async abertas(): Promise<SalaAberta[]> {
    return this.sql
      .exec<{ code: string; resumo: string; criada: number; atividade: number | null; atualizada: number }>(
        'SELECT code, resumo, criada, atividade, atualizada FROM salas WHERE encerrada IS NULL ORDER BY COALESCE(atividade, criada) ASC',
      )
      .toArray()
      .map((r) => {
        const resumo = JSON.parse(r.resumo) as ResumoSala;
        return {
          code: r.code,
          status: resumo.status,
          assincrona: resumo.assincrona,
          conectados: resumo.conectados,
          criada: r.criada,
          atividade: r.atividade ?? r.criada,
        };
      });
  }

  /** Alguém mexeu na sala (a sala avisa no máximo a cada poucos minutos). */
  async atividade(code: string, at: number): Promise<void> {
    this.sql.exec('UPDATE salas SET atividade = ? WHERE code = ? AND encerrada IS NULL', at, code);
  }

  async visita(v: Visita): Promise<void> {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO acessos (dia, perfil, nome, avatar, ip, pais, cidade, aparelho, primeira, ultima, vezes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(dia, perfil) DO UPDATE SET nome = excluded.nome, avatar = excluded.avatar, ip = excluded.ip,
         pais = excluded.pais, cidade = excluded.cidade, aparelho = excluded.aparelho, ultima = excluded.ultima,
         vezes = acessos.vezes + 1`,
      brtDay(now),
      v.profileId,
      v.nome,
      v.avatar,
      v.ip,
      v.pais,
      v.cidade,
      v.aparelho,
      now,
      now,
    );
    await this.limparDepoisDeUmTempo(now);
  }

  async contar(nome: Contador, n = 1): Promise<void> {
    this.sql.exec(
      `INSERT INTO contadores (dia, nome, valor) VALUES (?, ?, ?)
       ON CONFLICT(dia, nome) DO UPDATE SET valor = contadores.valor + excluded.valor`,
      brtDay(Date.now()),
      nome,
      n,
    );
  }

  /** A sala mudou de situação (criada, começou, alguém entrou ou saiu). */
  async sala(resumo: ResumoSala): Promise<void> {
    const now = Date.now();
    const nova =
      this.sql.exec(
        `INSERT INTO salas (code, resumo, criada, atualizada) VALUES (?, ?, ?, ?)
         ON CONFLICT(code) DO NOTHING`,
        resumo.code,
        JSON.stringify(resumo),
        now,
        now,
      ).rowsWritten > 0;
    // A atividade vem de gente mexendo (`atividade()`), não do resumo: a sala manda o resumo também
    // quando só acordou (admin, automação, alarme), e isso não é ninguém jogando.
    if (nova) {
      this.sql.exec('UPDATE salas SET atividade = ? WHERE code = ?', now, resumo.code);
      await this.contar('salas');
    }
    else {
      // O mesmo código pode voltar depois de encerrado: reabre a linha.
      const antiga = this.sql.exec<{ encerrada: number | null }>('SELECT encerrada FROM salas WHERE code = ?', resumo.code).toArray()[0];
      const reaberta = antiga?.encerrada != null;
      this.sql.exec(
        `UPDATE salas SET resumo = ?, atualizada = ?, encerrada = NULL, motivo = NULL${reaberta ? ', criada = ?, atividade = ?' : ''} WHERE code = ?`,
        ...(reaberta ? [JSON.stringify(resumo), now, now, now, resumo.code] : [JSON.stringify(resumo), now, resumo.code]),
      );
      if (reaberta) await this.contar('salas');
    }
  }

  async salaEncerrada(code: string, motivo: string): Promise<void> {
    this.sql.exec('UPDATE salas SET encerrada = ?, motivo = ? WHERE code = ? AND encerrada IS NULL', Date.now(), motivo.slice(0, 120), code);
  }

  async dados(): Promise<PainelDados> {
    const now = Date.now();
    const hoje = brtDay(now);
    const desde = brtDay(now - 30 * 86_400_000);
    const acessosPorDia = new Map(
      this.sql
        .exec<{ dia: string; acessos: number; pessoas: number }>(
          'SELECT dia, SUM(vezes) AS acessos, COUNT(*) AS pessoas FROM acessos WHERE dia >= ? GROUP BY dia',
          desde,
        )
        .toArray()
        .map((r) => [r.dia, r]),
    );
    const cont = new Map<string, Record<string, number>>();
    for (const r of this.sql.exec<{ dia: string; nome: string; valor: number }>('SELECT dia, nome, valor FROM contadores WHERE dia >= ?', desde)) {
      cont.set(r.dia, { ...(cont.get(r.dia) ?? {}), [r.nome]: r.valor });
    }
    const dias: PainelDados['dias'] = [];
    for (let i = 29; i >= 0; i--) {
      const dia = brtDay(now - i * 86_400_000);
      const a = acessosPorDia.get(dia);
      const c = cont.get(dia) ?? {};
      dias.push({
        dia,
        acessos: a?.acessos ?? 0,
        pessoas: a?.pessoas ?? 0,
        salas: c.salas ?? 0,
        partidas: c.partidas ?? 0,
        partidasFim: c.partidas_fim ?? 0,
        ranqueadas: c.ranqueadas ?? 0,
        avisos: c.avisos ?? 0,
        recusadas: c.recusadas ?? 0,
      });
    }
    const salas = this.sql
      .exec<{ resumo: string; criada: number; atualizada: number; atividade: number | null; encerrada: number | null; motivo: string | null }>(
        `SELECT resumo, criada, atualizada, atividade, encerrada, motivo FROM salas
          WHERE encerrada IS NULL OR encerrada > ? ORDER BY atualizada DESC LIMIT 200`,
        now - 7 * 86_400_000,
      )
      .toArray();
    const salasAbertas: PainelDados['salasAbertas'] = [];
    const salasRecentes: PainelDados['salasRecentes'] = [];
    for (const s of salas) {
      const resumo = JSON.parse(s.resumo) as ResumoSala;
      if (s.encerrada === null)
        salasAbertas.push({ ...resumo, criada: s.criada, atualizada: s.atualizada, atividade: s.atividade ?? s.criada });
      else salasRecentes.push({ ...resumo, criada: s.criada, encerrada: s.encerrada, motivo: s.motivo ?? '' });
    }
    const acessos = this.sql
      .exec<Visita & { dia: string; primeira: number; ultima: number; vezes: number; profileId: string }>(
        `SELECT dia, perfil AS profileId, nome, avatar, ip, pais, cidade, aparelho, primeira, ultima, vezes
           FROM acessos ORDER BY ultima DESC LIMIT 300`,
      )
      .toArray();
    const paises = this.sql
      .exec<{ pais: string; pessoas: number }>(
        'SELECT pais, COUNT(DISTINCT perfil) AS pessoas FROM acessos WHERE dia >= ? GROUP BY pais ORDER BY pessoas DESC',
        desde,
      )
      .toArray();
    const jogadores = this.sql
      .exec<PainelDados['jogadores'][number]>(
        `SELECT a.perfil AS profileId, a.nome, a.avatar, MIN(a.primeira) AS primeira, MAX(a.ultima) AS ultima,
                COUNT(*) AS dias,
                (SELECT ip FROM acessos b WHERE b.perfil = a.perfil ORDER BY ultima DESC LIMIT 1) AS ip,
                (SELECT cidade FROM acessos b WHERE b.perfil = a.perfil ORDER BY ultima DESC LIMIT 1) AS cidade,
                (SELECT aparelho FROM acessos b WHERE b.perfil = a.perfil ORDER BY ultima DESC LIMIT 1) AS aparelho
           FROM acessos a GROUP BY a.perfil ORDER BY ultima DESC LIMIT 500`,
      )
      .toArray();
    const naMesa: PainelDados['naMesa'] = [];
    for (const s of salasAbertas) {
      for (const j of s.jogadores ?? []) if (j.perfil) naMesa.push({ perfil: j.perfil, nome: j.nome, code: s.code, conectado: j.conectado });
    }
    const auditoria = this.sql
      .exec<Acao>('SELECT quando, acao, alvo, detalhe FROM auditoria ORDER BY id DESC LIMIT 150')
      .toArray();
    return {
      hoje,
      dias,
      salasAbertas,
      salasRecentes,
      acessos,
      paises,
      jogadores,
      naMesa,
      auditoria,
      automacao: await this.automacao(),
      ultimaAutomacao: (await this.ctx.storage.get<RodadaAutomacao>('automacao:ultima')) ?? null,
      manutencao: await this.manutencao(),
      avisosAdmin: (await this.assinaturasAdmin()).length,
    };
  }

  /** Acessos e salas com mais de 90 dias saem (uma vez por dia basta). */
  private async limparDepoisDeUmTempo(now: number): Promise<void> {
    const ultima = (await this.ctx.storage.get<number>('limpeza')) ?? 0;
    if (now - ultima < 86_400_000) return;
    await this.ctx.storage.put('limpeza', now);
    const corte = brtDay(now - DIAS_GUARDADOS * 86_400_000);
    this.sql.exec('DELETE FROM acessos WHERE dia < ?', corte);
    this.sql.exec('DELETE FROM contadores WHERE dia < ?', corte);
    this.sql.exec('DELETE FROM salas WHERE encerrada IS NOT NULL AND encerrada < ?', now - DIAS_GUARDADOS * 86_400_000);
    this.sql.exec('DELETE FROM criacoes WHERE quando < ?', now - 86_400_000);
    this.sql.exec('DELETE FROM auditoria WHERE quando < ?', now - 180 * 86_400_000);
  }
}

/** Nome do objeto do painel: trocar começa do zero (os acessos dos testes ficaram para trás). */
export const PAINEL_NOME = 'lancamento';

export function painelStub(env: Env) {
  return env.PAINEL.get(env.PAINEL.idFromName(PAINEL_NOME));
}
