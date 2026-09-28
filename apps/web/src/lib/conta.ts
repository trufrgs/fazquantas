import { useSettings } from '../stores/settings';
import { serverUrl } from './platform';

/**
 * Apelido guardado: o perfil nasce no aparelho (chave sorteada) e, com um PIN, o apelido fica
 * reservado e leva o perfil para outro aparelho. Aqui ficam as chamadas ao servidor.
 */

export type ContaFalha = { ok: false; mensagem: string; esperaMs?: number | null };
type ContaOk = { ok: true; profileKey: string; apelido: string; avatar: string };

async function post<T>(path: string, body: unknown): Promise<T | ContaFalha> {
  try {
    const res = await fetch(`${serverUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; mensagem?: string }) | null;
    if (!data) return { ok: false, mensagem: 'O servidor não respondeu direito. Tenta de novo.' };
    if (!res.ok || data.ok === false) return { ok: false, mensagem: data.mensagem ?? 'Não deu certo. Tenta de novo.', ...(data as object) } as ContaFalha;
    return data;
  } catch {
    return { ok: false, mensagem: 'Sem conexão com o servidor.' };
  }
}

/** Guarda (ou troca, com o PIN atual) o apelido e o avatar deste perfil. */
export async function guardarApelido(apelido: string, pin: string, novoPin?: string): Promise<true | ContaFalha> {
  const s = useSettings.getState();
  const r = await post<ContaOk>('/api/perfis/guardar', { profileKey: s.profileKey, apelido, avatar: s.avatar, pin, novoPin });
  if (!r.ok) return r;
  s.set({ name: r.apelido, claimed: r.apelido });
  return true;
}

/** Outro aparelho: apelido + PIN trazem o perfil guardado para cá. */
export async function entrarComApelido(apelido: string, pin: string): Promise<true | ContaFalha> {
  const r = await post<ContaOk>('/api/perfis/entrar', { apelido, pin });
  if (!r.ok) return r;
  useSettings.getState().set({ profileKey: r.profileKey, name: r.apelido, avatar: r.avatar, claimed: r.apelido });
  return true;
}

/** O avatar escolhido vale nos outros aparelhos do perfil guardado. */
export function sincronizarAvatar(avatar: string): void {
  const s = useSettings.getState();
  if (!s.claimed) return;
  void post('/api/perfis/avatar', { profileKey: s.profileKey, avatar });
}

/**
 * Ao abrir o jogo: conta a visita e confere o apelido guardado (se o admin soltou o apelido, este
 * aparelho fica sabendo; se o avatar mudou em outro aparelho, vem para cá).
 */
export async function aoAbrir(): Promise<void> {
  const s = useSettings.getState();
  void post('/api/oi', { profileKey: s.profileKey, name: s.name, avatar: s.avatar });
  const r = await post<{ ok: true; conta: { apelido: string; avatar: string } | null }>('/api/perfis/meu', { profileKey: s.profileKey });
  if (!r.ok) return;
  if (r.conta) s.set({ claimed: r.conta.apelido, name: r.conta.apelido, avatar: r.conta.avatar });
  else if (s.claimed) s.set({ claimed: null });
}

/** "Espera 15 min" a partir dos milissegundos que o servidor mandou. */
export function esperaTexto(ms: number | null | undefined): string {
  if (!ms) return '';
  const min = Math.ceil(ms / 60_000);
  return min >= 60 ? `Espera ${Math.ceil(min / 60)} h.` : `Espera ${min} min.`;
}
