import { Volume2, VolumeX } from 'lucide-react';
import { useSettings } from '../../stores/settings';
import { IconButton } from './Button';

/**
 * Liga e desliga o som num toque, no alto da sala e da mesa (o tango e os efeitos juntos). A música
 * sozinha continua nos ajustes e no menu da partida.
 */
export function BotaoSom() {
  const sound = useSettings((s) => s.sound);
  const set = useSettings((s) => s.set);
  return (
    <IconButton label={sound ? 'Desligar o som' : 'Ligar o som'} aria-pressed={!sound} onClick={() => set({ sound: !sound })}>
      {sound ? <Volume2 size={21} /> : <VolumeX size={21} />}
    </IconButton>
  );
}
