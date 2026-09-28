import { DurableObject } from 'cloudflare:workers';
import { brtDay } from './contas';

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
  bots: number;
  conectados: number;
  assincrona: boolean;
  ranqueada: boolean;
  senha: boolean;
}

export type Contador = 'salas' | 'partidas' | 'partidas_fim' | 'ranqueadas' | 'avisos';

export interface PainelDados {
  hoje: string;
  dias: { dia: string; acessos: number; pessoas: number; salas: number; partidas: number; partidasFim: number; ranqueadas: number; avisos: number }[];
  salasAbertas: (ResumoSala & { criada: number; atualizada: number })[];
  salasRecentes: (ResumoSala & { criada: number; encerrada: number; motivo: string })[];
  acessos: (Visita & { dia: string; primeira: number; ultima: number; vezes: number })[];
  paises: { pais: string; pessoas: number }[];
  jogadores: { profileId: string; nome: string; avatar: string; primeira: number; ultima: number; dias: number; ip: string; cidade: string; aparelho: string }[];
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
    `);
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
    if (nova) await this.contar('salas');
    else {
      // O mesmo código pode voltar depois de encerrado: reabre a linha.
      const antiga = this.sql.exec<{ encerrada: number | null }>('SELECT encerrada FROM salas WHERE code = ?', resumo.code).toArray()[0];
      const reaberta = antiga?.encerrada != null;
      this.sql.exec(
        `UPDATE salas SET resumo = ?, atualizada = ?, encerrada = NULL, motivo = NULL${reaberta ? ', criada = ?' : ''} WHERE code = ?`,
        ...(reaberta ? [JSON.stringify(resumo), now, now, resumo.code] : [JSON.stringify(resumo), now, resumo.code]),
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
      });
    }
    const salas = this.sql
      .exec<{ resumo: string; criada: number; atualizada: number; encerrada: number | null; motivo: string | null }>(
        `SELECT resumo, criada, atualizada, encerrada, motivo FROM salas
          WHERE encerrada IS NULL OR encerrada > ? ORDER BY atualizada DESC LIMIT 200`,
        now - 7 * 86_400_000,
      )
      .toArray();
    const salasAbertas: PainelDados['salasAbertas'] = [];
    const salasRecentes: PainelDados['salasRecentes'] = [];
    for (const s of salas) {
      const resumo = JSON.parse(s.resumo) as ResumoSala;
      if (s.encerrada === null) salasAbertas.push({ ...resumo, criada: s.criada, atualizada: s.atualizada });
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
    return { hoje, dias, salasAbertas, salasRecentes, acessos, paises, jogadores };
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
  }
}

export function painelStub(env: Env) {
  return env.PAINEL.get(env.PAINEL.idFromName('painel'));
}
