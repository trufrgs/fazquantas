import { LogOut, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Controls';
import { Panel } from '../components/ui/ScreenFrame';
import { serverUrl } from '../lib/platform';
import { storage } from '../lib/storage';

/**
 * Painel do dono do jogo (`/admin`): salas abertas (e encerrar), jogadores (apelido, bloqueio,
 * ranking), acessos por dia e números de uso. A senha é o segredo `ADMIN_SENHA` do Worker.
 */

const TOKEN_KEY = 'fodinha:admin';
const CF_DASH = 'https://dash.cloudflare.com/ab4076f6314069d75d44c7159e1fd2af/workers/services/view/fazquantas-api/production';

interface Sala {
  code: string;
  status: string;
  humanos: string[];
  bots: number;
  conectados: number;
  assincrona: boolean;
  ranqueada: boolean;
  senha: boolean;
  criada: number;
  atualizada?: number;
  encerrada?: number;
  motivo?: string;
}

interface Dia {
  dia: string;
  acessos: number;
  pessoas: number;
  salas: number;
  partidas: number;
  partidasFim: number;
  ranqueadas: number;
  avisos: number;
}

interface Acesso {
  dia: string;
  profileId: string;
  nome: string;
  avatar: string;
  ip: string;
  pais: string;
  cidade: string;
  aparelho: string;
  primeira: number;
  ultima: number;
  vezes: number;
}

interface Dados {
  painel: {
    hoje: string;
    dias: Dia[];
    salasAbertas: Sala[];
    salasRecentes: Sala[];
    acessos: Acesso[];
    paises: { pais: string; pessoas: number }[];
    jogadores: { profileId: string; nome: string; avatar: string; primeira: number; ultima: number; dias: number; ip: string; cidade: string; aparelho: string }[];
  };
  contas: { profileId: string; apelido: string | null; avatar: string | null; guardadoEm: number | null; bloqueadoAte: number | null; motivo: string | null }[];
  ranking: { profileId: string; nome: string; pontos: number; vitorias: number; partidas: number }[];
}

type Aba = 'resumo' | 'salas' | 'jogadores' | 'acessos';

async function api<T>(path: string, token: string | null, body: unknown = {}): Promise<{ status: number; data: T & { ok?: boolean; mensagem?: string } }> {
  const res = await fetch(`${serverUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => ({ ok: false }))) as T & { ok?: boolean; mensagem?: string } };
}

const hora = (t: number) =>
  new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<string, string> = { lobby: 'no lobby', playing: 'jogando', finished: 'partida terminada' };

function Numero({ valor, rotulo }: { valor: number | string; rotulo: string }) {
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

function Login({ onToken }: { onToken: (t: string) => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Admin do Faz quantas?">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await api<{ token?: string }>('/api/admin/entrar', null, { senha }).catch(() => null);
          setBusy(false);
          if (r?.data.ok && r.data.token) onToken(r.data.token);
          else setErro(r?.data.mensagem ?? 'Sem conexão com o servidor.');
        }}
      >
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoFocus
          autoComplete="current-password"
          placeholder="Senha do admin"
          aria-label="Senha do admin"
          className="h-12 rounded-2xl border-0 bg-white/70 px-4 text-lg text-tinta shadow-inner ring-1 ring-tinta/15 outline-none focus:ring-2 focus:ring-espadas"
        />
        {erro && (
          <p role="alert" className="font-semibold text-copas">
            {erro}
          </p>
        )}
        <Button type="submit" variant="ouro" disabled={busy || !senha}>
          Entrar
        </Button>
      </form>
    </Panel>
  );
}

export function Admin() {
  const [token, setToken] = useState<string | null>(() => storage.get<string>(TOKEN_KEY));
  const [dados, setDados] = useState<Dados | null>(null);
  const [aba, setAba] = useState<Aba>('resumo');
  const [msg, setMsg] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  /** Hora da última carga (o que está bloqueado depende dela). */
  const [agora, setAgora] = useState(0);
  const [busca, setBusca] = useState('');

  const sair = useCallback(() => {
    storage.remove(TOKEN_KEY);
    setToken(null);
    setDados(null);
  }, []);

  /** Cada mudança (atualizar, ação) pede os dados de novo. */
  const [versao, setVersao] = useState(0);
  const atualizar = () => {
    setCarregando(true);
    setVersao((v) => v + 1);
  };

  useEffect(() => {
    document.title = 'Admin · Faz quantas?';
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let vivo = true;
    api<Dados>('/api/admin/painel', token)
      .then((r) => {
        if (!vivo) return;
        setCarregando(false);
        if (r.status === 401) return sair();
        if (r.data.ok) {
          setDados(r.data);
          setAgora(Date.now());
        }
      })
      .catch(() => {
        if (!vivo) return;
        setCarregando(false);
        setMsg('Sem conexão com o servidor.');
      });
    return () => {
      vivo = false;
    };
  }, [token, versao, sair]);

  const acao = async (path: string, body: object, pronto: string) => {
    const r = await api(path, token, body).catch(() => null);
    setMsg(r?.data.ok ? pronto : (r?.data.mensagem ?? 'Não deu certo.'));
    setVersao((v) => v + 1);
  };

  const jogadores = useMemo(() => {
    if (!dados) return [];
    const contas = new Map(dados.contas.map((c) => [c.profileId, c]));
    const ranking = new Map(dados.ranking.map((r) => [r.profileId, r]));
    const ids = new Set([...dados.painel.jogadores.map((j) => j.profileId), ...contas.keys(), ...ranking.keys()]);
    const visto = new Map(dados.painel.jogadores.map((j) => [j.profileId, j]));
    const termo = busca.trim().toLowerCase();
    return [...ids]
      .map((id) => ({ id, visto: visto.get(id), conta: contas.get(id), rank: ranking.get(id) }))
      .map((j) => ({ ...j, nome: j.conta?.apelido ?? j.rank?.nome ?? j.visto?.nome ?? '(sem nome)' }))
      .filter((j) => !termo || j.nome.toLowerCase().includes(termo) || j.id.toLowerCase().startsWith(termo))
      .sort((a, b) => (b.visto?.ultima ?? 0) - (a.visto?.ultima ?? 0));
  }, [dados, busca]);

  if (!token) {
    return (
      <div className="mesa flex h-full flex-col overflow-y-auto px-4 py-8">
        <div className="mx-auto w-full max-w-sm">
          <Login
            onToken={(t) => {
              storage.set(TOKEN_KEY, t);
              setToken(t);
            }}
          />
        </div>
      </div>
    );
  }

  const hoje = dados?.painel.dias.at(-1);
  const semana = dados?.painel.dias.slice(-7) ?? [];
  const soma = (xs: Dia[], k: keyof Dia) => xs.reduce((n, d) => n + (d[k] as number), 0);

  return (
    <div className="mesa flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 pb-2" style={{ paddingTop: 'calc(0.75rem + var(--safe-top))' }}>
        <h1 className="flex-1 font-display text-3xl font-bold texto-gravado">Admin</h1>
        <Button size="sm" variant="vidro" icon={<RefreshCw size={16} />} disabled={carregando} onClick={atualizar}>
          Atualizar
        </Button>
        <Button size="sm" variant="vidro" icon={<LogOut size={16} />} onClick={sair}>
          Sair
        </Button>
      </header>
      <main className="sem-barra min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <Segmented<Aba>
            label="Seção"
            dark
            value={aba}
            onChange={setAba}
            options={[
              { value: 'resumo', label: 'Resumo' },
              { value: 'salas', label: `Salas${dados ? ` (${dados.painel.salasAbertas.length})` : ''}` },
              { value: 'jogadores', label: 'Jogadores' },
              { value: 'acessos', label: 'Acessos' },
            ]}
          />
          {msg && (
            <p role="status" className="rounded-2xl bg-noite/50 px-4 py-2 font-semibold">
              {msg}
            </p>
          )}
          {!dados ? (
            <Panel>
              <p>{carregando ? 'Carregando…' : 'Sem dados.'}</p>
            </Panel>
          ) : aba === 'resumo' ? (
            <>
              <Panel title="Hoje">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Numero valor={hoje?.pessoas ?? 0} rotulo="pessoas abriram o jogo" />
                  <Numero valor={dados.painel.salasAbertas.length} rotulo="salas abertas agora" />
                  <Numero valor={hoje?.partidas ?? 0} rotulo="partidas começadas" />
                  <Numero valor={hoje?.avisos ?? 0} rotulo="avisos por push" />
                </div>
              </Panel>
              <Panel title="Últimos 7 dias">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Numero valor={new Set(dados.painel.acessos.filter((a) => semana.some((d) => d.dia === a.dia)).map((a) => a.profileId)).size} rotulo="pessoas diferentes" />
                  <Numero valor={soma(semana, 'salas')} rotulo="salas criadas" />
                  <Numero valor={soma(semana, 'partidasFim')} rotulo="partidas até o fim" />
                  <Numero valor={soma(semana, 'ranqueadas')} rotulo="valendo ranking" />
                </div>
              </Panel>
              <Panel title="Pessoas por dia (30 dias)">
                <Barras dias={dados.painel.dias} />
              </Panel>
              <Panel title="De onde">
                <p className="text-sm">
                  {dados.painel.paises.length
                    ? dados.painel.paises.map((p) => `${p.pais || '??'}: ${p.pessoas}`).join(' · ')
                    : 'Ninguém ainda.'}
                </p>
                <p className="mt-3 text-sm text-tinta-2">
                  Uso do plano gratuito (requisições, CPU, Durable Objects):{' '}
                  <a href={CF_DASH} target="_blank" rel="noreferrer" className="font-semibold text-espadas underline">
                    painel do Worker no Cloudflare
                  </a>
                  .
                </p>
              </Panel>
            </>
          ) : aba === 'salas' ? (
            <>
              <Panel title="Abertas">
                {dados.painel.salasAbertas.length === 0 ? (
                  <p className="text-tinta-2">Nenhuma sala aberta.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-tinta/10">
                    {dados.painel.salasAbertas.map((s) => (
                      <li key={s.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                        <span className="font-display text-2xl font-bold tracking-[0.2em]">{s.code}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">
                            {STATUS[s.status] ?? s.status} · {s.humanos.join(', ') || 'ninguém'}
                            {s.bots ? ` + ${s.bots} bot${s.bots > 1 ? 's' : ''}` : ''}
                          </span>
                          <span className="block text-sm text-tinta-2">
                            {s.conectados} conectado{s.conectados === 1 ? '' : 's'}
                            {s.assincrona ? ' · cada um no seu tempo' : ''}
                            {s.ranqueada ? ' · valendo ranking' : ''}
                            {s.senha ? ' · com senha' : ''} · aberta {hora(s.criada)}
                          </span>
                        </span>
                        <Button size="sm" variant="copas" onClick={() => void acao('/api/admin/sala', { code: s.code }, `Sala ${s.code} encerrada.`)}>
                          Encerrar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Encerradas (7 dias)">
                <ul className="flex flex-col divide-y divide-tinta/10 text-sm">
                  {dados.painel.salasRecentes.slice(0, 50).map((s) => (
                    <li key={`${s.code}-${s.encerrada}`} className="py-1.5">
                      <strong className="tracking-[0.15em]">{s.code}</strong> · {s.humanos.join(', ') || 'ninguém'} · {hora(s.criada)} → {hora(s.encerrada ?? 0)} ·{' '}
                      <span className="text-tinta-2">{s.motivo}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          ) : aba === 'jogadores' ? (
            <Panel title={`Jogadores (${jogadores.length})`}>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou código"
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
                            {bloqueado ? ' · BLOQUEADO' : ''}
                          </p>
                          <p className="text-sm text-tinta-2">
                            <code>{j.id.slice(0, 8)}</code>
                            {j.rank ? ` · ${j.rank.pontos} pts, ${j.rank.vitorias} vitórias em ${j.rank.partidas}` : ''}
                            {j.visto ? ` · visto ${hora(j.visto.ultima)} (${j.visto.dias} dia${j.visto.dias > 1 ? 's' : ''}) · ${j.visto.cidade || j.visto.ip} · ${j.visto.aparelho}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {j.conta?.apelido && (
                          <Button size="sm" onClick={() => void acao('/api/admin/perfil', { profileId: j.id, acao: 'liberar-apelido' }, `Apelido de ${j.nome} liberado.`)}>
                            Liberar apelido
                          </Button>
                        )}
                        {j.rank && (
                          <Button size="sm" onClick={() => void acao('/api/admin/perfil', { profileId: j.id, acao: 'tirar-do-ranking' }, `${j.nome} saiu do ranking.`)}>
                            Tirar do ranking
                          </Button>
                        )}
                        {bloqueado ? (
                          <Button size="sm" onClick={() => void acao('/api/admin/perfil', { profileId: j.id, acao: 'desbloquear' }, `${j.nome} desbloqueado.`)}>
                            Desbloquear
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="copas" onClick={() => void acao('/api/admin/perfil', { profileId: j.id, acao: 'bloquear', dias: 7 }, `${j.nome} bloqueado por 7 dias.`)}>
                              Bloquear 7 dias
                            </Button>
                            <Button size="sm" variant="copas" onClick={() => void acao('/api/admin/perfil', { profileId: j.id, acao: 'bloquear' }, `${j.nome} bloqueado.`)}>
                              Bloquear
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : (
            <Panel title="Acessos recentes">
              <p className="mb-2 text-sm text-tinta-2">Um por pessoa por dia. IP sem o final (mostra a região e o provedor, não a casa).</p>
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
                    {dados.painel.acessos.map((a) => (
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
          )}
        </div>
      </main>
    </div>
  );
}
