import { REACTIONS, type ReactionId } from '@fodinha/engine';
import { Mic, Play, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { forcarAudio } from '../../lib/sound';
import { gravarVoz, podeGravar, tocarVoz, useMinhasVozes, VOZ } from '../../lib/voz';
import { useSettings } from '../../stores/settings';
import { Button } from '../ui/Button';

/**
 * A frase na tua voz (caderno de zoeira): grava até dois segundos de cada frase que fica a um toque
 * na mesa. Quando tu manda a frase (ou grita, ou carimba na testa de alguém), é a tua voz que toca
 * para a mesa inteira, mesmo de microfone fechado. Fica no aparelho; na sala, só na memória enquanto
 * tu estiver nela.
 */
export function FrasesNaTuaVoz() {
  const favoritas = useSettings((s) => s.frasesFavoritas).slice(0, VOZ.maxFrases);
  const efeitos = useSettings((s) => s.sound);
  const { vozes, gravar, apagar } = useMinhasVozes();
  const [gravando, setGravando] = useState<ReactionId | null>(null);
  const [nivel, setNivel] = useState(0);
  const [recado, setRecado] = useState<string | null>(null);
  const parar = useRef<AbortController | null>(null);

  if (!podeGravar()) return null;

  const comecar = async (frase: ReactionId) => {
    setRecado(null);
    setGravando(frase);
    setNivel(0);
    const ctl = new AbortController();
    parar.current = ctl;
    try {
      const b64 = await gravarVoz(setNivel, ctl.signal);
      if (b64) {
        gravar(frase, b64);
        forcarAudio();
        tocarVoz(b64);
      } else setRecado('Não deu para ouvir nada. Fala mais perto do celular.');
    } catch {
      setRecado('O microfone está bloqueado: libera nas permissões do site e tenta de novo.');
    } finally {
      setGravando(null);
      parar.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm opacity-75">
        Grava até {VOZ.maxS} segundos de cada frase que fica a um toque na mesa. Quando tu manda, é a tua voz que a mesa ouve (gritada, mais alto). Fica neste
        aparelho e só passa pela sala enquanto tu estiver nela.
      </p>
      <ul className="flex flex-col divide-y divide-tinta/10">
        {favoritas.map((id) => {
          const r = REACTIONS.find((x) => x.id === id);
          if (!r) return null;
          const tem = !!vozes[id];
          const agora = gravando === id;
          return (
            <li key={id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="mr-auto flex min-w-0 items-center gap-2 font-semibold">
                <span aria-hidden="true" className="text-xl leading-none">
                  {r.emoji}
                </span>
                <span className="truncate">{r.label}</span>
              </span>
              {agora ? (
                <span className="flex items-center gap-2" role="status" aria-label={`Gravando "${r.label}"`}>
                  <span className="relative h-3 w-28 overflow-hidden rounded-full bg-tinta/15">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-copas transition-[width] duration-100" style={{ width: `${Math.round(nivel * 100)}%` }} />
                  </span>
                  <Button size="sm" variant="copas" onClick={() => parar.current?.abort()}>
                    Pronto
                  </Button>
                </span>
              ) : (
                <>
                  {tem && (
                    <Button
                      size="sm"
                      variant="vidro"
                      className="!px-3"
                      aria-label={`Ouvir "${r.label}" na tua voz`}
                      title="Ouvir"
                      onClick={() => {
                        forcarAudio();
                        tocarVoz(vozes[id]!);
                      }}
                      icon={<Play />}
                    />
                  )}
                  <Button size="sm" variant={tem ? 'vidro' : 'ouro'} disabled={gravando !== null} onClick={() => void comecar(id)} icon={<Mic />}>
                    {tem ? 'Regravar' : 'Gravar'}
                  </Button>
                  {tem && (
                    <Button size="sm" variant="vidro" className="!px-3" aria-label={`Apagar a gravação de "${r.label}"`} title="Apagar" onClick={() => apagar(id)} icon={<Trash2 />} />
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {!efeitos && <p className="text-sm font-semibold text-copas">Os efeitos estão desligados: liga em "Efeitos" para ouvir as vozes na mesa.</p>}
      {recado && (
        <p role="alert" className="text-sm font-semibold text-copas">
          {recado}
        </p>
      )}
    </div>
  );
}
