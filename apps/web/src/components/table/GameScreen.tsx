import {
  card,
  createRng,
  DEFAULT_TIMING,
  isManilha,
  sortByStrength,
  strength,
  suggest,
  type CardId,
  type ClientAction,
  type PlayerView,
  type Suit,
} from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameConnection, SeatInfo, ViewUpdate } from '../../lib/connection';
import { leaveTable, startLocalGame } from '../../lib/game-actions';
import { haptic } from '../../lib/haptics';
import { play } from '../../lib/sound';
import { useApp } from '../../stores/app';
import { useGame, type LiveReaction } from '../../stores/game';
import { isHost, useOnline } from '../../stores/online';
import { SPEED_MULTIPLIER, useSettings } from '../../stores/settings';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { BidPanel } from './BidPanel';
import { CoachTip, markTipSeen, type TipId } from './CoachTip';
import { ForcaChip, Hierarchy } from './ForcaChip';
import { GameOver } from './GameOver';
import { Hand } from './Hand';
import { isCompact, SEAT_BOX, tableGeometry } from './layout';
import { MySeat, type StatusTone } from './MySeat';
import { PauseMenu } from './PauseMenu';
import { ReactionPicker } from './ReactionPicker';
import { RoundSummary } from './RoundSummary';
import { Scoreboard } from './Scoreboard';
import { Seat } from './Seat';
import { TopBar } from './TopBar';
import { TrickArea } from './TrickArea';
import { useSize } from './useSize';
import { useTableEffects } from './useTableEffects';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const SUIT_ORDER: Suit[] = ['O', 'C', 'E', 'P'];

function statusLine(view: PlayerView, name: (id: string) => string): { text: string; tone: StatusTone } {
  const you = view.you;
  const me = view.players.find((p) => p.id === you);
  if (view.phase === 'gameOver') return { text: 'Fim de jogo', tone: 'info' };
  if (me?.eliminated) return { text: 'Você está fora — assistindo', tone: 'bad' };
  if (view.phase === 'roundEnd') return { text: 'Fim da rodada', tone: 'info' };
  if (view.phase === 'trickEnd') {
    const w = view.lastTrick?.winnerId ?? null;
    if (w === null) return { text: 'Melou! Ninguém fez', tone: 'info' };
    return w === you ? { text: 'Você fez a vaza', tone: 'good' } : { text: `${name(w)} fez a vaza`, tone: 'info' };
  }
  const actor = view.actor;
  if (!actor) return { text: '', tone: 'info' };
  if (actor.playerId !== you) {
    return { text: actor.kind === 'bid' ? `${name(actor.playerId)} palpitando…` : `Vez de ${name(actor.playerId)}`, tone: 'info' };
  }
  if (actor.kind === 'bid') return { text: 'Sua vez de palpitar', tone: 'turn' };
  if (view.handHidden) return { text: 'Revelando sua carta…', tone: 'turn' };
  const need = (me?.bid ?? 0) - (me?.tricks ?? 0);
  if (need > 0) return { text: `Sua vez: falta${need > 1 ? 'm' : ''} ${need}`, tone: 'turn' };
  if (need === 0) return { text: 'Sua vez: não faça mais', tone: 'turn' };
  return { text: 'Sua vez: já passou', tone: 'turn' };
}

export function GameScreen() {
  const conn = useGame((s) => s.conn);
  const update = useGame((s) => s.update);
  const seats = useGame((s) => s.seats);
  const reactions = useGame((s) => s.reactions);
  useTableEffects(update);
  if (!conn || !update) {
    return (
      <div className="mesa flex h-full items-center justify-center">
        <Button variant="ouro" onClick={leaveTable}>
          Voltar ao início
        </Button>
      </div>
    );
  }
  return <Table conn={conn} update={update} seats={seats} reactions={reactions} />;
}

function Table({ conn, update, seats, reactions }: { conn: GameConnection; update: ViewUpdate; seats: SeatInfo[]; reactions: LiveReaction[] }) {
  const view = update.view;
  const settings = useSettings();
  const go = useApp((s) => s.go);
  const room = useOnline((s) => s.room);
  const onlineStatus = useOnline((s) => s.status);
  const [rootRef, root] = useSize<HTMLDivElement>();
  const [tableRef, table] = useSize<HTMLDivElement>();
  const [menu, setMenu] = useState(false);
  const [score, setScore] = useState(false);
  const [forca, setForca] = useState(false);
  const [picker, setPicker] = useState(false);
  // Trava a entrada entre mandar a jogada e a próxima visão chegar (derivado do `seq`).
  const [pendingAt, setPendingAt] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const online = conn.kind === 'online';
  const you = view.you;
  const me = view.players.find((p) => p.id === you);
  const seatOf = useCallback((id: string) => seats.find((s) => s.id === id), [seats]);
  const nameOf = useCallback((id: string) => view.players.find((p) => p.id === id)?.name ?? '', [view.players]);

  // Pausa o host local enquanto um menu cobre a mesa.
  useEffect(() => {
    if (online) return undefined;
    if (menu) conn.pause?.();
    else conn.resume?.();
    return undefined;
  }, [menu, online, conn]);


  // Botão voltar do Android (e Esc no desktop) abre o menu da partida.
  useEffect(() => {
    const toggle = () => setMenu((m) => !m);
    // Esc só abre; quem fecha é a própria folha (senão as duas coisas brigam).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !menu && !score && !forca) setMenu(true);
    };
    window.addEventListener('fodinha:voltar', toggle);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('fodinha:voltar', toggle);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, score, forca]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Aviso quando o tempo acabou e o servidor jogou por você (vem do store).
  const notice = useGame((s) => s.notice);
  useEffect(() => {
    if (!notice) return undefined;
    const t = window.setTimeout(() => useGame.getState().clearNotice(notice.key), 2600);
    return () => window.clearTimeout(t);
  }, [notice]);

  const order = useMemo(() => view.players.map((p) => p.id), [view.players]);
  const vw = root.width || window.innerWidth;
  const vh = root.height || window.innerHeight;
  const crowd = view.players.length;
  const compact = isCompact(crowd, vw, vh);
  const handCardW = clamp(Math.min(vw * 0.19, vh * 0.125), 56, 108);
  const trickCardW = clamp(Math.min(vw * 0.14, vh * 0.11) * (crowd >= 7 ? 0.84 : crowd >= 5 ? 0.92 : 1), 38, 96);
  const geometry = useMemo(
    () => tableGeometry(table.width, table.height, order, you, trickCardW, SEAT_BOX[compact ? 'compact' : 'normal']),
    [table.width, table.height, order, you, trickCardW, compact],
  );

  const ctx = useMemo(() => ({ mode: view.rules.hierarchy, vira: view.vira ? card(view.vira) : null }), [view.rules.hierarchy, view.vira]);
  const hand = useMemo(() => {
    const cards = (view.hand ?? []).map(card);
    const sorted =
      settings.sortHand === 'forca'
        ? sortByStrength(cards, ctx)
        : cards.slice().sort((a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || strength(a, ctx) - strength(b, ctx));
    return sorted.map((c) => c.id);
  }, [view.hand, ctx, settings.sortHand]);
  const starred = useMemo(() => new Set(hand.filter((id) => isManilha(card(id), ctx))), [hand, ctx]);

  const pending = pendingAt === view.seq;
  const myTurn = !!you && view.actor?.playerId === you;
  const bidding = myTurn && view.actor?.kind === 'bid' && !pending;
  const canPlay = myTurn && view.actor?.kind === 'play' && !view.handHidden && !pending;
  const suggestion = useMemo(
    () => (settings.hints && myTurn ? suggest(view, createRng(view.seq + 7)) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.seq, settings.hints, myTurn],
  );
  const remaining = view.cardsThisRound - view.completedTricks.length;
  const tip: TipId | null = bidding
    ? view.blind
      ? 'cega'
      : view.forbiddenBid !== null
        ? 'pe'
        : 'palpite'
    : canPlay
      ? 'jogar'
      : null;

  const send = async (action: ClientAction) => {
    markTipSeen(tip);
    setPendingAt(view.seq);
    const err = await conn.act(action);
    if (err) {
      setPendingAt(null);
      setToast(err);
      play('pop');
      void haptic('error', settings.haptics);
    }
  };

  const trickPlays =
    view.phase === 'playing' ? (view.trick?.plays ?? []) : view.phase === 'trickEnd' ? (view.lastTrick?.plays ?? []) : [];
  const winnerId = view.lastTrick?.winnerId ?? null;
  const collectTo = winnerId ? (geometry.seats.get(winnerId) ?? geometry.center) : geometry.center;
  const status = statusLine(view, nameOf);
  const handWidth = Math.min(vw, 640);
  const dealFrom = { x: 0, y: -(table.height - geometry.deck.y) - handCardW * 0.9 };
  const autoMs = DEFAULT_TIMING.roundPauseMs / (online ? 1 : SPEED_MULTIPLIER[settings.speed]);
  const reactionFor = (id: string) => [...reactions].reverse().find((r) => r.playerId === id);
  const spectating = !!me?.eliminated && view.phase !== 'gameOver';

  const exit = () => {
    if (online) useOnline.getState().leave();
    leaveTable();
  };

  return (
    <div ref={rootRef} className="mesa relative flex h-full flex-col overflow-hidden">
      <TopBar
        round={view.roundNumber}
        cards={view.cardsThisRound}
        direction={view.direction}
        pyramid={view.rules.progression === 'upDown'}
        onMenu={() => setMenu(true)}
        onScore={() => setScore(true)}
        onReact={() => setPicker((v) => !v)}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-[1180px] flex-1 flex-col">
      <div ref={tableRef} className="relative min-h-0 flex-1">
        <ForcaChip mode={view.rules.hierarchy} vira={view.vira} onOpen={() => setForca(true)} />
        {online && onlineStatus === 'reconnecting' && (
          <div className="absolute right-3 top-2 z-30 rounded-full bg-copas px-3 py-1 text-xs font-bold">Reconectando…</div>
        )}
        {table.width > 0 &&
          view.players
            .filter((p) => p.id !== you)
            .map((p) => {
              const at = geometry.seats.get(p.id);
              if (!at) return null;
              return (
                <Seat
                  key={p.id}
                  player={p}
                  info={seatOf(p.id)}
                  x={at.x}
                  y={at.y}
                  isTurn={view.actor?.playerId === p.id}
                  deadline={view.actor?.playerId === p.id ? view.turnDeadline : null}
                  phase={view.phase}
                  remaining={remaining}
                  startingLives={view.rules.startingLives}
                  shownCards={view.phase === 'bidding' || view.phase === 'playing' ? p.visibleCards : null}
                  reaction={reactionFor(p.id)}
                  compact={compact}
                />
              );
            })}
        {table.width > 0 && (
          <TrickArea
            plays={trickPlays}
            geometry={geometry}
            cardWidth={trickCardW}
            resolved={view.phase === 'trickEnd'}
            winnerId={winnerId}
            cancelled={view.lastTrick?.cancelled ?? []}
            youId={you}
            collectTo={collectTo}
            youFromHand={!view.blind}
          />
        )}
        <RoundBanner view={view} />
        <CoachTip tip={bidding ? null : tip} />
        <BidPanel
          open={bidding}
          cards={view.cardsThisRound}
          legal={view.legalBids}
          forbidden={view.forbiddenBid}
          bidsSum={view.bidsSum}
          suggested={suggestion.bid ?? null}
          blind={view.blind}
          isDealer={view.dealerId === you}
          onBid={(value) => void send({ type: 'bid', value })}
          tip={bidding ? tip : null}
        />
        <AnimatePresence>
          {(toast ?? notice?.text) && (
            <motion.div
              className="absolute left-1/2 top-3 z-50 max-w-[90%] -translate-x-1/2 rounded-2xl bg-tinta px-4 py-2 text-center text-sm font-semibold text-papel shadow-xl"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              role="status"
            >
              {toast ?? notice?.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-20" style={{ paddingBottom: 'calc(0.25rem + var(--safe-bottom))' }}>
        {me && (
          <MySeat
            player={me}
            avatar={seatOf(me.id)?.avatar ?? me.id}
            phase={view.phase}
            remaining={remaining}
            startingLives={view.rules.startingLives}
            status={status}
            reaction={reactionFor(me.id)}
          />
        )}
        {spectating ? (
          <div className="flex items-center justify-center gap-2 px-4 py-5">
            {!online && (
              <Button variant="vidro" size="sm" onClick={() => conn.setSpeed?.(SPEED_MULTIPLIER.turbo)}>
                Acelerar
              </Button>
            )}
            <Button variant="vidro" size="sm" onClick={() => (online ? setMenu(true) : startLocalGame())}>
              {online ? 'Menu' : 'Nova partida'}
            </Button>
          </div>
        ) : (
          <Hand
            cards={hand}
            hiddenCount={view.handHidden ? 1 : 0}
            canPlay={canPlay}
            onPlay={(cardId: CardId) => void send({ type: 'play', cardId })}
            suggested={suggestion.cardId ?? null}
            starred={starred}
            roundKey={view.roundNumber}
            width={handWidth}
            cardWidth={handCardW}
            dealFrom={dealFrom}
            oneTap={false}
          />
        )}
      </div>
      </div>

      <RoundSummary
        open={view.phase === 'roundEnd'}
        view={view}
        seats={seats}
        autoMs={autoMs}
        onContinue={online ? undefined : () => conn.skipPause?.()}
      />
      {view.phase === 'gameOver' && (
        <GameOver
          view={view}
          seats={seats}
          onAgain={online ? (isHost() ? () => useOnline.getState().rematch() : undefined) : startLocalGame}
          againLabel={online ? 'Revanche' : 'Jogar de novo'}
          onLobby={online && isHost() ? () => useOnline.getState().backToLobby() : undefined}
          waitingText={online ? `Aguardando ${room?.seats.find((s) => s.playerId === room.hostId)?.name ?? 'o anfitrião'} chamar a revanche…` : undefined}
          onExit={exit}
        />
      )}
      <Scoreboard open={score} onClose={() => setScore(false)} view={view} seats={seats} />
      <Sheet open={forca} onClose={() => setForca(false)} label="Força das cartas">
        <h2 className="font-display text-2xl font-bold" style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
          Força das cartas
        </h2>
        <p className="mb-3 text-sm text-tinta-2">Da mais forte (1) para a mais fraca. Cartas na mesma linha empatam e melam.</p>
        <Hierarchy mode={view.rules.hierarchy} vira={view.vira} />
      </Sheet>
      <PauseMenu
        open={menu}
        online={online}
        onClose={() => setMenu(false)}
        onRules={() => {
          setMenu(false);
          go('rules');
        }}
        onHierarchy={() => {
          setMenu(false);
          setForca(true);
        }}
        onRestart={online ? undefined : startLocalGame}
        onExit={exit}
        onSpeed={(m) => conn.setSpeed?.(m)}
      />
      <ReactionPicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(r) => {
          conn.react(r);
          setPicker(false);
        }}
      />
    </div>
  );
}

/** Faixa no centro da mesa quando começa uma rodada ("Rodada 4 · 4 cartas"). */
function RoundBanner({ view }: { view: PlayerView }) {
  const [hiddenRound, setHiddenRound] = useState<number | null>(null);
  const fresh = view.phase === 'bidding' && view.players.every((p) => p.bid === null);
  const shown = fresh && hiddenRound !== view.roundNumber ? view.roundNumber : null;
  useEffect(() => {
    if (shown === null) return undefined;
    const t = window.setTimeout(() => setHiddenRound(shown), 1500);
    return () => window.clearTimeout(t);
  }, [shown]);
  return (
    <AnimatePresence>
      {shown === view.roundNumber && (
        <motion.div
          key={shown}
          className="pointer-events-none absolute inset-x-0 top-[40%] z-30 flex flex-col items-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.08, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          <span
            className="font-display text-4xl font-bold texto-gravado"
            style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
          >
            {view.cardsThisRound} {view.cardsThisRound === 1 ? 'carta' : 'cartas'}
          </span>
          {view.blind && <span className="mt-1 font-hand text-3xl text-luz texto-gravado">carta na testa!</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
