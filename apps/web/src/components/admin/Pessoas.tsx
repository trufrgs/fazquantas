import { useMemo, useState } from 'react';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Panel } from '../ui/ScreenFrame';
import { Confirmar } from './Confirmar';
import { hora, type Dados, type RodarAcao } from './tipos';

/** Os jogadores (quem abriu o jogo, quem guardou apelido, quem está no ranking) e o que dá para fazer com cada um. */
export function Pessoas({ dados, agora, acao }: { dados: Dados; agora: number; acao: RodarAcao }) {
  const [busca, setBusca] = useState('');
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);

  const jogadores = useMemo(() => {
    const contas = new Map(dados.contas.map((c) => [c.profileId, c]));
    const ranking = new Map(dados.ranking.map((r) => [r.profileId, r]));
    const mesa = new Map((dados.painel.naMesa ?? []).map((m) => [m.perfil, m]));
    const visto = new Map(dados.painel.jogadores.map((j) => [j.profileId, j]));
    const ids = new Set([...visto.keys(), ...contas.keys(), ...ranking.keys()]);
    const termo = busca.trim().toLowerCase();
    return [...ids]
      .map((id) => ({ id, visto: visto.get(id), conta: contas.get(id), rank: ranking.get(id), mesa: mesa.get(id) }))
      .map((j) => ({ ...j, nome: j.conta?.apelido ?? j.rank?.nome ?? j.visto?.nome ?? '(sem nome)' }))
      .filter((j) => !termo || j.nome.toLowerCase().includes(termo) || j.id.toLowerCase().startsWith(termo) || j.mesa?.code.toLowerCase() === termo)
      .sort((a, b) => Number(!!b.mesa) - Number(!!a.mesa) || (b.visto?.ultima ?? 0) - (a.visto?.ultima ?? 0));
  }, [dados, busca]);

  const perfil = (id: string, body: object, pronto: string) => acao('/api/admin/perfil', { profileId: id, ...body }, pronto);

  return (
    <Panel title={`Jogadores (${jogadores.length})`}>
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome, código do perfil ou da sala"
        aria-label="Buscar jogador"
        className="mb-2 h-11 w-full rounded-2xl border-0 bg-white/70 px-4 text-tinta shadow-inner ring-1 ring-tinta/15 outline-none focus:ring-2 focus:ring-espadas"
      />
      <ul className="flex flex-col divide-y divide-tinta/10">
        {jogadores.map((j) => {
          const bloqueado = !!j.conta?.bloqueadoAte && j.conta.bloqueadoAte > agora;
          return (
            <li key={j.id} className="flex flex-col gap-1.5 py-3">
              <div className="flex items-center gap-3">
                <Avatar seed={j.conta?.avatar ?? j.visto?.avatar ?? j.id} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {j.nome}
                    {j.conta?.apelido ? ' · apelido guardado' : ''}
                    {bloqueado ? ` · BLOQUEADO${j.conta?.bloqueadoAte && j.conta.bloqueadoAte < agora + 3650 * 86_400_000 ? ` até ${hora(j.conta.bloqueadoAte)}` : ''}` : ''}
                  </p>
                  <p className="text-sm text-tinta-2">
                    {j.mesa && (
                      <strong className={j.mesa.conectado ? 'text-paus' : ''}>
                        na sala {j.mesa.code}
                        {j.mesa.conectado ? '' : ' (caiu)'} ·{' '}
                      </strong>
                    )}
                    <code>{j.id.slice(0, 8)}</code>
                    {j.rank ? ` · ${j.rank.pontos} pts, ${j.rank.vitorias} vitórias em ${j.rank.partidas}` : ''}
                    {j.visto ? ` · visto ${hora(j.visto.ultima)} (${j.visto.dias} dia${j.visto.dias > 1 ? 's' : ''}) · ${j.visto.cidade || j.visto.ip} · ${j.visto.aparelho}` : ''}
                  </p>
                  {bloqueado && j.conta?.motivo && <p className="text-sm text-copas">Motivo: {j.conta.motivo}</p>}
                </div>
              </div>
              {renomeando?.id === j.id ? (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await perfil(j.id, { acao: 'renomear', apelido: renomeando.nome }, `${j.nome} agora é ${renomeando.nome}.`);
                    if (r?.ok) setRenomeando(null);
                  }}
                >
                  <input
                    value={renomeando.nome}
                    onChange={(e) => setRenomeando({ id: j.id, nome: e.target.value })}
                    autoFocus
                    aria-label={`Novo apelido de ${j.nome}`}
                    className="h-10 min-w-0 flex-1 rounded-2xl border-0 bg-white/70 px-4 text-tinta shadow-inner ring-1 ring-tinta/15 outline-none focus:ring-2 focus:ring-espadas"
                  />
                  <Button size="sm" variant="ouro" type="submit" disabled={!renomeando.nome.trim()}>
                    Salvar
                  </Button>
                  <Button size="sm" onClick={() => setRenomeando(null)}>
                    Cancelar
                  </Button>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {j.conta?.apelido && (
                    <>
                      <Button size="sm" onClick={() => setRenomeando({ id: j.id, nome: j.conta?.apelido ?? '' })}>
                        Renomear
                      </Button>
                      <Button size="sm" onClick={() => void perfil(j.id, { acao: 'liberar-apelido' }, `Apelido de ${j.nome} liberado.`)}>
                        Liberar apelido
                      </Button>
                    </>
                  )}
                  {j.rank && (
                    <Confirmar confirmar="Tirar mesmo" onConfirm={() => void perfil(j.id, { acao: 'tirar-do-ranking' }, `${j.nome} saiu do ranking.`)}>
                      Tirar do ranking
                    </Confirmar>
                  )}
                  {bloqueado ? (
                    <Button size="sm" onClick={() => void perfil(j.id, { acao: 'desbloquear' }, `${j.nome} desbloqueado.`)}>
                      Desbloquear
                    </Button>
                  ) : (
                    <>
                      <Confirmar confirmar="Bloquear 7 dias" onConfirm={() => void perfil(j.id, { acao: 'bloquear', dias: 7 }, `${j.nome} bloqueado por 7 dias.`)}>
                        Bloquear 7 dias
                      </Confirmar>
                      <Confirmar confirmar="Bloquear de vez" onConfirm={() => void perfil(j.id, { acao: 'bloquear' }, `${j.nome} bloqueado.`)}>
                        Bloquear
                      </Confirmar>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
