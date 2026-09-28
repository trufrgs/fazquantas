import { NAME_MAX_LENGTH } from '@fodinha/engine';
import { BadgeCheck } from 'lucide-react';
import { useState } from 'react';
import { entrarComApelido, esperaTexto, guardarApelido, type ContaFalha } from '../../lib/conta';
import { useSettings } from '../../stores/settings';
import { Button } from '../ui/Button';

const INPUT =
  'h-12 w-full rounded-2xl border-0 bg-white/70 px-4 text-lg font-semibold text-tinta shadow-inner ring-1 ring-tinta/15 outline-none placeholder:text-tinta/30 focus:ring-2 focus:ring-espadas';

function PinInput({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      placeholder="••••"
      aria-label={label}
      className={`${INPUT} tracking-[0.4em]`}
    />
  );
}

function mensagem(r: ContaFalha): string {
  return [r.mensagem, esperaTexto(r.esperaMs)].filter(Boolean).join(' ');
}

type Modo = 'inicio' | 'guardar' | 'entrar' | 'trocar-pin' | 'trocar-nome';

/**
 * Apelido guardado: um PIN deixa o apelido só teu (ninguém mais senta com ele) e leva o perfil,
 * com os pontos do ranking, para outro aparelho.
 */
export function ApelidoGuardado({ compact = false, onEntrou }: { compact?: boolean; onEntrou?: () => void }) {
  const { name, claimed } = useSettings();
  const [modo, setModo] = useState<Modo>('inicio');
  const [apelido, setApelido] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (m: Modo) => {
    setModo(m);
    setPin('');
    setPin2('');
    setErro(null);
    setOk(null);
    setApelido(m === 'trocar-nome' ? (claimed ?? '') : m === 'entrar' ? '' : apelido);
  };

  const run = async (fn: () => Promise<true | ContaFalha>, done: string) => {
    setBusy(true);
    setErro(null);
    const r = await fn();
    setBusy(false);
    if (r === true) {
      setModo('inicio');
      setPin('');
      setPin2('');
      setOk(done);
      return true;
    }
    setErro(mensagem(r));
    return false;
  };

  if (modo === 'guardar') {
    const nome = name.trim();
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (pin !== pin2) return setErro('Os dois PINs não batem.');
          void run(() => guardarApelido(nome, pin), `Pronto: "${nome}" é só teu.`);
        }}
      >
        <p className="text-sm text-tinta-2">
          Escolhe um PIN de 4 a 8 números pro apelido <strong className="text-tinta">{nome || '(sem apelido)'}</strong>. Com ele tu entra em
          outro aparelho.
        </p>
        <PinInput value={pin} onChange={setPin} label="PIN" autoFocus />
        <PinInput value={pin2} onChange={setPin2} label="Repete o PIN" />
        {erro && <p role="alert" className="text-sm font-semibold text-copas">{erro}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => reset('inicio')}>Cancelar</Button>
          <Button type="submit" variant="ouro" disabled={busy || [...nome].length < 2 || pin.length < 4 || pin2.length < 4}>
            Guardar
          </Button>
        </div>
      </form>
    );
  }

  if (modo === 'entrar') {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => entrarComApelido(apelido.trim(), pin), 'Pronto: este aparelho agora é o teu perfil.').then((entrou) => {
            if (entrou) onEntrou?.();
          });
        }}
      >
        <p className="text-sm text-tinta-2">Teu apelido guardado e o PIN. Este aparelho passa a jogar e pontuar como tu.</p>
        <input
          value={apelido}
          onChange={(e) => setApelido(e.target.value)}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="nickname"
          autoFocus
          placeholder="Teu apelido"
          aria-label="Apelido guardado"
          className={INPUT}
        />
        <PinInput value={pin} onChange={setPin} label="PIN" />
        {erro && <p role="alert" className="text-sm font-semibold text-copas">{erro}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => reset('inicio')}>Cancelar</Button>
          <Button type="submit" variant="ouro" disabled={busy || apelido.trim().length < 2 || pin.length < 4}>
            Entrar
          </Button>
        </div>
      </form>
    );
  }

  if (modo === 'trocar-pin' || modo === 'trocar-nome') {
    const trocandoNome = modo === 'trocar-nome';
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!trocandoNome && pin2.length < 4) return setErro('O PIN novo tem de 4 a 8 números.');
          void run(
            () => (trocandoNome ? guardarApelido(apelido.trim(), pin) : guardarApelido(claimed ?? name, pin, pin2)),
            trocandoNome ? `Pronto: agora tu é "${apelido.trim()}".` : 'PIN trocado.',
          );
        }}
      >
        {trocandoNome ? (
          <input
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            placeholder="Apelido novo"
            aria-label="Apelido novo"
            className={INPUT}
          />
        ) : null}
        <PinInput value={pin} onChange={setPin} label="PIN atual" autoFocus={!trocandoNome} />
        {!trocandoNome && <PinInput value={pin2} onChange={setPin2} label="PIN novo" />}
        {erro && <p role="alert" className="text-sm font-semibold text-copas">{erro}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => reset('inicio')}>Cancelar</Button>
          <Button type="submit" variant="ouro" disabled={busy || pin.length < 4 || (trocandoNome && apelido.trim().length < 2)}>
            {trocandoNome ? 'Trocar apelido' : 'Trocar PIN'}
          </Button>
        </div>
      </form>
    );
  }

  if (claimed) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <BadgeCheck size="1.2rem" className="text-paus" aria-hidden="true" />
          Apelido guardado: {claimed}
        </p>
        <p className="text-sm text-tinta-2">Em outro aparelho, entra com o apelido e o PIN pra levar teus pontos.</p>
        {ok && <p role="status" className="text-sm font-semibold">{ok}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <button type="button" className="text-sm font-bold text-espadas" onClick={() => reset('trocar-nome')}>
            Trocar apelido
          </button>
          <button type="button" className="text-sm font-bold text-espadas" onClick={() => reset('trocar-pin')}>
            Trocar PIN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!compact && (
        <p className="text-sm text-tinta-2">
          Guarda teu apelido com um PIN: ninguém mais senta com ele, e em outro aparelho tu entra com apelido e PIN e leva teus
          pontos do ranking.
        </p>
      )}
      {ok && <p role="status" className="text-sm font-semibold">{ok}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {!compact && (
          <Button size="sm" variant="ouro" disabled={[...name.trim()].length < 2} onClick={() => reset('guardar')}>
            Guardar meu apelido
          </Button>
        )}
        <button type="button" className="text-sm font-bold text-espadas" onClick={() => reset('entrar')}>
          Já guardei meu apelido
        </button>
      </div>
    </div>
  );
}
