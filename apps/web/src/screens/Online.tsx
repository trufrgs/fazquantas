import { PASSWORD_MAX_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@fodinha/engine';
import { ClipboardPaste } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ProfileEditor } from '../components/setup/ProfileEditor';
import { TuasSalas, useTuasSalas } from '../components/setup/TuasSalas';
import { Button } from '../components/ui/Button';
import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';
import { useDonoDoApelido } from '../lib/conta';
import { codigoDoConvite, serverUrl } from '../lib/platform';
import { useManutencao } from '../lib/status';
import { useApp } from '../stores/app';
import { savedSession, useOnline } from '../stores/online';
import { useSettings } from '../stores/settings';

function cleanCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

/** Sem apelido guardado neste aparelho, a tela pede antes de criar ou entrar. */
function pedindoNomeAoAbrir(): boolean {
  return !useSettings.getState().name.trim();
}

export function Online({ initialCode, onCodeUsed }: { initialCode?: string; onCodeUsed?: () => void }) {
  const { status, error, create, join, clearError, passwordFor } = useOnline();
  const reset = useApp((s) => s.reset);
  const [code, setCode] = useState(cleanCode(initialCode ?? ''));
  // No iPhone o link do convite sempre abre no Safari, nunca no app da tela de início: no app, a
  // pessoa copia o convite no WhatsApp e cola aqui.
  const podeColar = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';
  const [colarMsg, setColarMsg] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const busy = status === 'connecting';
  const session = savedSession();
  const rooms = useTuasSalas();
  const manutencao = useManutencao();
  const askPassword = passwordFor !== null && passwordFor === code;
  // Sem apelido, primeiro o apelido: ninguém senta como "Jogador" (nem chegando pelo convite).
  const nome = useSettings((s) => s.name);
  const claimed = useSettings((s) => s.claimed);
  const [pedindoNome, setPedindoNome] = useState(pedindoNomeAoAbrir);
  // Apelido guardado por outra pessoa (a sala recusou, ou o jogo viu ao abrir): PIN ou outro apelido.
  const apelidoDeOutro = useDonoDoApelido(nome) === 'outro' && !claimed;
  const precisaNome = pedindoNome || apelidoDeOutro;
  /** Código do convite esperando o apelido ficar pronto (decidido uma vez, ao abrir a tela). */
  const [convite] = useState<string | null>(() => {
    const c = cleanCode(initialCode ?? '');
    return pedindoNomeAoAbrir() && c.length === ROOM_CODE_LENGTH && !useOnline.getState().kicked ? c : null;
  });

  // O erro fica visível até a pessoa sair desta tela (a remontagem do StrictMode não conta).
  useEffect(
    () => () =>
      queueMicrotask(() => {
        if (useApp.getState().screen !== 'online') clearError();
      }),
    [clearError],
  );

  const doJoin = async (c: string, pw?: string) => {
    if (await join(c, { password: pw })) reset('lobby');
  };

  useEffect(() => {
    if (!initialCode) return;
    onCodeUsed?.();
    if (cleanCode(initialCode).length === ROOM_CODE_LENGTH && !useOnline.getState().kicked) {
      if (!convite) void doJoin(cleanCode(initialCode));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ScreenFrame title="Jogar com a gurizada">
      {/* O erro vem primeiro: quem cai aqui depois de perder a sala precisa ver o porquê sem rolar. */}
      {error && (
        <div role="alert" className="rounded-2xl bg-copas px-4 py-3 font-semibold text-papel shadow-lg">
          {error}
        </div>
      )}
      {manutencao && (
        <div role="status" className="rounded-2xl bg-ouros px-4 py-3 font-semibold text-tinta shadow-lg">
          Manutenção: {manutencao.mensagem || 'o jogo está em manutenção.'} Criar sala volta logo; quem já está numa mesa segue jogando.
        </div>
      )}
      {precisaNome && (
        <Panel title={convite ? `Antes de entrar na sala ${convite}` : apelidoDeOutro ? 'Esse apelido já tem dono' : 'Antes de tudo'}>
          <ProfileEditor />
          <Button
            variant="ouro"
            size="lg"
            className="mt-3 w-full"
            disabled={[...nome.trim()].length < 1 || apelidoDeOutro}
            onClick={() => {
              setPedindoNome(false);
              if (convite) void doJoin(convite);
            }}
          >
            {convite ? `Entrar na sala ${convite}` : 'Pronto'}
          </Button>
        </Panel>
      )}
      {rooms && rooms.length > 0 && (
        <Panel title="Tuas salas">
          <TuasSalas rooms={rooms} busy={busy} onOpen={(c) => void doJoin(c)} />
        </Panel>
      )}
      <Panel title="Criar uma sala">
        <p className="mb-3 text-tinta-2">Tu recebe um código de 4 letras pra chamar a gurizada. Lugar vazio dá pra completar com bot.</p>
        <Button
          variant="ouro"
          size="lg"
          className="w-full"
          disabled={busy || precisaNome || manutencao !== null}
          onClick={async () => {
            if (await create()) reset('lobby');
          }}
        >
          {busy ? 'Conectando…' : manutencao ? 'Em manutenção' : 'Criar sala'}
        </Button>
      </Panel>
      <Panel title="Entrar numa sala">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === ROOM_CODE_LENGTH) void doJoin(code, askPassword ? password : undefined);
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-tinta-2">Código da sala</span>
            <input
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABCD"
              aria-label="Código da sala"
              className="h-16 rounded-2xl border-0 bg-white/70 text-center font-display text-4xl font-bold tracking-[0.4em] text-tinta shadow-inner ring-1 ring-tinta/15 outline-none placeholder:text-tinta/20 focus:ring-2 focus:ring-espadas"
            />
          </label>
          {askPassword && (
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Essa sala tem senha</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value.slice(0, PASSWORD_MAX_LENGTH))}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="Senha que te passaram"
                aria-label="Senha da sala"
                className="h-12 rounded-2xl border-0 bg-white/70 px-4 text-lg font-semibold text-tinta shadow-inner ring-1 ring-tinta/15 outline-none placeholder:text-tinta/30 focus:ring-2 focus:ring-espadas"
              />
            </label>
          )}
          <Button
            type="submit"
            variant="papel"
            size="lg"
            disabled={busy || precisaNome || code.length !== ROOM_CODE_LENGTH || (askPassword && !password.trim())}
          >
            Entrar
          </Button>
        </form>
        {podeColar && (
          <div className="mt-3 flex flex-col gap-1">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-espadas disabled:opacity-50"
              disabled={busy}
              onClick={async () => {
                let texto = '';
                try {
                  texto = await navigator.clipboard.readText();
                } catch {
                  // não deixou ler: cai no aviso abaixo
                }
                const c = codigoDoConvite(texto);
                if (!c) {
                  setColarMsg('Não achei convite no que foi copiado. No WhatsApp, segura o link do convite e toca em Copiar.');
                  return;
                }
                setColarMsg(null);
                setCode(c);
                if (!precisaNome) void doJoin(c);
              }}
            >
              <ClipboardPaste size={16} aria-hidden="true" />
              Colar convite
            </button>
            {colarMsg && (
              <p role="status" className="text-sm text-tinta-2">
                {colarMsg}
              </p>
            )}
          </div>
        )}
        {session && session.code !== code && !rooms?.some((r) => r.code === session.code) && (
          <button type="button" className="mt-3 text-sm font-bold text-espadas" onClick={() => void doJoin(session.code)}>
            Voltar pra sala {session.code}
          </button>
        )}
      </Panel>
      {import.meta.env.DEV && <p className="text-center text-xs text-papel/60">Servidor: {serverUrl()}</p>}
    </ScreenFrame>
  );
}
