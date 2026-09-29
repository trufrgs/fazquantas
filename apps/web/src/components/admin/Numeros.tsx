import { Panel } from '../ui/ScreenFrame';
import { hora, type Dados, type Dia } from './tipos';

const CF_DASH = 'https://dash.cloudflare.com/ab4076f6314069d75d44c7159e1fd2af/workers/services/view/fazquantas-api/production';

export function Numero({ valor, rotulo }: { valor: number | string; rotulo: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-3xl font-bold tabular-nums">{valor}</span>
      <span className="text-sm text-tinta-2">{rotulo}</span>
    </div>
  );
}

/** Barras dos últimos 30 dias (pessoas por dia), na mesma escala. */
function Barras({ dias }: { dias: Dia[] }) {
  const max = Math.max(1, ...dias.map((d) => d.pessoas));
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label="Pessoas por dia nos últimos 30 dias">
        {dias.map((d) => (
          <div
            key={d.dia}
            title={`${d.dia.slice(8)}/${d.dia.slice(5, 7)}: ${d.pessoas} pessoas, ${d.partidas} partidas`}
            className="flex-1 rounded-t bg-espadas"
            style={{ height: `${(d.pessoas / max) * 100}%`, minHeight: d.pessoas ? 3 : 1, opacity: d.pessoas ? 1 : 0.25 }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-tinta-2 tabular-nums">
        <span>{dias[0] ? `${dias[0].dia.slice(8)}/${dias[0].dia.slice(5, 7)}` : ''}</span>
        <span>máx. {max} pessoas/dia</span>
        <span>hoje</span>
      </div>
    </div>
  );
}

/** Uso: hoje, a semana, os 30 dias, de onde, e os acessos um a um. */
export function Numeros({ dados }: { dados: Dados }) {
  const p = dados.painel;
  const hoje = p.dias.at(-1);
  const semana = p.dias.slice(-7);
  const soma = (k: keyof Dia) => semana.reduce((n, d) => n + ((d[k] as number | undefined) ?? 0), 0);
  return (
    <>
      <Panel title="Hoje">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Numero valor={hoje?.pessoas ?? 0} rotulo="pessoas abriram o jogo" />
          <Numero valor={hoje?.salas ?? 0} rotulo="salas criadas" />
          <Numero valor={hoje?.partidas ?? 0} rotulo="partidas começadas" />
          <Numero valor={hoje?.partidasFim ?? 0} rotulo="partidas até o fim" />
          <Numero valor={hoje?.avisos ?? 0} rotulo="avisos por push" />
          <Numero valor={hoje?.recusadas ?? 0} rotulo="salas barradas pelo limite" />
        </div>
      </Panel>
      <Panel title="Últimos 7 dias">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Numero
            valor={new Set(p.acessos.filter((a) => semana.some((d) => d.dia === a.dia)).map((a) => a.profileId)).size}
            rotulo="pessoas diferentes"
          />
          <Numero valor={soma('salas')} rotulo="salas criadas" />
          <Numero valor={soma('partidasFim')} rotulo="partidas até o fim" />
          <Numero valor={soma('ranqueadas')} rotulo="valendo ranking" />
        </div>
      </Panel>
      <Panel title="Pessoas por dia (30 dias)">
        <Barras dias={p.dias} />
      </Panel>
      <Panel title="De onde">
        <p className="text-sm">{p.paises.length ? p.paises.map((x) => `${x.pais || '??'}: ${x.pessoas}`).join(' · ') : 'Ninguém ainda.'}</p>
        <p className="mt-3 text-sm text-tinta-2">
          Uso do plano gratuito (requisições, CPU, Durable Objects):{' '}
          <a href={CF_DASH} target="_blank" rel="noreferrer" className="font-semibold text-espadas underline">
            painel do Worker no Cloudflare
          </a>
          .
        </p>
      </Panel>
      <Panel title="Acessos recentes">
        <p className="mb-2 text-sm text-tinta-2">Um por pessoa por dia, hora de Brasília. IP sem o final (mostra a região e o provedor, não a casa).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="text-tinta-2">
              <tr>
                <th className="py-1 pr-3 font-semibold">Quando</th>
                <th className="py-1 pr-3 font-semibold">Quem</th>
                <th className="py-1 pr-3 font-semibold">Onde</th>
                <th className="py-1 pr-3 font-semibold">IP</th>
                <th className="py-1 pr-3 font-semibold">Aparelho</th>
                <th className="py-1 font-semibold">Vezes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tinta/10">
              {p.acessos.map((a) => (
                <tr key={`${a.dia}-${a.profileId}`}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{hora(a.ultima)}</td>
                  <td className="py-1.5 pr-3">{a.nome || <code>{a.profileId.slice(0, 8)}</code>}</td>
                  <td className="py-1.5 pr-3">{[a.cidade, a.pais].filter(Boolean).join(', ')}</td>
                  <td className="py-1.5 pr-3 font-mono">{a.ip}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{a.aparelho}</td>
                  <td className="py-1.5">{a.vezes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
