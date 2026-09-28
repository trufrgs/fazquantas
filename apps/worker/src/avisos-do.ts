import { DurableObject } from 'cloudflare:workers';
import { sendPush, type PushMessage, type PushSubscriptionJSON, type VapidKeys } from './push';

/** Assinaturas por perfil: um aparelho novo entra, os mais antigos saem acima disso. */
const MAX_PER_PROFILE = 5;
/** Um aviso por perfil a cada tanto (várias cartas seguidas não viram várias notificações). */
const MIN_GAP_MS = 4000;

/**
 * Avisos por push: guarda as assinaturas de cada perfil (SQLite) e manda a notificação quando uma
 * sala pede. Assinatura que o serviço diz que morreu (404/410) sai na hora.
 */
export class AvisosDO extends DurableObject<Env> {
  private readonly sql: SqlStorage;
  private readonly lastSent = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS assinaturas (
        endpoint TEXT PRIMARY KEY,
        perfil TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        criada INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS assinaturas_perfil ON assinaturas (perfil);
    `);
  }

  private keys(): VapidKeys | null {
    const privateKey = (this.env as unknown as { VAPID_PRIVADO?: string }).VAPID_PRIVADO;
    if (!privateKey || !this.env.VAPID_PUBLICO) return null;
    return { publicKey: this.env.VAPID_PUBLICO, privateKey, subject: this.env.VAPID_CONTATO };
  }

  async assinar(perfil: string, sub: PushSubscriptionJSON): Promise<void> {
    this.sql.exec(
      `INSERT INTO assinaturas (endpoint, perfil, p256dh, auth, criada) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET perfil = excluded.perfil, p256dh = excluded.p256dh, auth = excluded.auth, criada = excluded.criada`,
      sub.endpoint,
      perfil,
      sub.keys.p256dh,
      sub.keys.auth,
      Date.now(),
    );
    this.sql.exec(
      `DELETE FROM assinaturas WHERE perfil = ? AND endpoint NOT IN (
         SELECT endpoint FROM assinaturas WHERE perfil = ? ORDER BY criada DESC LIMIT ?)`,
      perfil,
      perfil,
      MAX_PER_PROFILE,
    );
  }

  async cancelar(perfil: string, endpoint: string): Promise<void> {
    this.sql.exec('DELETE FROM assinaturas WHERE perfil = ? AND endpoint = ?', perfil, endpoint);
  }

  /** Manda o aviso para todos os aparelhos do perfil. Devolve quantos aceitaram. */
  async enviar(perfil: string, msg: PushMessage): Promise<number> {
    const keys = this.keys();
    if (!keys) return 0;
    const now = Date.now();
    if (now - (this.lastSent.get(perfil) ?? 0) < MIN_GAP_MS) return 0;
    this.lastSent.set(perfil, now);
    const subs = this.sql
      .exec<{ endpoint: string; p256dh: string; auth: string }>('SELECT endpoint, p256dh, auth FROM assinaturas WHERE perfil = ?', perfil)
      .toArray();
    let ok = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          const status = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg, keys);
          if (status === 404 || status === 410) this.sql.exec('DELETE FROM assinaturas WHERE endpoint = ?', s.endpoint);
          else if (status < 300) ok += 1;
          else console.warn(`[push] ${status} de ${new URL(s.endpoint).host}`);
        } catch (error) {
          console.error('[push]', error);
        }
      }),
    );
    return ok;
  }
}
