import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { forgetRoom, knownRooms, type SalaConhecida } from '../../lib/minhas-salas';
import { serverUrl } from '../../lib/platform';

interface InfoSala {
  exists: boolean;
  status?: 'lobby' | 'playing' | 'finished';
  async?: boolean;
  turn?: { playerId: string; name: string; deadline: number | null } | null;
}

export interface SalaNaLista extends SalaConhecida {
  info: InfoSala;
  yourTurn: boolean;
  /** Não deu para perguntar ao servidor agora (sem rede): a sala fica na lista, sem a situação. */
  semRede?: boolean;
}

/** "até 21:40", "até amanhã 09:15" ou "até sex. 09:15" (hora deste aparelho). */
export function untilLabel(deadline: number, now = Date.now()): string {
  const d = new Date(deadline);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const day = (t: Date) => t.toDateString();
  if (day(d) === day(new Date(now))) return `até ${hora}`;
  if (day(d) === day(new Date(now + 86_400_000))) return `até amanhã ${hora}`;
  return `até ${d.toLocaleDateString('pt-BR', { weekday: 'short' })} ${hora}`;
}

/**
 * As salas em que a pessoa tem lugar, com a situação de cada uma (lobby, de quem é a vez). Sala
 * que acabou sai da lista sozinha.
 */
export function useTuasSalas(): SalaNaLista[] | null {
  const [list, setList] = useState<SalaNaLista[] | null>(null);
  useEffect(() => {
    let alive = true;
    const rooms = knownRooms();
    void Promise.all(
      rooms.map(async (r) => {
        try {
          const res = await fetch(`${serverUrl()}/api/salas/${r.code}/info`);
          if (res.status === 404) return { ...r, info: { exists: false }, yourTurn: false };
          if (!res.ok) throw new Error(`info ${res.status}`);
          const info = (await res.json()) as InfoSala;
          return { ...r, info, yourTurn: info.turn?.playerId === r.playerId };
        } catch {
          // Sem rede (ou servidor fora do ar): a sala segue na lista, e o toque tenta voltar.
          return { ...r, info: { exists: true }, yourTurn: false, semRede: true };
        }
      }),
    ).then((all) => {
      if (!alive) return;
      const out: SalaNaLista[] = [];
      for (const r of all) {
        if (!r.info.exists) forgetRoom(r.code);
        else out.push(r);
      }
      // A tua vez primeiro; depois as mais recentes.
      out.sort((a, b) => Number(b.yourTurn) - Number(a.yourTurn) || b.at - a.at);
      setList(out);
    });
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

function situacao(r: SalaNaLista): string {
  const { info } = r;
  if (r.semRede) return 'Sem conexão agora: toca pra tentar voltar';
  if (info.status === 'lobby') return 'Esperando começar';
  if (info.status === 'finished') return 'Partida terminada';
  if (!info.turn) return 'Partida andando';
  const prazo = info.turn.deadline && info.async ? ` · ${untilLabel(info.turn.deadline)}` : '';
  return r.yourTurn ? `Tua vez${prazo}` : `Vez de ${info.turn.name}${prazo}`;
}

/** Lista "Tuas salas": toque volta para a sala, no mesmo lugar. */
export function TuasSalas({ rooms, onOpen, busy }: { rooms: SalaNaLista[]; onOpen: (code: string) => void; busy?: boolean }) {
  return (
    <ul className="flex flex-col divide-y divide-tinta/10">
      {rooms.map((r) => (
        <li key={r.code}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpen(r.code)}
            className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-60"
          >
            <span className="font-display text-2xl font-bold tracking-[0.2em]">{r.code}</span>
            <span className="flex-1">
              <span className={`block font-semibold ${r.yourTurn ? 'text-copas' : ''}`}>{situacao(r)}</span>
              {r.info.async && <span className="block text-sm text-tinta-2">Cada um no seu tempo</span>}
            </span>
            <ChevronRight size="1.2rem" className="text-tinta/40" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
