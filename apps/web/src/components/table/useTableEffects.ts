import type { Play, PlayerView } from '@fodinha/engine';
import { useEffect, useRef } from 'react';
import type { ViewUpdate } from '../../lib/connection';
import { setMyTurn, warnTurn } from '../../lib/avisos';
import { haptic } from '../../lib/haptics';
import { play, type SoundId } from '../../lib/sound';
import { useSettings } from '../../stores/settings';
import {
  acertoDe,
  chaveDoGolpe,
  contextoDaRodada,
  golpeComAnimacao,
  golpesDaMao,
  manilhaNaTesta,
  mesaMudou,
  mesaVista,
  ritmoDosGolpes,
  type Golpe,
  type GolpeNaMao,
  type MesaVista,
} from './manilhas';

const played = (v: PlayerView) => v.completedTricks.reduce((n, t) => n + t.plays.length, 0) + (v.trick?.plays.length ?? 0);
const bids = (v: PlayerView) => v.players.filter((p) => p.bid !== null).length;

/**
 * Quando a mesa começa a "puxar fumo" esperando quem está demorando (os avatares acendem o palheiro,
 * em `GameScreen`, e ouve-se a tragada), e quando traga de novo.
 */
export const DEMORA_MS = 9000;
const FUMO_DE_NOVO_MS = 16000;

/** O som de cada golpe de "Quem mata quem", na hora em que a arma acerta (os mesmos arquivos, em outro tom). */
const SOM_GOLPE: Record<Golpe, { id: SoundId; rate: number }> = {
  corta: { id: 'corte', rate: 1 },
  bate: { id: 'play', rate: 0.55 },
  fura: { id: 'bid', rate: 1.7 },
  brilha: { id: 'made', rate: 1.2 },
  vinho: { id: 'pop', rate: 0.8 },
};

/** A mão que está na mesa (a atual, ou a que acabou de fechar). */
function maoDaView(v: PlayerView): { plays: readonly Play[]; fechada: boolean } {
  const fechada = v.phase === 'trickEnd';
  return { plays: (fechada ? v.lastTrick?.plays : v.trick?.plays) ?? [], fechada };
}

function somDoGolpe(g: GolpeNaMao, ritmo: number) {
  const som = SOM_GOLPE[g.golpe];
  const ms = (s: number) => (s * 1000) / ritmo;
  // O espadão: o aço sai ("shing") no começo da varrida e cada carta cortada faz o seu corte (até
  // quatro, um pouco mais agudo a cada uma). Os outros acertam uma carta de cada vez (até três); a luz
  // do belo soa uma vez.
  if (g.golpe === 'corta') play('espada', { delayMs: ms(Math.max(0, acertoDe(g, 0) - 0.22)) });
  const vezes = g.golpe === 'brilha' ? 1 : Math.min(g.vitimas.length, g.golpe === 'corta' ? 4 : 3);
  for (let i = 0; i < vezes; i++) play(som.id, { delayMs: ms(acertoDe(g, i)), rate: som.rate * (g.golpe === 'corta' ? 1 + i * 0.06 : 1) });
}

/** Sons e vibração a partir da diferença entre a visão anterior e a atual. */
export function useTableEffects(update: ViewUpdate | null, online = false, ritmo = 1) {
  const prev = useRef<PlayerView | null>(null);
  // Quem mata quem: o que a mesa já mostrou (a mesma conta da `TrickArea`) e os golpes que já soaram.
  const mesa = useRef<MesaVista | null>(null);
  const soados = useRef({ chave: '', golpes: new Set<string>() });
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

    // Cada golpe soa uma vez, quando a arma acerta; o que a mesa não anima (já estava lá quando ela
    // apareceu, ou chegou de uma vez quando a conexão voltou) também não soa.
    const mao = maoDaView(v);
    const antes = mesa.current;
    const agora = antes && !mesaMudou(antes, v.roundNumber, mao.plays, mao.fechada) ? antes : mesaVista(antes, v.roundNumber, mao.plays, mao.fechada);
    mesa.current = agora;
    if (soados.current.chave !== agora.chave) soados.current = { chave: agora.chave, golpes: new Set() };
    for (const g of golpesDaMao(mao.plays, contextoDaRodada(v.rules, v.vira), mao.fechada)) {
      const k = chaveDoGolpe(g);
      if (soados.current.golpes.has(k) || !golpeComAnimacao(g, mao.plays, agora)) continue;
      soados.current.golpes.add(k);
      somDoGolpe(g, ritmoDosGolpes(ritmo));
    }
    const newRound = !p || v.roundNumber !== p.roundNumber;
    if (newRound && v.phase === 'bidding') {
      play('shuffle');
      const n = Math.min(v.cardsThisRound * Math.min(v.order.length, 3), 10);
      for (let i = 0; i < n; i++) play('deal', { delayMs: 180 + i * 65 });
    }
    if (!p || v.seq === p.seq) return;

    if (v.roundNumber === p.roundNumber && bids(v) > bids(p)) play('bid');
    if (v.roundNumber === p.roundNumber && played(v) > played(p)) play('play');
    if (v.phase === 'trickEnd' && p.phase !== 'trickEnd' && (v.lastTrick?.cancelled.length ?? 0) > 0) {
      play('melou', { delayMs: 280 });
    }
    // A manilha estava na testa de quem cantou zero: a corneta da desgraça, junto com a cena.
    if (v.phase === 'trickEnd' && p.phase !== 'trickEnd' && manilhaNaTesta(v)) play('eliminated', { delayMs: 900, rate: 1.15 });
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
  }, [update, hapticsOn, online, ritmo]);

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

  // Alguém demorando (tu também): os avatares acendem o palheiro e a mesa ouve a tragada ("barulhinho
  // de puxando fumo quando o cara demora", o Igor, 29/09/2026). Duas vezes no máximo por vez, e só com
  // o jogo na frente.
  const view = update?.view;
  const esperando = view?.actor && (view.phase === 'bidding' || view.phase === 'playing') ? `${view.seq}:${view.actor.playerId}` : null;
  useEffect(() => {
    if (!esperando) return undefined;
    const timers = [0, 1].map((i) =>
      window.setTimeout(() => {
        if (document.visibilityState === 'visible') play('fumo');
      }, DEMORA_MS + i * FUMO_DE_NOVO_MS),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [esperando]);
}
