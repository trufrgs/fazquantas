import type { PlayerView } from '@fodinha/engine';
import { useEffect, useRef } from 'react';
import type { ViewUpdate } from '../../lib/connection';
import { setMyTurn, warnTurn } from '../../lib/avisos';
import { haptic } from '../../lib/haptics';
import { play, type SoundId } from '../../lib/sound';
import { useSettings } from '../../stores/settings';
import { contextoDaRodada, manilhaDe, manilhasQueimadas, type EfeitoManilha } from './manilhas';

const played = (v: PlayerView) => v.completedTricks.reduce((n, t) => n + t.plays.length, 0) + (v.trick?.plays.length ?? 0);
const bids = (v: PlayerView) => v.players.filter((p) => p.bid !== null).length;

/** O som de cada manilha na mesa (os mesmos arquivos, em outro tom). */
const SOM_MANILHA: Record<EfeitoManilha, { id: SoundId; rate: number }> = {
  corte: { id: 'sweep', rate: 1.7 },
  aco: { id: 'bid', rate: 1.6 },
  pancada: { id: 'play', rate: 0.55 },
  ouro: { id: 'made', rate: 1.3 },
  brasa: { id: 'pop', rate: 0.7 },
};

/** A carta que acabou de cair na mesa (na mão atual, ou na que acabou de fechar). */
function ultimaJogada(v: PlayerView) {
  return v.trick?.plays.at(-1) ?? (v.phase === 'trickEnd' ? v.lastTrick?.plays.at(-1) : undefined);
}

/** Sons e vibração a partir da diferença entre a visão anterior e a atual. */
export function useTableEffects(update: ViewUpdate | null, online = false) {
  const prev = useRef<PlayerView | null>(null);
  const hapticsOn = useSettings((s) => s.haptics);

  // Saiu da mesa: não é mais a vez de ninguém aqui.
  useEffect(() => () => setMyTurn(false), []);

  useEffect(() => {
    const v = update?.view ?? null;
    const p = prev.current;
    prev.current = v;
    if (!v) return;
    const you = v.you;
    if (online) setMyTurn(v.actor?.playerId === you);
    const newRound = !p || v.roundNumber !== p.roundNumber;
    if (newRound && v.phase === 'bidding') {
      play('shuffle');
      const n = Math.min(v.cardsThisRound * Math.min(v.order.length, 3), 10);
      for (let i = 0; i < n; i++) play('deal', { delayMs: 180 + i * 65 });
    }
    if (!p || v.seq === p.seq) return;

    if (v.roundNumber === p.roundNumber && bids(v) > bids(p)) play('bid');
    const ctx = contextoDaRodada(v.rules, v.vira);
    if (v.roundNumber === p.roundNumber && played(v) > played(p)) {
      play('play');
      const nova = ultimaJogada(v);
      const manilha = nova ? manilhaDe(nova.cardId, ctx) : null;
      if (manilha) play(SOM_MANILHA[manilha.efeito].id, { delayMs: 90, rate: SOM_MANILHA[manilha.efeito].rate });
    }
    if (v.phase === 'trickEnd' && p.phase !== 'trickEnd' && (v.lastTrick?.cancelled.length ?? 0) > 0) {
      play('melou', { delayMs: 280 });
    }
    // Manilha batida por uma mais forte: queimou.
    if (v.phase === 'trickEnd' && p.phase !== 'trickEnd' && v.lastTrick && manilhasQueimadas(v.lastTrick, ctx).length > 0) {
      play('lifeLost', { delayMs: 380, rate: 1.6 });
    }
    if (p.phase === 'trickEnd' && v.phase !== 'trickEnd') play('sweep');

    const myTurnNow = v.actor?.playerId === you;
    const myTurnBefore = p.actor?.playerId === you && p.actor?.kind === v.actor?.kind;
    if (myTurnNow && !myTurnBefore && !(v.phase === 'playing' && v.handHidden)) {
      play('turn');
      void haptic('turn', hapticsOn);
      if (online && v.actor) {
        const left = v.turnDeadline ? Math.max(0, Math.round((v.turnDeadline - Date.now()) / 1000)) : null;
        warnTurn(v.actor.kind, left);
      }
    }

    if (v.phase === 'roundEnd' && p.phase !== 'roundEnd' && you) {
      const rec = v.history.at(-1);
      if (rec && rec.bids[you] !== undefined) {
        const lost = (rec.livesBefore[you] ?? 0) - (rec.livesAfter[you] ?? 0);
        if (rec.eliminated.includes(you)) {
          play('eliminated', { delayMs: 350 });
          void haptic('heavy', hapticsOn);
        } else if (lost > 0) {
          play('lifeLost', { delayMs: 250 });
          void haptic('heavy', hapticsOn);
        } else {
          play('made', { delayMs: 250 });
          void haptic('success', hapticsOn);
        }
      } else if (rec && rec.eliminated.length > 0) play('pop');
    }
    if (v.phase === 'gameOver' && p.phase !== 'gameOver' && you && v.result?.winners.includes(you)) {
      play('win', { delayMs: 200 });
      void haptic('success', hapticsOn);
    }
  }, [update, hapticsOn, online]);

  // Tique-taque nos últimos 5 segundos da sua vez.
  const deadline = update?.view.actor?.playerId === update?.view.you ? (update?.view.turnDeadline ?? null) : null;
  useEffect(() => {
    if (!deadline) return undefined;
    const id = window.setInterval(() => {
      const left = deadline - Date.now();
      if (left > 0 && left <= 5200) play('tick');
    }, 1000);
    return () => window.clearInterval(id);
  }, [deadline]);
}
