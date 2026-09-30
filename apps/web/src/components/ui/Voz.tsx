import { Mic, MicOff } from 'lucide-react';
import { useEffect } from 'react';
import { useVoz, conversa } from '../../lib/voz';
import { useOnline } from '../../stores/online';
import { IconButton } from './Button';

/** A sala tem gente de verdade para conversar (pelo menos duas pessoas), ou tu já está na conversa. */
export function useTemConversa(): boolean {
  const humanos = useOnline((s) => s.room?.seats.filter((x) => x.kind === 'human').length ?? 0);
  const ligada = useVoz((s) => s.ligada);
  return humanos >= 2 || ligada;
}

/**
 * O microfone da conversa por voz: fora dela, um toque entra (o navegador pede o microfone na primeira
 * vez); dentro, um toque silencia e outro volta. Sair fica no menu da mesa ou ao lado, na sala.
 */
export function BotaoVoz() {
  const tem = useTemConversa();
  const { ligada, entrando, mudo, erro } = useVoz();
  const eu = useOnline((s) => s.room?.youId ?? null);
  const falando = useVoz((s) => (eu ? !!s.falando[eu] : false));
  const entrar = useOnline((s) => s.entrarNaVoz);
  // O erro (sem microfone, sala recusou) aparece um pouco e some.
  useEffect(() => {
    if (!erro) return undefined;
    const t = window.setTimeout(() => useVoz.setState({ erro: null }), 5000);
    return () => window.clearTimeout(t);
  }, [erro]);
  if (!tem) return null;
  const rotulo = !ligada ? 'Entrar na conversa por voz' : mudo ? 'Microfone mudo: toca pra falar' : 'Microfone aberto: toca pra silenciar';
  return (
    <div className="relative">
      <IconButton
        label={rotulo}
        aria-pressed={ligada && !mudo}
        disabled={entrando}
        onClick={() => (ligada ? conversa.alternarMudo() : entrar())}
        className={
          !ligada
            ? 'opacity-80'
            : mudo
              ? 'bg-copas/80 ring-copas'
              : `bg-paus/80 ring-2 ${falando ? 'ring-luz shadow-[0_0_14px_3px_rgb(120_220_140/0.7)]' : 'ring-paus'}`
        }
      >
        {ligada && mudo ? <MicOff size={21} /> : <Mic size={21} />}
      </IconButton>
      {erro && (
        <span
          role="alert"
          className="papel absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl px-3 py-2 text-sm font-semibold text-tinta shadow-[0_12px_30px_rgb(0_0_0/0.45)]"
        >
          {erro}
        </span>
      )}
    </div>
  );
}

/**
 * Em volta do avatar de quem está na conversa: o microfone (mudo em vermelho) e, enquanto a pessoa
 * fala, o avatar acende em verde.
 */
export function SinalDeVoz({ playerId, size }: { playerId: string; size: number }) {
  const voz = useOnline((s) => s.room?.vozes?.find((v) => v.playerId === playerId) ?? null);
  const falando = useVoz((s) => !!s.falando[playerId]);
  if (!voz) return null;
  return (
    <>
      {falando && !voz.mudo && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full ring-[3px] ring-[rgb(120_220_140)] shadow-[0_0_16px_4px_rgb(120_220_140/0.7)]"
          style={{ width: size + 6, height: size + 6 }}
        />
      )}
      <span
        className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-papel ring-2 ring-noite/60 ${voz.mudo ? 'bg-copas' : 'bg-paus'}`}
        aria-label={voz.mudo ? 'na conversa, mudo' : falando ? 'falando' : 'na conversa'}
        role="img"
      >
        {voz.mudo ? <MicOff size={11} strokeWidth={2.6} /> : <Mic size={11} strokeWidth={2.6} />}
      </span>
    </>
  );
}

/**
 * Na sala de espera: quem está na conversa por voz, com o convite para entrar (ou o jeito de sair).
 * Na mesa, sair fica no menu (☰).
 */
export function ConversaNaSala() {
  const tem = useTemConversa();
  const room = useOnline((s) => s.room);
  const { ligada } = useVoz();
  const entrar = useOnline((s) => s.entrarNaVoz);
  const sair = useOnline((s) => s.sairDaVoz);
  const nomes = (room?.vozes ?? [])
    .map((v) => (v.playerId === room?.youId ? 'tu' : room?.seats.find((x) => x.playerId === v.playerId)?.name))
    .filter(Boolean);
  if (!tem || (!ligada && nomes.length === 0)) return null;
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm font-semibold text-papel texto-gravado">
      <Mic size={15} aria-hidden="true" />
      <span>{nomes.length > 0 ? `Na conversa por voz: ${nomes.join(', ')}` : 'Na conversa por voz'}</span>
      <button
        type="button"
        onClick={() => (ligada ? sair() : entrar())}
        className="rounded-full bg-noite/45 px-3 py-0.5 text-ouros underline-offset-2 ring-1 ring-papel/15 active:scale-95"
      >
        {ligada ? 'Sair da conversa' : 'Entrar'}
      </button>
    </p>
  );
}
