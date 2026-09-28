import { DurableObject } from 'cloudflare:workers';
import { NAME_MAX_LENGTH } from '@fodinha/engine';
import { apelidoKey, hashPin, pinWaitMs, randomSalt } from './contas';

/** Resultado de guardar ou entrar com o apelido. */
export type ContaResultado =
  | { ok: true; profileKey: string; profileId: string; apelido: string; avatar: string }
  | { ok: false; erro: 'ocupado' | 'pin' | 'espera' | 'nao-existe' | 'bloqueado'; esperaMs?: number };

/** O que a sala usa ao sentar alguém: o nome que vale e se pode jogar. */
export interface Conferencia {
  bloqueado: boolean;
  nome: string;
  avatar: string | null;
}

export interface ContaAdmin {
  profileId: string;
  apelido: string | null;
  avatar: string | null;
  guardadoEm: number | null;
  bloqueadoAte: number | null;
  motivo: string | null;
}

type Linha = {
  perfil: string;
  chave: string;
  apelido: string;
  apelido_key: string;
  avatar: string;
  pin_hash: string;
  pin_sal: string;
  erros: number;
  espera_ate: number;
  criado: number;
};

/** Bloqueio "para sempre" no admin. */
const PARA_SEMPRE = 8_640_000_000_000_000;

/**
 * Apelidos guardados com PIN e bloqueios de perfil: um objeto só (SQLite).
 *
 * O perfil continua nascendo no aparelho (a chave sorteada). Guardar o apelido liga essa chave a um
 * apelido único + PIN: em outro aparelho, apelido e PIN devolvem a mesma chave, e ninguém mais senta
 * com esse apelido.
 */
export class ContasDO extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS apelidos (
        perfil TEXT PRIMARY KEY,
        chave TEXT NOT NULL,
        apelido TEXT NOT NULL,
        apelido_key TEXT NOT NULL UNIQUE,
        avatar TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        pin_sal TEXT NOT NULL,
        erros INTEGER NOT NULL DEFAULT 0,
        espera_ate INTEGER NOT NULL DEFAULT 0,
        criado INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bloqueios (
        perfil TEXT PRIMARY KEY,
        ate INTEGER NOT NULL,
        motivo TEXT NOT NULL DEFAULT '',
        criado INTEGER NOT NULL
      );
    `);
  }

  private porPerfil(perfil: string): Linha | null {
    return this.sql.exec<Linha>('SELECT * FROM apelidos WHERE perfil = ?', perfil).toArray()[0] ?? null;
  }

  private porApelido(apelido: string): Linha | null {
    return this.sql.exec<Linha>('SELECT * FROM apelidos WHERE apelido_key = ?', apelidoKey(apelido)).toArray()[0] ?? null;
  }

  private bloqueadoAte(perfil: string, now: number): number | null {
    const b = this.sql.exec<{ ate: number }>('SELECT ate FROM bloqueios WHERE perfil = ?', perfil).toArray()[0];
    return b && b.ate > now ? b.ate : null;
  }

  /** Confere o PIN de uma linha, contando os erros (e a espera) no próprio apelido. */
  private async conferirPin(linha: Linha, pin: string, now: number): Promise<ContaResultado | null> {
    if (linha.espera_ate > now) return { ok: false, erro: 'espera', esperaMs: linha.espera_ate - now };
    if ((await hashPin(pin, linha.pin_sal)) === linha.pin_hash) {
      if (linha.erros > 0) this.sql.exec('UPDATE apelidos SET erros = 0, espera_ate = 0 WHERE perfil = ?', linha.perfil);
      return null;
    }
    const erros = linha.erros + 1;
    const espera = pinWaitMs(erros);
    this.sql.exec('UPDATE apelidos SET erros = ?, espera_ate = ? WHERE perfil = ?', erros, espera ? now + espera : 0, linha.perfil);
    return espera ? { ok: false, erro: 'espera', esperaMs: espera } : { ok: false, erro: 'pin' };
  }

  /**
   * Guarda (ou troca) o apelido deste perfil. Primeira vez: cria com o PIN. Já guardado: só muda com
   * o PIN certo (trocar o nome libera o antigo).
   */
  async guardar(p: { profileId: string; profileKey: string; apelido: string; avatar: string; pin: string; novoPin?: string }): Promise<ContaResultado> {
    const now = Date.now();
    if (this.bloqueadoAte(p.profileId, now)) return { ok: false, erro: 'bloqueado' };
    const dono = this.porApelido(p.apelido);
    if (dono && dono.perfil !== p.profileId) return { ok: false, erro: 'ocupado' };
    const atual = this.porPerfil(p.profileId);
    if (atual) {
      const falha = await this.conferirPin(atual, p.pin, now);
      if (falha) return falha;
      let hash = atual.pin_hash;
      let sal = atual.pin_sal;
      if (p.novoPin) {
        sal = randomSalt();
        hash = await hashPin(p.novoPin, sal);
      }
      this.sql.exec(
        'UPDATE apelidos SET apelido = ?, apelido_key = ?, avatar = ?, pin_hash = ?, pin_sal = ?, chave = ? WHERE perfil = ?',
        p.apelido,
        apelidoKey(p.apelido),
        p.avatar,
        hash,
        sal,
        p.profileKey,
        p.profileId,
      );
    } else {
      const sal = randomSalt();
      this.sql.exec(
        `INSERT INTO apelidos (perfil, chave, apelido, apelido_key, avatar, pin_hash, pin_sal, criado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        p.profileId,
        p.profileKey,
        p.apelido,
        apelidoKey(p.apelido),
        p.avatar,
        await hashPin(p.pin, sal),
        sal,
        now,
      );
    }
    return { ok: true, profileKey: p.profileKey, profileId: p.profileId, apelido: p.apelido, avatar: p.avatar };
  }

  /** Outro aparelho: apelido + PIN devolvem a chave do perfil (o aparelho passa a ser a mesma pessoa). */
  async entrar(apelido: string, pin: string): Promise<ContaResultado> {
    const now = Date.now();
    const linha = this.porApelido(apelido);
    if (!linha) return { ok: false, erro: 'nao-existe' };
    const falha = await this.conferirPin(linha, pin, now);
    if (falha) return falha;
    if (this.bloqueadoAte(linha.perfil, now)) return { ok: false, erro: 'bloqueado' };
    return { ok: true, profileKey: linha.chave, profileId: linha.perfil, apelido: linha.apelido, avatar: linha.avatar };
  }

  /** O avatar escolhido vale em todos os aparelhos do perfil guardado. */
  async trocarAvatar(profileId: string, avatar: string): Promise<boolean> {
    return this.sql.exec('UPDATE apelidos SET avatar = ? WHERE perfil = ?', avatar, profileId).rowsWritten > 0;
  }

  /** O apelido deste perfil (para a tela de ajustes saber se já está guardado). */
  async meu(profileId: string): Promise<{ apelido: string; avatar: string } | null> {
    const l = this.porPerfil(profileId);
    return l ? { apelido: l.apelido, avatar: l.avatar } : null;
  }

  /**
   * Na hora de sentar: perfil guardado usa o apelido e o avatar dele; nome que é apelido guardado de
   * outra pessoa ganha número ("Thomas 2"); perfil bloqueado não senta.
   */
  async conferir(profileId: string | null, nome: string): Promise<Conferencia> {
    const now = Date.now();
    if (profileId && this.bloqueadoAte(profileId, now)) return { bloqueado: true, nome, avatar: null };
    const meu = profileId ? this.porPerfil(profileId) : null;
    if (meu) return { bloqueado: false, nome: meu.apelido, avatar: meu.avatar };
    const dono = this.porApelido(nome);
    if (!dono) return { bloqueado: false, nome, avatar: null };
    for (let k = 2; k < 100; k++) {
      const suffix = ` ${k}`;
      const candidato = `${[...nome].slice(0, NAME_MAX_LENGTH - suffix.length).join('')}${suffix}`;
      if (!this.porApelido(candidato)) return { bloqueado: false, nome: candidato, avatar: null };
    }
    return { bloqueado: false, nome: 'Jogador', avatar: null };
  }

  // --- admin ---------------------------------------------------------------

  /** Espera antes de aceitar outra tentativa de senha do admin (0 = pode tentar). */
  async adminEspera(): Promise<number> {
    const ate = (await this.ctx.storage.get<number>('admin:espera')) ?? 0;
    return Math.max(0, ate - Date.now());
  }

  /** Registra uma tentativa de senha do admin: erros seguidos fazem esperar (como o PIN). */
  async adminTentativa(certa: boolean): Promise<void> {
    if (certa) {
      await this.ctx.storage.delete(['admin:erros', 'admin:espera']);
      return;
    }
    const erros = ((await this.ctx.storage.get<number>('admin:erros')) ?? 0) + 1;
    await this.ctx.storage.put('admin:erros', erros);
    const espera = pinWaitMs(erros);
    if (espera) await this.ctx.storage.put('admin:espera', Date.now() + espera);
  }

  async listar(): Promise<ContaAdmin[]> {
    const now = Date.now();
    const linhas = this.sql
      .exec<{ perfil: string; apelido: string | null; avatar: string | null; criado: number | null; ate: number | null; motivo: string | null }>(
        `SELECT perfil, apelido, avatar, criado, NULL AS ate, NULL AS motivo FROM apelidos
         UNION ALL
         SELECT perfil, NULL, NULL, NULL, ate, motivo FROM bloqueios WHERE ate > ?`,
        now,
      )
      .toArray();
    const porPerfil = new Map<string, ContaAdmin>();
    for (const l of linhas) {
      const c = porPerfil.get(l.perfil) ?? {
        profileId: l.perfil,
        apelido: null,
        avatar: null,
        guardadoEm: null,
        bloqueadoAte: null,
        motivo: null,
      };
      if (l.apelido !== null) Object.assign(c, { apelido: l.apelido, avatar: l.avatar, guardadoEm: l.criado });
      if (l.ate !== null) Object.assign(c, { bloqueadoAte: l.ate, motivo: l.motivo });
      porPerfil.set(l.perfil, c);
    }
    return [...porPerfil.values()];
  }

  /** Solta o apelido (a pessoa esqueceu o PIN, ou o apelido era impróprio). O perfil continua. */
  async liberar(profileId: string): Promise<void> {
    this.sql.exec('DELETE FROM apelidos WHERE perfil = ?', profileId);
  }

  /** Renomeia o apelido guardado (admin). */
  async renomear(profileId: string, apelido: string): Promise<'ok' | 'ocupado' | 'nao-existe'> {
    const dono = this.porApelido(apelido);
    if (dono && dono.perfil !== profileId) return 'ocupado';
    const r = this.sql.exec('UPDATE apelidos SET apelido = ?, apelido_key = ? WHERE perfil = ?', apelido, apelidoKey(apelido), profileId);
    return r.rowsWritten > 0 ? 'ok' : 'nao-existe';
  }

  /** Bloqueia por um tempo (ou para sempre, `ms = null`); `ms = 0` desbloqueia. */
  async bloquear(profileId: string, ms: number | null, motivo: string): Promise<void> {
    if (ms === 0) {
      this.sql.exec('DELETE FROM bloqueios WHERE perfil = ?', profileId);
      return;
    }
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO bloqueios (perfil, ate, motivo, criado) VALUES (?, ?, ?, ?)
       ON CONFLICT(perfil) DO UPDATE SET ate = excluded.ate, motivo = excluded.motivo`,
      profileId,
      ms === null ? PARA_SEMPRE : now + ms,
      motivo.slice(0, 200),
      now,
    );
  }
}

export function contasStub(env: Env) {
  return env.CONTAS.get(env.CONTAS.idFromName('contas'));
}
