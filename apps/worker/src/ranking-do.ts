import { DurableObject } from 'cloudflare:workers';
import {
  periodRange,
  type RankingPeriod,
  type RankingResponse,
  type RankingRow,
  type RankingScope,
} from '@fodinha/engine';
import type { PartidaRanqueada } from '@fodinha/sala';

/** Quantas linhas o ranking devolve (a turma de amigos cabe com folga). */
export const RANKING_LIMIT = 200;

export interface RankingQuery {
  period: RankingPeriod;
  /** Um instante dentro do período pedido (epoch ms). */
  at: number;
  scope: RankingScope;
  /** Id público de quem pede (destaca a linha e define a turma). */
  profileId: string | null;
}

/**
 * O ranking de todas as partidas que valeram: um objeto só, com SQLite. As partidas entram uma
 * vez (o id da partida é a chave); as consultas somam por período.
 */
/**
 * Nome do objeto do ranking. Trocar o nome começa um ranking zerado (o antigo fica guardado, sem
 * uso): foi assim que os jogos de teste da produção ficaram fora do ranking de verdade.
 */
export const RANKING_NOME = 'geral';

export function rankingStub(env: Env) {
  return env.RANKING.get(env.RANKING.idFromName(RANKING_NOME));
}

export class RankingDO extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS jogadores (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        avatar TEXT NOT NULL,
        atualizado INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS partidas (
        id TEXT PRIMARY KEY,
        sala TEXT NOT NULL,
        iniciada INTEGER NOT NULL,
        terminada INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resultados (
        partida TEXT NOT NULL,
        jogador TEXT NOT NULL,
        pontos INTEGER NOT NULL,
        venceu INTEGER NOT NULL,
        abandonou INTEGER NOT NULL,
        terminada INTEGER NOT NULL,
        PRIMARY KEY (partida, jogador)
      );
      CREATE INDEX IF NOT EXISTS resultados_terminada ON resultados (terminada);
      CREATE INDEX IF NOT EXISTS resultados_jogador ON resultados (jogador);
    `);
  }

  /** Grava uma partida que valeu. Repetida (a sala tentou de novo) não conta duas vezes. */
  async registrar(p: PartidaRanqueada): Promise<boolean> {
    let novo = false;
    this.ctx.storage.transactionSync(() => {
      const r = this.sql.exec(
        'INSERT OR IGNORE INTO partidas (id, sala, iniciada, terminada) VALUES (?, ?, ?, ?)',
        p.id,
        p.sala,
        p.iniciadaEm,
        p.terminadaEm,
      );
      if (r.rowsWritten === 0) return;
      novo = true;
      for (const j of p.jogadores) {
        this.sql.exec(
          `INSERT INTO jogadores (id, nome, avatar, atualizado) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, avatar = excluded.avatar, atualizado = excluded.atualizado
           WHERE excluded.atualizado >= jogadores.atualizado`,
          j.profileId,
          j.name,
          j.avatar,
          p.terminadaEm,
        );
        this.sql.exec(
          'INSERT OR IGNORE INTO resultados (partida, jogador, pontos, venceu, abandonou, terminada) VALUES (?, ?, ?, ?, ?, ?)',
          p.id,
          j.profileId,
          j.points,
          j.won ? 1 : 0,
          j.abandoned ? 1 : 0,
          p.terminadaEm,
        );
      }
    });
    return novo;
  }

  async consultar(q: RankingQuery): Promise<RankingResponse> {
    const range = periodRange(q.period, q.at, Date.now());
    const turma = q.scope === 'turma' && q.profileId !== null;
    const rows = this.sql
      .exec<{ id: string; nome: string; avatar: string; pontos: number; vitorias: number; partidas: number }>(
        `SELECT r.jogador AS id, j.nome AS nome, j.avatar AS avatar,
                SUM(r.pontos) AS pontos, SUM(r.venceu) AS vitorias, COUNT(*) AS partidas
           FROM resultados r JOIN jogadores j ON j.id = r.jogador
          WHERE r.terminada >= ? AND r.terminada < ?
            ${
              turma
                ? `AND r.jogador IN (
                     SELECT DISTINCT r2.jogador FROM resultados r2
                      WHERE r2.partida IN (SELECT partida FROM resultados WHERE jogador = ?)
                   )`
                : ''
            }
          GROUP BY r.jogador
          ORDER BY pontos DESC, vitorias DESC, partidas ASC, nome ASC
          LIMIT ?`,
        ...(turma
          ? [range.start, range.end, q.profileId, RANKING_LIMIT]
          : [range.start, range.end, RANKING_LIMIT]),
      )
      .toArray();
    const out: RankingRow[] = [];
    let position = 0;
    let previous: { pontos: number; vitorias: number; partidas: number } | null = null;
    rows.forEach((row, index) => {
      // Empate em tudo divide a posição.
      const same =
        previous !== null &&
        previous.pontos === row.pontos &&
        previous.vitorias === row.vitorias &&
        previous.partidas === row.partidas;
      if (!same) position = index + 1;
      previous = row;
      out.push({
        position,
        profileId: row.id,
        name: row.nome,
        avatar: row.avatar,
        points: row.pontos,
        wins: row.vitorias,
        games: row.partidas,
      });
    });
    const you = q.profileId ? (out.find((r) => r.profileId === q.profileId) ?? null) : null;
    return { range, scope: turma ? 'turma' : 'geral', rows: out, you };
  }
}
