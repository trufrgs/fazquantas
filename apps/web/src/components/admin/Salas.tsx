import { useState } from 'react';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Controls';
import { Panel } from '../ui/ScreenFrame';
import { Confirmar } from './Confirmar';
import {
  estaParada,
  HORA_MS,
  hora,
  plural,
  situacao,
  STATUS,
  ultimaAtividade,
  type Dados,
  type FiltroSalas,
  type Resposta,
  type RodarAcao,
  type Sala,
} from './tipos';

const FILTROS: { value: FiltroSalas; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'paradas', label: 'Paradas' },
  { value: 'vazias', label: 'Sem ninguém' },
  { value: 'aovivo', label: 'Ao vivo' },
  { value: 'assincronas', label: 'No seu tempo' },
];

/** Horas para "selecionar as paradas há mais de…". */
const HORAS = [1, 2, 3, 6, 12, 24, 48, 72];

function passa(s: Sala, filtro: FiltroSalas, agora: number): boolean {
  switch (filtro) {
    case 'paradas':
      return estaParada(s, agora);
    case 'vazias':
      return s.conectados === 0;
    case 'aovivo':
      return !s.assincrona;
    case 'assincronas':
      return s.assincrona;
    default:
      return true;
  }
}

/** Quem está sentado: ponto verde conectado, âmbar a mesa joga por ele, cinza caiu. */
export function Jogadores({ sala }: { sala: Sala }) {
  const pessoas = sala.jogadores ?? sala.humanos.map((nome) => ({ nome, perfil: null, conectado: false, ausente: false }));
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {pessoas.length === 0 && <span className="text-tinta-2">ninguém sentado</span>}
      {pessoas.map((j, i) => (
        <span key={`${j.nome}-${i}`} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full ${j.conectado ? 'bg-paus' : j.ausente ? 'bg-ouros' : 'bg-tinta/30'}`}
          />
          <span className="font-semibold">{j.nome}</span>
          <span className="sr-only">{j.conectado ? '(conectado)' : j.ausente ? '(a mesa joga por ele)' : '(desconectado)'}</span>
        </span>
      ))}
      {sala.bots > 0 && <span className="text-tinta-2">+ {plural(sala.bots, 'bot', 'bots')}</span>}
    </span>
  );
}

const resultadoEncerrar = (r: Resposta) => {
  const lista = (r.resultado as { code: string; encerrada: boolean }[] | undefined) ?? [];
  const ok = lista.filter((x) => x.encerrada).length;
  const sumidas = lista.length - ok;
  return `${plural(ok, 'mesa encerrada', 'mesas encerradas')}${sumidas ? ` (${sumidas} já não existia${sumidas > 1 ? 'm' : ''})` : ''}.`;
};

/**
 * As salas abertas, com filtro e seleção para agir em massa (encerrar, mandar recado), e as
 * encerradas da semana com o motivo.
 */
export function Salas({
  dados,
  agora,
  acao,
  filtro,
  setFiltro,
}: {
  dados: Dados;
  agora: number;
  acao: RodarAcao;
  filtro: FiltroSalas;
  setFiltro: (f: FiltroSalas) => void;
}) {
  const abertas = dados.painel.salasAbertas;
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const [modo, setModo] = useState<'encerrar' | 'recado' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [recado, setRecado] = useState('');
  const [horasIdx, setHorasIdx] = useState(1);

  const idle = (s: Sala) => agora - ultimaAtividade(s);
  const lista = abertas
    .filter((s) => passa(s, filtro, agora))
    .sort((a, b) => (filtro === 'paradas' ? idle(b) - idle(a) : idle(a) - idle(b)));
  // Só conta o que ainda está aberto (a lista recarrega sozinha).
  const escolhidas = abertas.filter((s) => sel.has(s.code)).map((s) => s.code);
  const horas = HORAS[horasIdx] ?? 2;
  const antigas = abertas.filter((s) => idle(s) >= horas * HORA_MS);

  const alternar = (code: string) =>
    setSel((atual) => {
      const nova = new Set(atual);
      if (nova.has(code)) nova.delete(code);
      else nova.add(code);
      return nova;
    });
  const limpar = () => {
    setSel(new Set());
    setModo(null);
  };
  const todasMarcadas = lista.length > 0 && lista.every((s) => sel.has(s.code));

  return (
    <>
      <Panel title={`Abertas (${abertas.length})`}>
        <div className="-mx-1 mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filtrar salas">
          {FILTROS.map((f) => {
            const n = abertas.filter((s) => passa(s, f.value, agora)).length;
            const ativo = f.value === filtro;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setFiltro(f.value)}
                className={`min-h-9 rounded-full px-3 text-sm font-semibold ring-1 transition ${
                  ativo ? 'bg-tinta text-papel ring-tinta' : 'bg-white/50 text-tinta ring-tinta/15'
                }`}
              >
                {f.label} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-tinta/5 px-3 py-2">
          <span className="text-sm font-semibold">Paradas há mais de</span>
          <Stepper
            label="horas paradas"
            value={horasIdx}
            min={0}
            max={HORAS.length - 1}
            onChange={setHorasIdx}
            format={(i) => `${HORAS[i]} h`}
          />
          <Button size="sm" disabled={antigas.length === 0} onClick={() => setSel(new Set(antigas.map((s) => s.code)))}>
            {antigas.length === 0 ? 'Nenhuma' : `Selecionar ${plural(antigas.length, 'mesa', 'mesas')}`}
          </Button>
        </div>

        {escolhidas.length > 0 && (
          <div role="region" aria-label="Ações nas selecionadas" className="sticky top-0 z-10 mb-3 flex flex-col gap-2 rounded-2xl bg-papel-2 px-3 py-2 shadow ring-1 ring-tinta/15">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-semibold">{plural(escolhidas.length, 'selecionada', 'selecionadas')}</span>
              <Button size="sm" variant="copas" onClick={() => setModo(modo === 'encerrar' ? null : 'encerrar')}>
                Encerrar
              </Button>
              <Button size="sm" onClick={() => setModo(modo === 'recado' ? null : 'recado')}>
                Mandar recado
              </Button>
              <Button size="sm" variant="vidro" onClick={limpar}>
                Limpar
              </Button>
            </div>
            {modo === 'encerrar' && (
              <div className="flex flex-col gap-2">
                <p className="text-sm">Quem estiver nessas mesas volta para o início com o aviso de que a sala foi encerrada. Não tem volta.</p>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value.slice(0, 120))}
                  placeholder="Motivo (fica no histórico). Ex.: mesas paradas"
                  aria-label="Motivo"
                  className="h-11 rounded-2xl border-0 bg-white/70 px-4 text-tinta shadow-inner ring-1 ring-tinta/15 outline-none focus:ring-2 focus:ring-espadas"
                />
                <Button
                  size="sm"
                  variant="copas"
                  onClick={async () => {
                    const r = await acao('/api/admin/salas/encerrar', { codes: escolhidas, motivo: motivo || 'encerrada pelo admin' }, resultadoEncerrar);
                    if (r?.ok) {
                      limpar();
                      setMotivo('');
                    }
                  }}
                >
                  Encerrar {plural(escolhidas.length, 'mesa', 'mesas')}
                </Button>
              </div>
            )}
            {modo === 'recado' && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={recado}
                  onChange={(e) => setRecado(e.target.value.slice(0, 240))}
                  rows={2}
                  placeholder="O recado aparece no topo da mesa"
                  aria-label="Recado para as mesas selecionadas"
                  className="rounded-2xl border-0 bg-white/70 px-4 py-3 text-tinta shadow-inner ring-1 ring-tinta/15 outline-none focus:ring-2 focus:ring-espadas"
                />
                <Button
                  size="sm"
                  variant="ouro"
                  disabled={!recado.trim()}
                  onClick={async () => {
                    const r = await acao('/api/admin/salas/avisar', { codes: escolhidas, texto: recado }, (d) =>
                      `Recado entregue a ${plural(Number(d.pessoas ?? 0), 'pessoa', 'pessoas')} em ${plural(Number(d.salas ?? 0), 'mesa', 'mesas')}.`,
                    );
                    if (r?.ok) {
                      setRecado('');
                      setModo(null);
                    }
                  }}
                >
                  Mandar para {plural(escolhidas.length, 'mesa', 'mesas')}
                </Button>
              </div>
            )}
          </div>
        )}

        {lista.length === 0 ? (
          <p className="text-tinta-2">{abertas.length === 0 ? 'Nenhuma sala aberta.' : 'Nenhuma sala nesse filtro.'}</p>
        ) : (
          <>
            <label className="mb-1 flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-espadas)]"
                checked={todasMarcadas}
                onChange={() => setSel(todasMarcadas ? new Set() : new Set(lista.map((s) => s.code)))}
              />
              Selecionar as {lista.length} desta lista
            </label>
            <ul className="flex flex-col divide-y divide-tinta/10">
              {lista.map((s) => (
                <li key={s.code} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--color-espadas)]"
                      checked={sel.has(s.code)}
                      onChange={() => alternar(s.code)}
                      aria-label={`Selecionar a sala ${s.code}`}
                    />
                    <span className="font-display text-2xl font-bold tracking-[0.2em]">{s.code}</span>
                  </label>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-semibold">
                      {STATUS[s.status] ?? s.status} · {situacao(idle(s))}
                    </span>
                    <Jogadores sala={s} />
                    <span className="text-sm text-tinta-2">
                      {s.assincrona ? 'cada um no seu tempo · ' : ''}
                      {s.ranqueada ? 'valendo ranking · ' : ''}
                      {s.senha ? 'com senha · ' : ''}
                      aberta {hora(s.criada)}
                    </span>
                  </span>
                  <Confirmar
                    confirmar={`Encerrar ${s.code}`}
                    onConfirm={() => void acao('/api/admin/salas/encerrar', { codes: [s.code], motivo: 'encerrada pelo admin' }, resultadoEncerrar)}
                  >
                    Encerrar
                  </Confirmar>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel title="Encerradas (7 dias)">
        {dados.painel.salasRecentes.length === 0 ? (
          <p className="text-tinta-2">Nenhuma.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-tinta/10 text-sm">
            {dados.painel.salasRecentes.slice(0, 60).map((s) => (
              <li key={`${s.code}-${s.encerrada}`} className="py-1.5">
                <strong className="tracking-[0.15em]">{s.code}</strong> · {s.humanos.join(', ') || 'ninguém'} · {hora(s.criada)} → {hora(s.encerrada ?? 0)} ·{' '}
                <span className="text-tinta-2">{s.motivo}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
