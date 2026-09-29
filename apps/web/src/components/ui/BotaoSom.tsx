import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../stores/settings';
import { IconButton } from './Button';
import { Toggle } from './Controls';

/**
 * O som no alto da sala de espera: um toque abre duas chaves, só a música (o tango) ou todo o som
 * (efeitos e música). O ícone mostra o que está valendo: tudo ligado, só os efeitos ou mudo. Na mesa
 * não tem: o menu (☰) já traz as mesmas chaves.
 */
export function BotaoSom() {
  const sound = useSettings((s) => s.sound);
  const musica = useSettings((s) => s.musica);
  const set = useSettings((s) => s.set);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  // Toque fora ou Esc fecha.
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    window.addEventListener('pointerdown', fora);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', fora);
      window.removeEventListener('keydown', esc);
    };
  }, [aberto]);
  const Icone = !sound ? VolumeX : musica ? Volume2 : Volume1;
  const estado = !sound ? 'desligado' : musica ? 'efeitos e música' : 'só efeitos';
  return (
    <div ref={caixa} className="relative">
      <IconButton label={`Som: ${estado}`} aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <Icone size={21} />
      </IconButton>
      {aberto && (
        <div
          role="dialog"
          aria-label="Som"
          className="papel absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl px-4 py-1 text-tinta shadow-[0_12px_30px_rgb(0_0_0/0.45)] ring-1 ring-black/10"
        >
          <Toggle
            checked={sound && musica}
            onChange={(on) => set(on ? { musica: true, sound: true } : { musica: false })}
            label="Música"
            description="Só o tango de fundo"
          />
          <Toggle checked={sound} onChange={(on) => set({ sound: on })} label="Todo o som" description="Efeitos e música" />
        </div>
      )}
    </div>
  );
}
