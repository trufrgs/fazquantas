import { useState } from 'react';
import { Button } from '../ui/Button';
import { Panel } from '../ui/ScreenFrame';
import { Numero } from './Numeros';
import { Jogadores as PessoasDaSala } from './Salas';
import {
  estaParada,
  hora,
  plural,
  resumoRodada,
  situacao,
  soHora,
  STATUS,
  ultimaAtividade,
  type Aba,
  type Dados,
  type FiltroSalas,
  type RodadaAutomacao,
  type RodarAcao,
} from './tipos';

interface Alerta {
  tom: 'ruim' | 'atencao' | 'info';
  texto: string;
  botao?: { rotulo: string; fazer: () => void };
}

const TOM: Record<Alerta['tom'], string> = {
  ruim: 'bg-copas/12 ring-copas/40',
  atencao: 'bg-ouros/20 ring-ouros-escuro/40',
  info: 'bg-espadas/10 ring-espadas/30',
};

/** A automação roda a cada 15 min; passou disso com folga, algo está errado com o cron. */
const AUTOMACAO_ATRASADA_MS = 40 * 60_000;

/** O que o admin olha primeiro: o que pede atenção, quem está jogando e o recado para todos. */
export function Agora({
  dados,
  agora,
  acao,
  irPara,
}: {
  dados: Dados;
  agora: number;
  acao: RodarAcao;
  irPara: (aba: Aba, filtro?: FiltroSalas) => void;
}) {
  const [recado, setRecado] = useState('');
  const p = dados.painel;
  const hoje = p.dias.at(-1);
  const abertas = p.salasAbertas;
  const conectados = abertas.reduce((n, s) => n + s.conectados, 0);
  const aoVivo = abertas.filter((s) => !s.assincrona).length;
  const paradas = abertas.filter((s) => estaParada(s, agora));
  const rodar = () =>
    void acao('/api/admin/automacao/rodar', {}, (r) => `Automação rodou: ${resumoRodada(r.rodada as RodadaAutomacao)}.`);

  const alertas: Alerta[] = [];
  if (p.manutencao?.ativa) {
    alertas.push({
      tom: 'ruim',
      texto: `Manutenção ligada${p.manutencao.desde ? ` desde ${soHora(p.manutencao.desde)} BRT` : ''}: ninguém cria sala nova.`,
      botao: { rotulo: 'Desligar', fazer: () => void acao('/api/admin/manutencao', { ativa: false }, 'Manutenção desligada: dá para criar sala de novo.') },
    });
  }
  const ultima = p.ultimaAutomacao;
  if (!ultima) {
    alertas.push({ tom: 'info', texto: 'A automação ainda não rodou (ela roda a cada 15 min).', botao: { rotulo: 'Rodar agora', fazer: rodar } });
  } else if (agora - ultima.quando > AUTOMACAO_ATRASADA_MS) {
    alertas.push({
      tom: 'ruim',
      texto: `A automação não roda desde ${hora(ultima.quando)} BRT (devia rodar a cada 15 min). Confere os crons do Worker no Cloudflare.`,
      botao: { rotulo: 'Rodar agora', fazer: rodar },
    });
  }
  if (paradas.length) {
    alertas.push({
      tom: 'atencao',
      texto: `${plural(paradas.length, 'mesa parada', 'mesas paradas')} além do prazo, sem ninguém conectado.`,
      botao: { rotulo: 'Ver', fazer: () => irPara('salas', 'paradas') },
    });
  }
  const recusadas = hoje?.recusadas ?? 0;
  if (recusadas) {
    alertas.push({
      tom: 'info',
      texto: `${plural(recusadas, 'sala barrada', 'salas barradas')} hoje pelo limite de salas por endereço.`,
      botao: { rotulo: 'Ajustar', fazer: () => irPara('automacao') },
    });
  }

  // As mesas com gente conectada primeiro; depois, as mexidas por último.
  const mesas = [...abertas].sort((a, b) => b.conectados - a.conectados || ultimaAtividade(b) - ultimaAtividade(a)).slice(0, 8);

  return (
    <>
      <Panel title="Pede atenção">
        {alertas.length === 0 ? (
          <p className="text-tinta-2">
            Tudo em ordem.{ultima ? ` A automação rodou às ${soHora(ultima.quando)} BRT: ${resumoRodada(ultima)}.` : ''}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alertas.map((a) => (
              <li key={a.texto} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-2 ring-1 ${TOM[a.tom]}`}>
                <span className="min-w-0 flex-1 font-semibold">{a.texto}</span>
                {a.botao && (
                  <Button size="sm" onClick={a.botao.fazer}>
                    {a.botao.rotulo}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Agora">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Numero valor={conectados} rotulo={conectados === 1 ? 'pessoa na mesa' : 'pessoas na mesa'} />
          <Numero valor={abertas.length} rotulo={`salas abertas (${aoVivo} ao vivo)`} />
          <Numero valor={hoje?.pessoas ?? 0} rotulo="pessoas hoje" />
          <Numero valor={hoje?.partidas ?? 0} rotulo="partidas hoje" />
        </div>
      </Panel>

      <Panel title="Mesas">
        {mesas.length === 0 ? (
          <p className="text-tinta-2">Nenhuma sala aberta.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-tinta/10">
            {mesas.map((s) => (
              <li key={s.code} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span className="font-display text-xl font-bold tracking-[0.18em]">{s.code}</span>
                <span className="text-sm text-tinta-2">
                  {STATUS[s.status] ?? s.status}
                  {s.assincrona ? ' · no seu tempo' : ''} · {situacao(agora - ultimaAtividade(s))}
                </span>
                <PessoasDaSala sala={s} />
              </li>
            ))}
          </ul>
        )}
        {abertas.length > mesas.length && (
          <Button size="sm" className="mt-2" onClick={() => irPara('salas')}>
            Ver as {abertas.length} salas
          </Button>
        )}
      </Panel>

      <Panel title="Recado para todas as mesas">
        <p className="mb-2 text-sm text-tinta-2">Aparece no topo da mesa de quem está jogando (e no lobby). Bom para avisar de manutenção.</p>
        <textarea
          value={recado}
          onChange={(e) => setRecado(e.target.value.slice(0, 240))}
          rows={2}
          placeholder="Ex.: Buenas! Daqui a 10 min o jogo reinicia rapidinho, ninguém perde a mesa."
          aria-label="Recado para todas as mesas"
          className="w-full rounded-2xl border-0 bg-white/70 px-4 py-3 text-tinta shadow-inner ring-1 ring-tinta/15 outline-none focus:ring-2 focus:ring-espadas"
        />
        <Button
          size="sm"
          variant="ouro"
          className="mt-2"
          disabled={!recado.trim() || abertas.length === 0}
          onClick={async () => {
            const r = await acao('/api/admin/salas/avisar', { todas: true, texto: recado }, (d) =>
              `Recado entregue a ${plural(Number(d.pessoas ?? 0), 'pessoa', 'pessoas')} em ${plural(Number(d.salas ?? 0), 'mesa', 'mesas')}.`,
            );
            if (r?.ok) setRecado('');
          }}
        >
          {abertas.length === 0 ? 'Nenhuma mesa aberta' : `Mandar para ${plural(abertas.length, 'mesa', 'mesas')}`}
        </Button>
      </Panel>
    </>
  );
}
