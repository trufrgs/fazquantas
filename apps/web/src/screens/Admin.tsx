import { LogOut, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Agora } from '../components/admin/Agora';
import { Automacao } from '../components/admin/Automacao';
import { Historico } from '../components/admin/Historico';
import { Numeros } from '../components/admin/Numeros';
import { Pessoas } from '../components/admin/Pessoas';
import { Salas } from '../components/admin/Salas';
import { api, estaParada, soHora, type Aba, type Dados, type FiltroSalas, type RodarAcao } from '../components/admin/tipos';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/ScreenFrame';
import { storage } from '../lib/storage';

/**
 * Painel do dono do jogo (`/admin`): o que pede atenção agora, salas (encerrar e mandar recado, uma
 * ou várias), jogadores (apelido, bloqueio, ranking), números de uso, a automação do servidor e o
 * histórico do que foi feito. A senha é o segredo `ADMIN_SENHA` do Worker.
 */

const TOKEN_KEY = 'fodinha:admin';
/** Com a aba à vista, o painel se atualiza sozinho nesse intervalo. */
const RECARREGA_MS = 30_000;

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
        {/* Usuário fixo e escondido: gerenciadores de senha (Bitwarden, Chrome) reconhecem o login e preenchem. */}
        <input type="text" name="username" value="admin" readOnly autoComplete="username" tabIndex={-1} aria-hidden="true" className="sr-only" />
        <input
          type="password"
          name="password"
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
  const [aba, setAba] = useState<Aba>('agora');
  const [filtroSalas, setFiltroSalas] = useState<FiltroSalas>('todas');
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [carregando, setCarregando] = useState(true);
  /** Hora da última carga (o que está parado ou bloqueado depende dela). */
  const [agora, setAgora] = useState(0);
  const [semConexao, setSemConexao] = useState(false);

  const sair = useCallback(() => {
    storage.remove(TOKEN_KEY);
    setToken(null);
    setDados(null);
  }, []);

  /** Cada mudança (atualizar, ação, relógio) pede os dados de novo. */
  const [versao, setVersao] = useState(0);
  const atualizar = () => {
    setCarregando(true);
    setVersao((v) => v + 1);
  };

  useEffect(() => {
    document.title = 'Admin · Faz quantas?';
  }, []);

  // Com a aba à vista, recarrega sozinho; ao voltar para a aba, na hora.
  useEffect(() => {
    if (!token) return undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') setVersao((v) => v + 1);
    };
    const id = window.setInterval(tick, RECARREGA_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [token]);

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
          setSemConexao(false);
        }
      })
      .catch(() => {
        if (!vivo) return;
        setCarregando(false);
        setSemConexao(true);
      });
    return () => {
      vivo = false;
    };
  }, [token, versao, sair]);

  const acao: RodarAcao = async (path, body, pronto) => {
    const r = await api(path, token, body).catch(() => null);
    if (r?.status === 401) {
      sair();
      return null;
    }
    const ok = !!r?.data.ok;
    setMsg({ ok, texto: ok && r ? (typeof pronto === 'function' ? pronto(r.data) : pronto) : (r?.data.mensagem ?? 'Não deu certo: sem conexão com o servidor.') });
    setVersao((v) => v + 1);
    return r?.data ?? null;
  };

  const irPara = (destino: Aba, filtro?: FiltroSalas) => {
    if (filtro) setFiltroSalas(filtro);
    setAba(destino);
  };

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

  const p = dados?.painel;
  const paradas = p ? p.salasAbertas.filter((s) => estaParada(s, agora)).length : 0;
  const abas: { value: Aba; label: string }[] = [
    { value: 'agora', label: p?.manutencao?.ativa || paradas ? 'Agora •' : 'Agora' },
    { value: 'salas', label: `Salas${p ? ` (${p.salasAbertas.length})` : ''}` },
    { value: 'jogadores', label: 'Jogadores' },
    { value: 'numeros', label: 'Números' },
    { value: 'automacao', label: 'Automação' },
    { value: 'historico', label: 'Histórico' },
  ];

  return (
    <div className="mesa flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 pb-2" style={{ paddingTop: 'calc(0.75rem + var(--safe-top))' }}>
        <h1 className="flex-1 font-display text-3xl font-bold texto-gravado">Admin</h1>
        <Button size="sm" variant="vidro" icon={<RefreshCw size={16} />} disabled={carregando} onClick={atualizar} aria-label="Atualizar">
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
        <Button size="sm" variant="vidro" icon={<LogOut size={16} />} onClick={sair}>
          Sair
        </Button>
      </header>
      <main className="sem-barra min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <nav aria-label="Seções do admin" className="grid grid-cols-3 gap-1 rounded-2xl bg-noite/45 p-1 ring-1 ring-papel/10 sm:grid-cols-6">
            {abas.map((a) => (
              <button
                key={a.value}
                type="button"
                aria-current={aba === a.value ? 'page' : undefined}
                onClick={() => setAba(a.value)}
                className={`min-h-10 rounded-xl px-2 text-sm font-semibold transition ${aba === a.value ? 'bg-papel text-tinta shadow' : 'text-papel/80'}`}
              >
                {a.label}
              </button>
            ))}
          </nav>
          {semConexao && (
            <p role="alert" className="rounded-2xl bg-copas/80 px-4 py-2 font-semibold text-papel">
              Sem conexão com o servidor{agora ? ` (dados de ${soHora(agora)} BRT)` : ''}. Tento de novo sozinho.
            </p>
          )}
          {msg && (
            <p role="status" className={`flex items-start gap-3 rounded-2xl px-4 py-2 font-semibold ${msg.ok ? 'bg-noite/50' : 'bg-copas/80 text-papel'}`}>
              <span className="flex-1">{msg.texto}</span>
              <button type="button" aria-label="Fechar aviso" onClick={() => setMsg(null)} className="opacity-70">
                <X size={18} />
              </button>
            </p>
          )}
          {!dados ? (
            <Panel>
              <p>{carregando ? 'Carregando…' : 'Sem dados.'}</p>
            </Panel>
          ) : aba === 'agora' ? (
            <Agora dados={dados} agora={agora} acao={acao} irPara={irPara} />
          ) : aba === 'salas' ? (
            <Salas dados={dados} agora={agora} acao={acao} filtro={filtroSalas} setFiltro={setFiltroSalas} />
          ) : aba === 'jogadores' ? (
            <Pessoas dados={dados} agora={agora} acao={acao} />
          ) : aba === 'numeros' ? (
            <Numeros dados={dados} />
          ) : aba === 'automacao' ? (
            <Automacao dados={dados} token={token} acao={acao} />
          ) : (
            <Historico dados={dados} />
          )}
        </div>
      </main>
    </div>
  );
}
