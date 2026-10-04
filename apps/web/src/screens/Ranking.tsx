import {
  RANKING_PERIODS,
  profileIdFromKey,
  type RankingPeriod,
  type RankingResponse,
  type RankingScope,
  type TituloDaVergonha,
  type TituloNoMural,
} from '@fodinha/engine';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Segmented } from '../components/ui/Controls';
import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';
import { serverUrl } from '../lib/platform';
import { useSettings } from '../stores/settings';

/** Dia (AAAA-MM-DD) em Brasília de um instante, para pedir um período ao servidor. */
function brtDay(at: number): string {
  return new Date(at - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: RankingResponse };
type Loaded = { key: string; load: Load };

export function Ranking() {
  const profileKey = useSettings((s) => s.profileKey);
  const [period, setPeriod] = useState<RankingPeriod>('semana');
  const [scope, setScope] = useState<RankingScope>('turma');
  const [at, setAt] = useState(() => Date.now());
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    void profileIdFromKey(profileKey).then(setProfileId);
  }, [profileKey]);

  const query = profileId
    ? new URLSearchParams({ periodo: period, escopo: scope, perfil: profileId, data: brtDay(at) }).toString()
    : null;

  useEffect(() => {
    if (!query) return undefined;
    const ctrl = new AbortController();
    fetch(`${serverUrl()}/api/ranking?${query}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        setLoaded({ key: query, load: { state: 'ok', data: (await r.json()) as RankingResponse } });
      })
      .catch((error: unknown) => {
        if (ctrl.signal.aborted) return;
        setLoaded({
          key: query,
          load: {
            state: 'error',
            message: error instanceof TypeError ? 'Sem conexão com o servidor.' : 'Não deu pra carregar o ranking.',
          },
        });
      });
    return () => ctrl.abort();
  }, [query]);

  // Resposta de outra consulta (trocou o período) conta como carregando.
  const load: Load = loaded && loaded.key === query ? loaded.load : { state: 'loading' };
  const data = load.state === 'ok' ? load.data : null;
  const range = data?.range;

  return (
    <ScreenFrame title="Ranking">
      <div className="flex flex-col gap-2">
        <Segmented<RankingPeriod>
          label="Período"
          dark
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setAt(Date.now());
          }}
          options={RANKING_PERIODS.map((p) => ({ value: p.id, label: p.label }))}
        />
        <Segmented<RankingScope>
          label="Quem aparece"
          dark
          value={scope}
          onChange={setScope}
          options={[
            { value: 'turma', label: 'Minha turma' },
            { value: 'geral', label: 'Todo mundo' },
          ]}
        />
      </div>

      <Panel>
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-tinta/8 disabled:opacity-30"
            aria-label="Período anterior"
            disabled={!range?.prev}
            onClick={() => range?.prev && setAt(range.prev)}
          >
            <ChevronLeft size="1.25rem" />
          </button>
          <h2 className="flex-1 text-center font-display text-xl font-bold" style={{ fontVariationSettings: '"SOFT" 100' }}>
            {range?.label ?? '…'}
          </h2>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-tinta/8 disabled:opacity-30"
            aria-label="Próximo período"
            disabled={!range?.next}
            onClick={() => range?.next && setAt(range.next)}
          >
            <ChevronRight size="1.25rem" />
          </button>
        </div>

        {load.state === 'loading' && <p className="py-6 text-center text-tinta-2">Carregando…</p>}
        {load.state === 'error' && (
          <p role="alert" className="py-6 text-center font-semibold text-copas">
            {load.message}
          </p>
        )}
        {data && data.rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-tinta-2">
            <Trophy size="2rem" className="text-ouros-escuro" aria-hidden="true" />
            <p className="font-semibold text-tinta">Ninguém pontuou ainda.</p>
            <p className="text-sm">
              Só entram partidas online marcadas <strong>Valendo ranking</strong> na sala, com pelo menos duas pessoas.
            </p>
          </div>
        )}
        {data && data.rows.length > 0 && (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-xs text-tinta-2">
                <th className="w-8 pb-1 font-semibold">#</th>
                <th className="pb-1 font-semibold">Jogador</th>
                <th className="w-12 pb-1 text-right font-semibold" title="Pontos">
                  Pts
                </th>
                <th className="w-9 pb-1 text-right font-semibold" title="Vitórias">
                  V
                </th>
                <th className="w-9 pb-1 text-right font-semibold" title="Partidas">
                  J
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.rows.map((row) => {
                const me = row.profileId === profileId;
                return (
                  <tr key={row.profileId} className={`border-t border-tinta/10 ${me ? 'bg-ouros/25 font-bold' : ''}`}>
                    <td className="py-2 font-display text-lg font-bold">{row.position}</td>
                    <td className="py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar seed={row.avatar || row.profileId} size={30} />
                        <span className="truncate">{me ? `${row.name} (tu)` : row.name}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right text-lg font-bold">{row.points}</td>
                    <td className="py-2 text-right">{row.wins}</td>
                    <td className="py-2 text-right text-tinta-2">{row.games}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {data && data.rows.length > 0 && !data.you && (
          <p className="mt-3 text-center text-sm text-tinta-2">Tu ainda não jogou nenhuma partida valendo neste período.</p>
        )}
        <p className="mt-3 text-sm text-tinta-2">
          Cada partida dá um ponto por pessoa que terminou atrás de ti. Bots não contam, e quem sai no meio fica em último.
          "Minha turma" mostra só quem já jogou uma partida valendo contigo.
        </p>
      </Panel>
      {data?.mural && data.mural.length > 0 && <MuralDaVergonha mural={data.mural} periodo={period} profileId={profileId} />}
    </ScreenFrame>
  );
}

/** O nome de cada título no mural, pelo período (a lanterna "da semana", "do mês"…). */
function nomeDoTitulo(t: TituloDaVergonha, periodo: RankingPeriod): string {
  const de = { semana: 'da semana', mes: 'do mês', ano: 'do ano', sempre: 'de todos os tempos' }[periodo];
  return { lanterna: `Lanterna ${de}`, fregues: 'Maior freguês', bituca: 'Recordista de bituca', virada: 'Virador de mesa' }[t];
}

function contaDoTitulo(t: TituloDaVergonha, n: number): string {
  const p = (um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  return {
    lanterna: p('vez em último', 'vezes em último'),
    fregues: p('carta morta', 'cartas mortas'),
    bituca: p('bituca de espera', 'bitucas de espera'),
    virada: p('mesa virada', 'mesas viradas'),
  }[t];
}

/**
 * O mural da vergonha (caderno de zoeira): ao lado dos pontos, os títulos que ninguém quer, pendurados
 * até alguém tomar o posto no período. Sai das partidas que valeram ranking.
 */
function MuralDaVergonha({ mural, periodo, profileId }: { mural: TituloNoMural[]; periodo: RankingPeriod; profileId: string | null }) {
  return (
    <Panel title="Mural da vergonha">
      <ul className="flex flex-col divide-y divide-tinta/10">
        {mural.map((t) => (
          <li key={t.titulo} className="flex items-center gap-3 py-2.5">
            <Avatar seed={t.avatar || t.profileId} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-tinta-2">{nomeDoTitulo(t.titulo, periodo)}</span>
              <span className="block truncate font-bold">{t.profileId === profileId ? `${t.name} (tu)` : t.name}</span>
            </span>
            <span className="shrink-0 font-hand text-lg leading-none text-copas">{contaDoTitulo(t.titulo, t.n)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-tinta-2">Fica pendurado até alguém tomar o posto.</p>
    </Panel>
  );
}
