import { Mic, MicOff, Video, VideoOff, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { midia, useMidia } from '../../lib/midia';
import { rem } from '../../lib/ui-scale';
import { useOnline } from '../../stores/online';
import { useSettings } from '../../stores/settings';
import { Avatar } from './Avatar';
import { IconButton } from './Button';
import { Toggle } from './Controls';

/** A sala tem gente de verdade para conversar (pelo menos duas pessoas). */
export function useTemConversa(): boolean {
  return useOnline((s) => (s.room?.seats.filter((x) => x.kind === 'human').length ?? 0) >= 2);
}

/** Alguém da sala está de câmera aberta (os assentos crescem para o rosto caber). */
export function useAlgumaCamera(): boolean {
  return useOnline((s) => s.room?.midias?.some((m) => m.camera) ?? false);
}

/** O que esta pessoa abriu para a mesa. */
function useAberto(playerId: string) {
  const m = useOnline((s) => s.room?.midias?.find((x) => x.playerId === playerId) ?? null);
  return { mic: m?.mic ?? false, camera: m?.camera ?? false };
}

/**
 * Microfone e câmera no alto da sala e da mesa: dois botões, cada um abre e fecha o seu (o navegador
 * pede a permissão no primeiro toque). Nada aberto é o padrão; aberto fica verde, e o microfone acende
 * enquanto tu fala. A sala toda ouve e vê o que tu abrir.
 */
export function ControlesDeMidia({ compacto = false }: { compacto?: boolean }) {
  const tem = useTemConversa();
  const erro = useMidia((s) => s.erro);
  const mic = useMidia((s) => s.mic);
  const eu = useOnline((s) => s.room?.youId ?? null);
  const falando = useMidia((s) => (eu ? !!s.falando[eu] : false));
  // O erro (sem permissão) aparece um pouco e some.
  useEffect(() => {
    if (!erro) return undefined;
    const t = window.setTimeout(() => useMidia.setState({ erro: null }), 5000);
    return () => window.clearTimeout(t);
  }, [erro]);
  if (!tem) return null;
  return (
    <div className="relative">
      {/* Na mesa (e em tela estreita): um botão só, que abre as chaves; na sala, os dois botões. */}
      <div className={compacto ? '' : 'min-[360px]:hidden'}>
        <MidiaCompacta falando={falando && mic} />
      </div>
      {!compacto && (
        <div className="max-[359px]:hidden">
          <DoisBotoes falando={falando && mic} />
        </div>
      )}
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

function DoisBotoes({ falando }: { falando: boolean }) {
  const { mic, camera, pedindo } = useMidia();
  const botao = (aberto: boolean) =>
    `inline-flex h-11 w-11 items-center justify-center text-papel transition active:scale-95 disabled:opacity-60 ${aberto ? 'bg-paus' : 'bg-transparent'}`;
  return (
      <div
        role="group"
        aria-label="Microfone e câmera"
        className={`flex overflow-hidden rounded-full bg-noite/45 ring-1 backdrop-blur-sm ${falando ? 'ring-2 ring-[rgb(120_220_140)] shadow-[0_0_14px_3px_rgb(120_220_140/0.6)]' : 'ring-papel/15'}`}
      >
        <button
          type="button"
          aria-pressed={mic}
          aria-label={mic ? 'Fechar o microfone' : 'Abrir o microfone'}
          title={mic ? 'Microfone aberto: toca para fechar' : 'Abrir o microfone'}
          disabled={pedindo !== null}
          onClick={() => void midia.alternarMic()}
          className={botao(mic)}
        >
          {mic ? <Mic size={20} /> : <MicOff size={20} className="opacity-80" />}
        </button>
        <span aria-hidden="true" className="w-px self-stretch bg-papel/15" />
        <button
          type="button"
          aria-pressed={camera}
          aria-label={camera ? 'Fechar a câmera' : 'Abrir a câmera'}
          title={camera ? 'Câmera aberta: toca para fechar' : 'Abrir a câmera'}
          disabled={pedindo !== null}
          onClick={() => void midia.alternarCamera()}
          className={botao(camera)}
        >
          {camera ? <Video size={20} /> : <VideoOff size={20} className="opacity-80" />}
        </button>
      </div>
  );
}

/** Um botão com o estado (câmera, microfone ou nada) que abre as chaves de microfone e câmera. */
function MidiaCompacta({ falando }: { falando: boolean }) {
  const { mic, camera } = useMidia();
  const ouvirConversa = useSettings((s) => s.ouvirConversa);
  const set = useSettings((s) => s.set);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener('pointerdown', fora);
    return () => window.removeEventListener('pointerdown', fora);
  }, [aberto]);
  const Icone = camera ? Video : mic ? Mic : MicOff;
  const estado = mic && camera ? 'microfone e câmera abertos' : camera ? 'câmera aberta' : mic ? 'microfone aberto' : 'nada aberto';
  return (
    <div ref={caixa} className="relative">
      <IconButton
        label={`Microfone e câmera: ${estado}`}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={`${mic || camera ? 'bg-paus' : ''} ${falando ? 'ring-2 ring-[rgb(120_220_140)] shadow-[0_0_14px_3px_rgb(120_220_140/0.6)]' : ''}`}
      >
        <Icone size={20} />
      </IconButton>
      {aberto && (
        <div
          role="dialog"
          aria-label="Microfone e câmera"
          className="papel absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl px-4 py-1 text-tinta shadow-[0_12px_30px_rgb(0_0_0/0.45)] ring-1 ring-black/10"
        >
          <Toggle checked={mic} onChange={() => void midia.alternarMic()} label="Microfone" description="A sala toda te ouve" />
          <Toggle checked={camera} onChange={() => void midia.alternarCamera()} label="Câmera" description="Teu rosto no lugar do avatar" />
          <Toggle checked={ouvirConversa} onChange={(on) => set({ ouvirConversa: on })} label="Ouvir a conversa" description="O microfone de quem abriu" />
        </div>
      )}
    </div>
  );
}

/** Um vídeo redondo (o rosto no lugar do avatar); a tua prévia vem espelhada. */
function VideoRedondo({ stream, size, espelho, dim }: { stream: MediaStream; size: number; espelho: boolean; dim?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const versao = useMidia((s) => s.versao);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    void v.play().catch(() => undefined);
  }, [stream, versao]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      className="block shrink-0 rounded-full bg-noite object-cover"
      style={{
        width: rem(size),
        height: rem(size),
        transform: espelho ? 'scaleX(-1)' : undefined,
        boxShadow: '0 2px 6px rgb(0 0 0 / 0.35)',
        filter: dim ? 'grayscale(1) brightness(0.7)' : undefined,
      }}
    />
  );
}

/**
 * O rosto de quem está na mesa: com a câmera aberta, o vídeo no lugar do avatar (maior, `tamanhoVideo`);
 * senão, o avatar. Em volta, o microfone (vermelho quando fechado com a câmera aberta) e, enquanto a
 * pessoa fala, um anel verde. Tocar no rosto abre o vídeo grande.
 */
export function RostoNaMesa({
  playerId,
  seed,
  size,
  tamanhoVideo = size,
  dim,
}: {
  playerId: string;
  seed: string;
  size: number;
  tamanhoVideo?: number;
  dim?: boolean;
}) {
  const eu = useOnline((s) => s.room?.youId === playerId);
  const aberto = useAberto(playerId);
  const stream = useMidia((s) => (eu ? s.local : (s.remotos[playerId] ?? null)));
  const temVideo = useMidia((s) => {
    if (eu) return !!s.local;
    const r = s.remotos[playerId];
    return !!r && r.getVideoTracks().some((t) => t.readyState === 'live');
  });
  const falando = useMidia((s) => !!s.falando[playerId]);
  // No teu rosto, depois de abrir o microfone uma vez, o selo é o botão de abrir e fechar (a um toque).
  const meuMic = useMidia((s) => (eu && s.usouMic ? s.mic : null));
  const comVideo = aberto.camera && temVideo && !!stream;
  const d = comVideo ? tamanhoVideo : size;
  return (
    <span className="relative inline-block shrink-0" style={{ width: rem(d), height: rem(d) }}>
      {comVideo ? (
        <button
          type="button"
          aria-label="Ver o vídeo grande"
          className="block rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            useMidia.setState({ ampliado: playerId });
          }}
        >
          <VideoRedondo stream={stream} size={d} espelho={eu} dim={dim} />
        </button>
      ) : (
        <Avatar seed={seed} size={size} dim={dim} />
      )}
      {falando && aberto.mic && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full ring-[3px] ring-[rgb(120_220_140)] shadow-[0_0_16px_4px_rgb(120_220_140/0.7)]"
          style={{ width: `calc(${rem(d)} + 6px)`, height: `calc(${rem(d)} + 6px)` }}
        />
      )}
      {meuMic !== null ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void midia.alternarMic();
          }}
          aria-label={meuMic ? 'Fechar o microfone' : 'Abrir o microfone'}
          className={`absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full text-papel ring-2 ring-noite/60 active:scale-90 ${meuMic ? 'bg-paus' : 'bg-copas'}`}
        >
          {meuMic ? <Mic size={14} strokeWidth={2.6} /> : <MicOff size={14} strokeWidth={2.6} />}
        </button>
      ) : (
        (aberto.mic || aberto.camera) && (
          <span
            className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-papel ring-2 ring-noite/60 ${aberto.mic ? 'bg-paus' : 'bg-copas'}`}
            aria-label={aberto.mic ? (falando ? 'falando' : 'microfone aberto') : 'microfone fechado'}
            role="img"
          >
            {aberto.mic ? <Mic size={11} strokeWidth={2.6} /> : <MicOff size={11} strokeWidth={2.6} />}
          </span>
        )
      )}
    </span>
  );
}

/** O vídeo de alguém em tamanho grande, por cima da mesa (toque em qualquer lugar fecha). */
export function VideoAmpliado() {
  const id = useMidia((s) => s.ampliado);
  const room = useOnline((s) => s.room);
  const eu = room?.youId === id;
  const stream = useMidia((s) => (id ? (eu ? s.local : (s.remotos[id] ?? null)) : null));
  const aberto = room?.midias?.find((m) => m.playerId === id);
  const nome = room?.seats.find((x) => x.playerId === id)?.name ?? '';
  const mostrar = !!id && !!stream && !!aberto?.camera;
  // A pessoa fechou a câmera: o grande fecha também.
  useEffect(() => {
    if (id && !mostrar) useMidia.setState({ ampliado: null });
  }, [id, mostrar]);
  return (
    <AnimatePresence>
      {mostrar && stream && (
        <motion.div
          key={id}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-noite/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => useMidia.setState({ ampliado: null })}
          role="dialog"
          aria-label={`Vídeo de ${nome}`}
        >
          <motion.div
            className="relative w-full max-w-[26rem]"
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <VideoGrande stream={stream} espelho={eu} />
            <span className="absolute bottom-3 left-3 rounded-full bg-noite/70 px-3 py-1 text-sm font-bold text-papel">{eu ? 'Tu' : nome}</span>
            <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-noite/70 text-papel" aria-hidden="true">
              <X size={18} />
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function VideoGrande({ stream, espelho }: { stream: MediaStream; espelho: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const versao = useMidia((s) => s.versao);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    void v.play().catch(() => undefined);
  }, [stream, versao]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      className="aspect-square w-full rounded-3xl bg-noite object-cover shadow-2xl ring-2 ring-papel/20"
      style={{ transform: espelho ? 'scaleX(-1)' : undefined }}
    />
  );
}

/**
 * Na sala de espera: quem abriu microfone ou câmera (e o lembrete de que a sala toda vê e ouve).
 */
export function ConversaNaSala() {
  const tem = useTemConversa();
  const room = useOnline((s) => s.room);
  const abertos = room?.midias ?? [];
  if (!tem || abertos.length === 0) return null;
  const nome = (id: string) => (id === room?.youId ? 'tu' : (room?.seats.find((x) => x.playerId === id)?.name ?? ''));
  const comMic = abertos.filter((m) => m.mic).map((m) => nome(m.playerId));
  const comCamera = abertos.filter((m) => m.camera).map((m) => nome(m.playerId));
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-semibold text-papel texto-gravado">
      {comMic.length > 0 && (
        <span className="inline-flex items-center gap-1">
          <Mic size={15} aria-hidden="true" /> {comMic.join(', ')}
        </span>
      )}
      {comCamera.length > 0 && (
        <span className="inline-flex items-center gap-1">
          <Video size={15} aria-hidden="true" /> {comCamera.join(', ')}
        </span>
      )}
    </p>
  );
}
