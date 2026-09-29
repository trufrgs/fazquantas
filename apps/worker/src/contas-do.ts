import { DurableObject } from 'cloudflare:workers';
import { NAME_MAX_LENGTH } from '@fodinha/engine';
import { apelidoKey, hashPin, pinWaitMs, randomSalt } from './contas';

/** Resultado de guardar ou entrar com o apelido. */
export type ContaResultado =
  | {
      ok: true;
      profileKey: string;
      profileId: string;
      apelido: string;
      avatar: string;
      /** O perfil que o aparelho usava antes de entrar e que foi juntado a este (os dados dele vêm junto). */
      juntou?: string;
    }
  | { ok: false; erro: 'ocupado' | 'pin' | 'espera' | 'nao-existe' | 'bloqueado'; esperaMs?: number };

/** O que a sala usa ao sentar alguém: o nome que vale e se pode jogar. */
export interface Conferencia {
  bloqueado: boolean;
  nome: string;
  avatar: string | null;
  /** O perfil que vale (o aparelho juntado a outro perfil joga e pontua como ele). */
  perfil: string | null;
  /** O nome pedido é apelido guardado de outra pessoa: lugar novo não senta com ele. */
  apelidoDeOutro: boolean;
}

/** De quem é um apelido, para quem pergunta: ninguém guardou, é o dele, ou é de outra pessoa. */
export type DonoDoApelido = 'livre' | 'teu' | 'outro';

/** O que o aparelho fica sabendo ao abrir: o apelido guardado dele e, se foi juntado a outro perfil, a chave dele. */
export interface Meu {
  apelido: string;
  avatar: string;
  /** Chave do perfil guardado a que este aparelho foi juntado: o aparelho passa a usar esta. */
  chave?: string;
}

/** Por que não deu para juntar dois perfis. */
export type FalhaAoJuntar = 'mesmo' | 'destino-sem-apelido' | 'origem-com-apelido';

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
      CREATE TABLE IF NOT EXISTS ligacoes (
        perfil TEXT PRIMARY KEY,
        destino TEXT NOT NULL,
        criado INTEGER NOT NULL
      );
    `);
  }

  /**
   * O perfil que vale para este: o de destino, se ele foi juntado a outro (o admin juntou, ou a
   * pessoa entrou com o PIN neste aparelho); senão, ele mesmo.
   */
  private valendo(perfil: string): string {
    return this.sql.exec<{ destino: string }>('SELECT destino FROM ligacoes WHERE perfil = ?', perfil).toArray()[0]?.destino ?? perfil;
  }

  /**
   * Junta `origem` a `destino` (a mesma pessoa): daqui para frente, o aparelho da origem joga e
   * pontua como o destino, e ao abrir o jogo recebe a chave dele. O destino precisa ter apelido
   * guardado (é de onde sai a chave), e a origem, não (dois apelidos não viram um sem escolher qual).
   */
  private ligar(origem: string, destino: string): FalhaAoJuntar | null {
    const alvo = this.valendo(destino);
    if (origem === alvo) return 'mesmo';
    if (!this.porPerfil(alvo)) return 'destino-sem-apelido';
    if (this.porPerfil(origem)) return 'origem-com-apelido';
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO ligacoes (perfil, destino, criado) VALUES (?, ?, ?)
         ON CONFLICT(perfil) DO UPDATE SET destino = excluded.destino`,
        origem,
        alvo,
        Date.now(),
      );
      // Quem já estava juntado à origem passa a apontar direto para o destino (sem corrente).
      this.sql.exec('UPDATE ligacoes SET destino = ? WHERE destino = ?', alvo, origem);
    });
    return null;
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

  /**
   * Outro aparelho: apelido + PIN devolvem a chave do perfil (o aparelho passa a ser a mesma pessoa).
   * Com `anterior` (o perfil que o aparelho usava, jogando com esse mesmo apelido), o anterior é
   * juntado a este: os pontos e as visitas dele vêm junto, e ele não vira outro jogador.
   */
  async entrar(apelido: string, pin: string, anterior: string | null = null): Promise<ContaResultado> {
    const now = Date.now();
    const linha = this.porApelido(apelido);
    if (!linha) return { ok: false, erro: 'nao-existe' };
    const falha = await this.conferirPin(linha, pin, now);
    if (falha) return falha;
    if (this.bloqueadoAte(linha.perfil, now)) return { ok: false, erro: 'bloqueado' };
    const juntou = anterior && this.ligar(anterior, linha.perfil) === null ? anterior : undefined;
    return { ok: true, profileKey: linha.chave, profileId: linha.perfil, apelido: linha.apelido, avatar: linha.avatar, ...(juntou ? { juntou } : {}) };
  }

  /** O avatar escolhido vale em todos os aparelhos do perfil guardado. */
  async trocarAvatar(profileId: string, avatar: string): Promise<boolean> {
    return this.sql.exec('UPDATE apelidos SET avatar = ? WHERE perfil = ?', avatar, profileId).rowsWritten > 0;
  }

  /**
   * O apelido deste perfil (para a tela de ajustes saber se já está guardado). Aparelho juntado a
   * outro perfil recebe também a chave dele, e passa a usá-la.
   */
  async meu(profileId: string): Promise<Meu | null> {
    const valendo = this.valendo(profileId);
    const l = this.porPerfil(valendo);
    if (!l) return null;
    return { apelido: l.apelido, avatar: l.avatar, ...(valendo !== profileId ? { chave: l.chave } : {}) };
  }

  /** O perfil que vale para este (o de destino, se ele foi juntado a outro). */
  async perfilValendo(profileId: string): Promise<string> {
    return this.valendo(profileId);
  }

  /** De quem é o apelido, para o perfil que pergunta (o jogo avisa antes de alguém tentar sentar com ele). */
  async donoDoApelido(profileId: string | null, apelido: string): Promise<DonoDoApelido> {
    const dono = this.porApelido(apelido);
    if (!dono) return 'livre';
    return profileId && this.valendo(profileId) === dono.perfil ? 'teu' : 'outro';
  }

  /**
   * Na hora de sentar: perfil guardado (ou juntado a um) usa o apelido e o avatar dele; perfil
   * bloqueado não senta; nome que é apelido guardado de outra pessoa vem marcado (lugar novo não
   * senta com ele) e com número ("Thomas 2"), que é o nome de quem sentou assim antes e volta ao lugar.
   */
  async conferir(profileId: string | null, nome: string): Promise<Conferencia> {
    const now = Date.now();
    const perfil = profileId ? this.valendo(profileId) : null;
    if ((profileId && this.bloqueadoAte(profileId, now)) || (perfil && this.bloqueadoAte(perfil, now))) {
      return { bloqueado: true, nome, avatar: null, perfil, apelidoDeOutro: false };
    }
    const meu = perfil ? this.porPerfil(perfil) : null;
    if (meu) return { bloqueado: false, nome: meu.apelido, avatar: meu.avatar, perfil, apelidoDeOutro: false };
    const dono = this.porApelido(nome);
    if (!dono) return { bloqueado: false, nome, avatar: null, perfil, apelidoDeOutro: false };
    for (let k = 2; k < 100; k++) {
      const suffix = ` ${k}`;
      const candidato = `${[...nome].slice(0, NAME_MAX_LENGTH - suffix.length).join('')}${suffix}`;
      if (!this.porApelido(candidato)) return { bloqueado: false, nome: candidato, avatar: null, perfil, apelidoDeOutro: true };
    }
    return { bloqueado: false, nome: 'Jogador', avatar: null, perfil, apelidoDeOutro: true };
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

  /**
   * Admin: junta `origem` a `destino` (a mesma pessoa em outro aparelho). A origem passa a jogar,
   * pontuar e aparecer como o destino; o ranking e as visitas são juntados pela rota.
   */
  async juntar(origem: string, destino: string): Promise<{ ok: true; destino: string } | { ok: false; erro: FalhaAoJuntar }> {
    const erro = this.ligar(origem, destino);
    return erro ? { ok: false, erro } : { ok: true, destino: this.valendo(destino) };
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

/** Nome do objeto das contas: trocar começa do zero (foi assim que os apelidos de teste ficaram para trás). */
export const CONTAS_NOME = 'lancamento';

export function contasStub(env: Env) {
  return env.CONTAS.get(env.CONTAS.idFromName(CONTAS_NOME));
}
