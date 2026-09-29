import { useState } from 'react';
import { Segmented } from '../ui/Controls';
import { Panel } from '../ui/ScreenFrame';
import { hora, type Dados } from './tipos';

type Quem = 'tudo' | 'admin' | 'automacao';

/** O que o admin e a automação fizeram (180 dias), com os perfis trocados pelo nome. */
export function Historico({ dados }: { dados: Dados }) {
  const [quem, setQuem] = useState<Quem>('tudo');
  const nomes = new Map<string, string>();
  for (const j of dados.painel.jogadores) nomes.set(j.profileId, j.nome);
  for (const r of dados.ranking) nomes.set(r.profileId, r.nome);
  for (const c of dados.contas) if (c.apelido) nomes.set(c.profileId, c.apelido);
  const lista = (dados.painel.auditoria ?? []).filter(
    (a) => quem === 'tudo' || (quem === 'admin' ? a.acao.startsWith('admin') : a.acao.startsWith('automação')),
  );
  return (
    <Panel title="Histórico">
      <div className="mb-3">
        <Segmented<Quem>
          label="De quem"
          value={quem}
          onChange={setQuem}
          options={[
            { value: 'tudo', label: 'Tudo' },
            { value: 'admin', label: 'Admin' },
            { value: 'automacao', label: 'Automação' },
          ]}
        />
      </div>
      {lista.length === 0 ? (
        <p className="text-tinta-2">Nada ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-tinta/10 text-sm">
          {lista.map((a, i) => (
            <li key={`${a.quando}-${i}`} className="flex flex-wrap gap-x-2 py-1.5">
              <span className="text-tinta-2 tabular-nums">{hora(a.quando)}</span>
              {quem === 'tudo' && (
                <span className={`rounded-full px-2 text-xs leading-5 font-semibold ${a.acao.startsWith('admin') ? 'bg-espadas/15' : 'bg-paus/15'}`}>
                  {a.acao.startsWith('admin') ? 'admin' : 'automação'}
                </span>
              )}
              <strong>{a.acao.replace(/^(admin|automação): /, '')}</strong>
              {a.alvo && <span>{nomes.get(a.alvo) ?? a.alvo}</span>}
              {a.detalhe && <span className="text-tinta-2">· {a.detalhe}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
