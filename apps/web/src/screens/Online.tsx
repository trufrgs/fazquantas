import { PASSWORD_MAX_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@fodinha/engine';
import { useEffect, useState } from 'react';
import { TuasSalas, useTuasSalas } from '../components/setup/TuasSalas';
import { Button } from '../components/ui/Button';
import { Panel, ScreenFrame } from '../components/ui/ScreenFrame';
import { serverUrl } from '../lib/platform';
import { useApp } from '../stores/app';
import { savedSession, useOnline } from '../stores/online';

function cleanCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

export function Online({ initialCode, onCodeUsed }: { initialCode?: string; onCodeUsed?: () => void }) {
  const { status, error, create, join, clearError, passwordFor } = useOnline();
  const reset = useApp((s) => s.reset);
  const [code, setCode] = useState(cleanCode(initialCode ?? ''));
  const [password, setPassword] = useState('');
  const busy = status === 'connecting';
  const session = savedSession();
  const rooms = useTuasSalas();
  const askPassword = passwordFor !== null && passwordFor === code;

  // O erro fica visível até a pessoa sair desta tela.
  useEffect(() => () => clearError(), [clearError]);

  const doJoin = async (c: string, pw?: string) => {
    if (await join(c, { password: pw })) reset('lobby');
  };

  useEffect(() => {
    if (!initialCode) return;
    onCodeUsed?.();
    if (cleanCode(initialCode).length === ROOM_CODE_LENGTH && !useOnline.getState().kicked) {
      void doJoin(cleanCode(initialCode));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ScreenFrame title="Jogar com a gurizada">
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
          disabled={busy}
          onClick={async () => {
            if (await create()) reset('lobby');
          }}
        >
          {busy ? 'Conectando…' : 'Criar sala'}
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
            disabled={busy || code.length !== ROOM_CODE_LENGTH || (askPassword && !password.trim())}
          >
            Entrar
          </Button>
        </form>
        {session && session.code !== code && !rooms?.some((r) => r.code === session.code) && (
          <button type="button" className="mt-3 text-sm font-bold text-espadas" onClick={() => void doJoin(session.code)}>
            Voltar pra sala {session.code}
          </button>
        )}
      </Panel>
      {error && (
        <div role="alert" className="rounded-2xl bg-copas px-4 py-3 font-semibold text-papel shadow-lg">
          {error}
        </div>
      )}
      {import.meta.env.DEV && <p className="text-center text-xs text-papel/60">Servidor: {serverUrl()}</p>}
    </ScreenFrame>
  );
}
