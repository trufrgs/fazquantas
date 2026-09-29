import { apelidoKey } from '@fodinha/engine';
import { create } from 'zustand';
import { useSettings } from '../stores/settings';
import { serverUrl } from './platform';

/**
 * Apelido guardado: o perfil nasce no aparelho (chave sorteada) e, com um PIN, o apelido fica
 * reservado e leva o perfil para outro aparelho. Aqui ficam as chamadas ao servidor.
 */

export type ContaFalha = { ok: false; mensagem: string; esperaMs?: number | null };
type ContaOk = { ok: true; profileKey: string; apelido: string; avatar: string };

/** De quem é um apelido: ninguém guardou, é o deste aparelho, ou é de outra pessoa. */
export type DonoDoApelido = 'livre' | 'teu' | 'outro';

/** O que o servidor disse de cada apelido nesta sessão (pela chave de comparação: "Tomás" = "tomas"). */
const useDonos = create<Record<string, DonoDoApelido>>(() => ({}));

function marcarDono(nome: string, dono: DonoDoApelido): void {
  const k = apelidoKey(nome);
  if (k) useDonos.setState({ [k]: dono });
}

/** De quem é o apelido, pelo que o servidor já disse (`undefined`: ainda ninguém perguntou). */
export function useDonoDoApelido(nome: string): DonoDoApelido | undefined {
  return useDonos((d) => d[apelidoKey(nome)]);
}

/** Pergunta ao servidor de quem é o apelido (o jogo avisa antes de alguém tentar sentar com ele). */
export async function consultarApelido(nome: string): Promise<DonoDoApelido | null> {
  const r = await post<{ ok: true; dono: DonoDoApelido }>('/api/perfis/apelido', { profileKey: useSettings.getState().profileKey, apelido: nome });
  if (!r.ok) return null;
  marcarDono(nome, r.dono);
  return r.dono;
}

/** A sala recusou o apelido (é guardado por outra pessoa): as telas pedem o PIN ou outro apelido. */
export function apelidoRecusado(nome: string): void {
  marcarDono(nome, 'outro');
}

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
  marcarDono(r.apelido, 'teu');
  return true;
}

/**
 * Outro aparelho: apelido + PIN trazem o perfil guardado para cá. Se este aparelho jogava com esse
 * mesmo apelido (e sentava como "Thomas 2"), o perfil dele é juntado ao guardado: os pontos vêm junto.
 */
export async function entrarComApelido(apelido: string, pin: string): Promise<true | ContaFalha> {
  const s = useSettings.getState();
  const juntar = apelidoKey(s.name) === apelidoKey(apelido);
  const r = await post<ContaOk>('/api/perfis/entrar', { apelido, pin, profileKey: s.profileKey, juntar });
  if (!r.ok) return r;
  s.set({ profileKey: r.profileKey, name: r.apelido, avatar: r.avatar, claimed: r.apelido });
  marcarDono(r.apelido, 'teu');
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
 * aparelho fica sabendo; se o avatar mudou em outro aparelho, vem para cá; se o admin juntou este
 * aparelho a um perfil guardado, ele passa a usar a chave desse perfil) e de quem é o nome em uso.
 */
export async function aoAbrir(): Promise<void> {
  const s = useSettings.getState();
  void post('/api/oi', { profileKey: s.profileKey, name: s.name, avatar: s.avatar });
  const r = await post<{ ok: true; conta: { apelido: string; avatar: string; chave?: string } | null; dono: DonoDoApelido | null }>(
    '/api/perfis/meu',
    { profileKey: s.profileKey, apelido: s.name },
  );
  if (!r.ok) return;
  if (r.conta) {
    s.set({ ...(r.conta.chave ? { profileKey: r.conta.chave } : {}), claimed: r.conta.apelido, name: r.conta.apelido, avatar: r.conta.avatar });
    marcarDono(r.conta.apelido, 'teu');
    return;
  }
  if (s.claimed) s.set({ claimed: null });
  if (r.dono) marcarDono(s.name, r.dono);
}

/** "Espera 15 min" a partir dos milissegundos que o servidor mandou. */
export function esperaTexto(ms: number | null | undefined): string {
  if (!ms) return '';
  const min = Math.ceil(ms / 60_000);
  return min >= 60 ? `Espera ${Math.ceil(min / 60)} h.` : `Espera ${min} min.`;
}
