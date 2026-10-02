import type { PlateiaPublic, RoomState } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { play } from '../../lib/sound';
import { rem } from '../../lib/ui-scale';
import type { LiveReaction } from '../../stores/game';
import { ehPatrao, useOnline } from '../../stores/online';
import { ReactionBubble } from '../table/Seat';
import { Button } from '../ui/Button';
import { RostoNaMesa } from '../ui/Midia';

/**
 * A plateia e os patrões (pedido do Thomas em 02/10/2026): quem chega com a partida rolando (ou a mesa
 * cheia) assiste de fora, conversa e abre a câmera, que aparece em preto e branco; pede para jogar a
 * próxima e um patrão aceita. Os patrões mandam na mesa (o chapéu ao lado do nome).
 */

/** O que a pessoa da plateia pediu, em palavras. */
function situacao(p: PlateiaPublic): string {
  if (p.aceito) return 'joga a próxima';
  if (p.quer) return 'quer jogar a próxima';
  return 'assistindo';
}

/** O botão da plateia para pedir (ou desistir de) jogar a próxima. */
export function BotaoQueroJogar({ room, size = 'sm' }: { room: RoomState; size?: 'sm' | 'md' | 'lg' }) {
  const eu = room.plateia?.find((p) => p.playerId === room.youId);
  if (!eu) return null;
  const querJogar = useOnline.getState().querJogar;
  if (eu.aceito)
    return (
      <Button size={size} variant="papel" onClick={() => querJogar(false)}>
        Tu joga a próxima · desistir
      </Button>
    );
  return eu.quer ? (
    <Button size={size} variant="papel" onClick={() => querJogar(false)}>
      Pedido feito · desistir
    </Button>
  ) : (
    <Button size={size} variant="ouro" onClick={() => querJogar(true)}>
      Quero jogar a próxima
    </Button>
  );
}

/** Na sala de espera: quem está na plateia, com o pedido de cada um e, para o patrão, aceitar e tirar. */
export function PainelDaPlateia({ room }: { room: RoomState }) {
  const plateia = room.plateia ?? [];
  if (plateia.length === 0) return null;
  const patrao = ehPatrao(room);
  const { aceitar, removeSeat } = useOnline.getState();
  return (
    <section className="papel rounded-3xl p-4 shadow-[0_10px_28px_rgb(0_0_0/0.35)]" aria-label="Plateia">
      <h2 className="mb-1 font-display text-xl font-bold" style={{ fontVariationSettings: '"SOFT" 100' }}>
        Na plateia ({plateia.length}/{room.plateiaCapacity ?? plateia.length})
      </h2>
      <p className="mb-1 text-sm text-tinta-2">Assistem sem jogar e podem conversar. Quem um patrão aceitar senta na próxima partida, se tiver lugar.</p>
      <ul className="flex flex-col divide-y divide-tinta/10">
        {plateia.map((p) => (
          <li key={p.playerId} className="flex items-center gap-3 py-2">
            <RostoNaMesa playerId={p.playerId} seed={p.avatar} size={40} tamanhoVideo={56} pb dim={!p.connected} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.playerId === room.youId ? `${p.name} (tu)` : p.name}</span>
              <span className={`text-sm ${p.quer || p.aceito ? 'font-semibold text-tinta' : 'text-tinta-2'}`}>{situacao(p)}</span>
            </span>
            {patrao && p.quer && !p.aceito && (
              <>
                <Button size="sm" variant="ouro" onClick={() => aceitar(p.playerId, true)}>
                  Aceitar
                </Button>
                <button
                  type="button"
                  onClick={() => aceitar(p.playerId, false)}
                  className="flex h-9 items-center rounded-full bg-tinta/8 px-3 text-sm font-semibold text-tinta-2"
                >
                  Agora não
                </button>
              </>
            )}
            {patrao && p.playerId !== room.youId && !(p.quer && !p.aceito) && (
              <button
                type="button"
                onClick={() => removeSeat(p.playerId)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-tinta/8 text-tinta-2"
                aria-label={`Tirar ${p.name} da sala`}
              >
                <X size="1.125rem" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {(room.plateia ?? []).some((p) => p.playerId === room.youId) && (
        <div className="mt-2 flex justify-center">
          <BotaoQueroJogar room={room} />
        </div>
      )}
    </section>
  );
}

/**
 * Na mesa, para os patrões: o pedido de quem quer jogar a próxima, um de cada vez, pequeno no alto da
 * mesa (não cobre a mão nem o painel). Ouve-se um estalo quando chega pedido novo.
 */
export function PedidoDaPlateia({ room }: { room: RoomState | null }) {
  const patrao = ehPatrao(room);
  const pedido = patrao ? (room?.plateia ?? []).find((p) => p.quer && !p.aceito) : undefined;
  const antes = useRef<string | null>(null);
  useEffect(() => {
    if (pedido && pedido.playerId !== antes.current) play('pop');
    antes.current = pedido?.playerId ?? null;
  }, [pedido]);
  const { aceitar } = useOnline.getState();
  return (
    <AnimatePresence>
      {pedido && (
        <motion.div
          key={pedido.playerId}
          role="status"
          className="papel absolute left-1/2 top-2 z-[45] flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full py-1 pl-1.5 pr-1.5 shadow-[0_10px_24px_rgb(0_0_0/0.5)] ring-1 ring-black/10"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        >
          <RostoNaMesa playerId={pedido.playerId} seed={pedido.avatar} size={28} pb />
          <span className="min-w-0 truncate text-sm font-semibold">
            <strong>{pedido.name}</strong> quer jogar a próxima
          </span>
          <button type="button" onClick={() => aceitar(pedido.playerId, true)} className="ficha ficha-ouro min-h-8 rounded-full px-3 text-sm">
            Aceitar
          </button>
          <button
            type="button"
            onClick={() => aceitar(pedido.playerId, false)}
            className="flex size-8 items-center justify-center rounded-full bg-tinta/8 text-tinta-2"
            aria-label={`Agora não, ${pedido.name}`}
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Quantos rostos da plateia cabem no canto da mesa (o resto vira "+N"). */
export const ROSTOS_DA_PLATEIA = 3;

/**
 * A plateia na mesa: os rostos em preto e branco no canto de baixo, à esquerda (a mesa reserva o
 * canto), com as frases que ela manda em balão. Tocar no rosto de câmera aberta amplia.
 */
export function PlateiaNaMesa({ room, reactions, tamanho }: { room: RoomState | null; reactions: readonly LiveReaction[]; tamanho: number }) {
  const plateia = room?.plateia ?? [];
  if (plateia.length === 0) return null;
  const vistos = plateia.slice(0, ROSTOS_DA_PLATEIA);
  const resto = plateia.length - vistos.length;
  return (
    <div className="absolute bottom-2 left-2 z-[12] flex items-end gap-1.5" role="group" aria-label={`Plateia: ${plateia.map((p) => p.name).join(', ')}`}>
      {vistos.map((p) => {
        const r = [...reactions].reverse().find((x) => x.playerId === p.playerId);
        return (
          <div key={p.playerId} className="relative flex flex-col items-center" style={{ width: rem(tamanho + 6) }}>
            <RostoNaMesa playerId={p.playerId} seed={p.avatar} size={tamanho} tamanhoVideo={tamanho} pb dim={!p.connected} />
            <span className="mt-0.5 max-w-full truncate text-[0.625rem] font-bold leading-none text-papel/80 texto-gravado">{p.name}</span>
            <ReactionBubble reaction={r} placement="above" edge="left" />
          </div>
        );
      })}
      {resto > 0 && (
        <span className="mb-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-noite/70 px-1.5 text-xs font-bold text-papel ring-1 ring-papel/20">
          +{resto}
        </span>
      )}
    </div>
  );
}

/** Para a mesa reservar o canto da plateia (px na escala 1). */
export function cantoDaPlateia(n: number, tamanho: number): { w: number; h: number } {
  const rostos = Math.min(n, ROSTOS_DA_PLATEIA);
  return { w: 8 + rostos * (tamanho + 6 + 6) + (n > ROSTOS_DA_PLATEIA ? 30 : 0), h: tamanho + 22 };
}
