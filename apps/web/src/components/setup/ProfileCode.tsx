import { PROFILE_KEY_PATTERN } from '@fodinha/engine';
import { useState } from 'react';
import { useSettings } from '../../stores/settings';
import { Button } from '../ui/Button';

/**
 * Código do jogador: a chave do perfil de ranking. Levar para outro aparelho leva os pontos junto;
 * quem tem o código pontua como tu, então ele fica escondido até pedir.
 */
export function ProfileCode() {
  const key = useSettings((s) => s.profileKey);
  const set = useSettings((s) => s.set);
  const [shown, setShown] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(key);
      setMsg('Código copiado.');
    } catch {
      setShown(true);
      setMsg('Copia o código acima.');
    }
  };
  const use = () => {
    const clean = draft.trim();
    if (!PROFILE_KEY_PATTERN.test(clean)) {
      setMsg('Esse código não parece certo: confere se copiou inteiro.');
      return;
    }
    set({ profileKey: clean });
    setImporting(false);
    setDraft('');
    setMsg('Pronto: este aparelho agora pontua no teu perfil.');
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-tinta-2">
        Teus pontos no ranking ficam neste código. Pra jogar de outro aparelho com o mesmo perfil, leva ele junto. Não
        passa pra ninguém: quem tem o código pontua como tu.
      </p>
      <div className="flex items-center gap-2 rounded-2xl bg-tinta/5 px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm" aria-label="Código do jogador">
          {shown ? key : '•'.repeat(22)}
        </code>
        <Button size="sm" onClick={() => setShown((v) => !v)}>
          {shown ? 'Esconder' : 'Mostrar'}
        </Button>
        <Button size="sm" onClick={() => void copy()}>
          Copiar
        </Button>
      </div>
      {importing ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            use();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Cola o código do outro aparelho"
            aria-label="Código do outro aparelho"
            className="h-11 min-w-0 flex-1 rounded-2xl border-0 bg-white/70 px-3 font-mono text-sm text-tinta shadow-inner ring-1 ring-tinta/15 outline-none focus:ring-2 focus:ring-espadas"
          />
          <Button type="submit" variant="ouro" disabled={!draft.trim()}>
            Usar
          </Button>
        </form>
      ) : (
        <button type="button" className="self-start text-sm font-bold text-espadas" onClick={() => setImporting(true)}>
          Usar o código de outro aparelho
        </button>
      )}
      {msg && (
        <p role="status" className="text-sm font-semibold text-tinta">
          {msg}
        </p>
      )}
    </div>
  );
}
