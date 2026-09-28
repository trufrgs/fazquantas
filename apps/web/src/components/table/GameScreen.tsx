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
import {
  BID_PANEL,
  cardSizes,
  compactBidPanel,
  isCompact,
  SEAT_BOX,
  tableGeometry,
  tableRevealLayout,
} from './layout';
import { REVEAL_FAN, RevealCards } from './RevealCards';
import { MySeat, type StatusTone } from './MySeat';
import { PauseMenu } from './PauseMenu';
import { ReactionPicker } from './ReactionPicker';
import { RoundSummary } from './RoundSummary';
import { Scoreboard } from './Scoreboard';
import { Seat } from './Seat';
import { TopBar } from './TopBar';
import { TrickArea } from './TrickArea';
import { useSize } from './useSize';
import { useUiScale } from '../../lib/ui-scale';
import { useTableEffects } from './useTableEffects';

const SUIT_ORDER: Suit[] = ['O', 'C', 'E', 'P'];

function statusLine(
  view: PlayerView,
  name: (id: string) => string,
): { text: string; tone: StatusTone } {
  const you = view.you;
  const me = view.players.find((p) => p.id === you);
  if (view.phase === 'gameOver') return { text: 'Fim de jogo', tone: 'info' };
  if (me?.eliminated) return { text: 'Deu pra ti: tu tá fora', tone: 'bad' };
  if (view.phase === 'roundEnd') return { text: 'Fim da rodada', tone: 'info' };
  if (view.phase === 'trickEnd') {
    const w = view.lastTrick?.winnerId ?? null;
    if (w === null) return { text: 'Empardou! Ninguém fez', tone: 'info' };
    return w === you
      ? { text: 'Tu fez a mão!', tone: 'good' }
      : { text: `${name(w)} fez a mão`, tone: 'info' };
  }
  const actor = view.actor;
  if (!actor) return { text: '', tone: 'info' };
  if (actor.playerId !== you) {
    return {
      text:
        actor.kind === 'bid'
          ? `${name(actor.playerId)} palpitando…`
          : `Vez de ${name(actor.playerId)}`,
      tone: 'info',
    };
  }
  if (actor.kind === 'bid') return { text: 'Tua vez de palpitar', tone: 'turn' };
  if (view.handHidden) return { text: 'Revelando tua carta…', tone: 'turn' };
  const need = (me?.bid ?? 0) - (me?.tricks ?? 0);
  if (need > 0) return { text: `Tua vez: falta${need > 1 ? 'm' : ''} ${need}`, tone: 'turn' };
  if (need === 0) return { text: 'Tua vez: não faz mais', tone: 'turn' };
  return { text: `Tua vez: fez ${-need} a mais`, tone: 'turn' };
}

export function GameScreen() {
  const conn = useGame((s) => s.conn);
  const update = useGame((s) => s.update);
  const seats = useGame((s) => s.seats);
  const reactions = useGame((s) => s.reactions);
  const gameKey = useGame((s) => s.gameKey);
  const inRoom = useOnline((s) => s.room !== null);
  useTableEffects(update);
  if (!conn || !update) {
    // Mesa vazia: numa sala online, o caminho é a sala (sair do início deixaria o assento preso).
    return (
      <div className="mesa flex h-full items-center justify-center">
        <Button
          variant="ouro"
          onClick={inRoom ? () => useApp.getState().reset('lobby') : leaveTable}
        >
          {inRoom ? 'Voltar pra sala' : 'Voltar ao início'}
        </Button>
      </div>
    );
  }
  // Partida nova (inclusive revanche) remonta a mesa: nenhuma trava ou seleção sobra da anterior.
  return <Table key={gameKey} conn={conn} update={update} seats={seats} reactions={reactions} />;
}

function Table({
  conn,
  update,
  seats,
  reactions,
}: {
  conn: GameConnection;
  update: ViewUpdate;
  seats: SeatInfo[];
  reactions: LiveReaction[];
}) {
  const view = update.view;
  const settings = useSettings();
  const go = useApp((s) => s.go);
  const room = useOnline((s) => s.room);
  const onlineStatus = useOnline((s) => s.status);
  const [rootRef, root] = useSize<HTMLDivElement>();
  const [tableRef, table] = useSize<HTMLDivElement>();
  const [mySeatRef, mySeatSize] = useSize<HTMLDivElement>();
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
  const nameOf = useCallback(
    (id: string) => view.players.find((p) => p.id === id)?.name ?? '',
    [view.players],
  );

  // Pausa o host local enquanto um menu cobre a mesa.
  useEffect(() => {
    if (online) return undefined;
    if (menu) conn.pause?.();
    else conn.resume?.();
    return undefined;
  }, [menu, online, conn]);

  // Botão voltar do Android: fecha a camada aberta; sem camada, abre/fecha o menu.
  // Esc só abre o menu; quem fecha é a própria folha (senão as duas coisas brigam).
  useEffect(() => {
    const back = () => {
      if (picker) setPicker(false);
      else if (score) setScore(false);
      else if (forca) setForca(false);
      else setMenu((m) => !m);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !menu && !score && !forca && !picker) setMenu(true);
    };
    window.addEventListener('fodinha:voltar', back);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('fodinha:voltar', back);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, score, forca, picker]);
  const closePicker = useCallback(() => setPicker(false), []);
  // Atalhos de teclado só valem com a mesa livre (sem menu, caderneta ou força abertos).
  const layerOpen = menu || score || forca;
  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Aviso quando o tempo acabou e o servidor jogou por ti (vem do store).
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
  // Tablet e desktop: tudo cresce junto (assentos, cartas, margens) pela escala da interface.
  const s = useUiScale();
  const compact = isCompact(crowd, vw / s, vh / s);
  const { hand: handCardW, trick: trickCardW } = cardSizes(vw, vh, crowd, s);
  const geometry = useMemo(
    () =>
      tableGeometry(
        table.width,
        table.height,
        order,
        you,
        trickCardW,
        SEAT_BOX[compact ? 'compact' : 'normal'],
        s,
      ),
    [table.width, table.height, order, you, trickCardW, compact, s],
  );
  // Cartas à mostra (rodada às cegas; quem saiu vê tudo): na frente de cada assento, do maior
  // tamanho que não cobre ninguém nem fica atrás do painel de palpite ou do chip das manilhas.
  const showing = view.phase === 'bidding' || view.phase === 'playing';
  const maxShown = showing
    ? Math.max(
        0,
        ...view.players.filter((p) => p.id !== you).map((p) => p.visibleCards?.length ?? 0),
      )
    : 0;
  // Na rodada às cegas o arranjo vale até a última carta ser jogada (ela sai de onde estava).
  const revealing = maxShown > 0 || (view.blind && showing);
  // O painel de palpite desce por cima da tua faixa; em mesa baixa (celular deitado) vira uma linha.
  const mySeatH = mySeatSize.height || 47 * s;
  // Barra de uma linha em mesa baixa ou quando o painel normal cobriria algum assento.
  const panelCompact = useMemo(
    () => table.height > 0 && compactBidPanel(geometry, you, s, mySeatH),
    [table.height, geometry, you, s, mySeatH],
  );
  const panelBottom = -(mySeatH - 4);
  const reveal = useMemo(() => {
    if (!revealing || table.width === 0) return null;
    const ids = view.players.filter((p) => p.id !== you && p.inRound).map((p) => p.id);
    return tableRevealLayout(geometry, ids, {
      scale: s,
      trickCard: trickCardW,
      compactPanel: panelCompact,
      mySeatH,
      fan: maxShown > 1 ? REVEAL_FAN : 1,
    });
  }, [
    revealing,
    maxShown,
    table.width,
    view.players,
    you,
    s,
    geometry,
    trickCardW,
    panelCompact,
    mySeatH,
  ]);
  // Na rodada às cegas a carta jogada fica onde já estava à mostra (só a tua vem da mão).
  const trickGeometry = useMemo(() => {
    if (!view.blind || !reveal) return geometry;
    const tricks = new Map(geometry.tricks);
    for (const [id, at] of reveal.spots) tricks.set(id, at);
    return { ...geometry, tricks };
  }, [geometry, reveal, view.blind]);
  const trickW = view.blind && reveal ? reveal.cardWidth : trickCardW;

  const ctx = useMemo(
    () => ({ mode: view.rules.hierarchy, vira: view.vira ? card(view.vira) : null }),
    [view.rules.hierarchy, view.vira],
  );
  const hand = useMemo(() => {
    const cards = (view.hand ?? []).map(card);
    const sorted =
      settings.sortHand === 'forca'
        ? sortByStrength(cards, ctx)
        : cards
            .slice()
            .sort(
              (a, b) =>
                SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) ||
                strength(a, ctx) - strength(b, ctx),
            );
    return sorted.map((c) => c.id);
  }, [view.hand, ctx, settings.sortHand]);
  const starred = useMemo(
    () => new Set(hand.filter((id) => isManilha(card(id), ctx))),
    [hand, ctx],
  );

  const pending = pendingAt === view.seq;
  const myTurn = !!you && view.actor?.playerId === you;
  const bidding = myTurn && view.actor?.kind === 'bid' && !pending;
  // Com o painel aberto por cima dela, a tua faixa some (senão aparece pelas bordas).
  const panelWidth = panelCompact ? vw - 16 : Math.min(vw - 24 * s, BID_PANEL.maxWidth * s);
  const mySeatUnderPanel = bidding && (vw - panelWidth) / 2 < 64 * s;
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
    view.phase === 'playing'
      ? (view.trick?.plays ?? [])
      : view.phase === 'trickEnd'
        ? (view.lastTrick?.plays ?? [])
        : [];
  const winnerId = view.lastTrick?.winnerId ?? null;
  const collectTo = winnerId ? (geometry.seats.get(winnerId) ?? geometry.center) : geometry.center;
  const status = statusLine(view, nameOf);
  const handWidth = Math.min(vw, 640 * s);
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

      <div className="mx-auto flex min-h-0 w-full max-w-[73.75rem] flex-1 flex-col">
        <div ref={tableRef} className="relative min-h-0 flex-1">
          <ForcaChip mode={view.rules.hierarchy} vira={view.vira} onOpen={() => setForca(true)} />
          {online && onlineStatus === 'reconnecting' && (
            <div className="absolute right-3 top-2 z-30 rounded-full bg-copas px-3 py-1 text-xs font-bold">
              Reconectando…
            </div>
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
                    reaction={reactionFor(p.id)}
                    compact={compact}
                  />
                );
              })}
          {reveal && <RevealCards players={view.players} you={you} layout={reveal} />}
          {table.width > 0 && (
            <TrickArea
              plays={trickPlays}
              geometry={trickGeometry}
              cardWidth={trickW}
              resolved={view.phase === 'trickEnd'}
              winnerId={winnerId}
              cancelled={view.lastTrick?.cancelled ?? []}
              youId={you}
              collectTo={collectTo}
              youFromHand={!view.blind}
              revealFrom={reveal ? { spots: reveal.spots, cardWidth: reveal.cardWidth } : null}
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
            keyboard={!layerOpen}
            compact={panelCompact}
            hintInline={vw >= 600 * s}
            deadline={myTurn ? view.turnDeadline : null}
            bottom={panelBottom}
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

        <div
          className="relative z-20"
          style={{ paddingBottom: 'calc(0.25rem + var(--safe-bottom))' }}
        >
          {me && (
            <div
              ref={mySeatRef}
              className="transition-opacity duration-200"
              style={{ opacity: mySeatUnderPanel ? 0 : 1 }}
            >
              <MySeat
                player={me}
                avatar={seatOf(me.id)?.avatar ?? me.id}
                phase={view.phase}
                remaining={remaining}
                startingLives={view.rules.startingLives}
                status={status}
                reaction={reactionFor(me.id)}
                isTurn={myTurn && !(view.phase === 'playing' && view.handHidden)}
                deadline={myTurn ? view.turnDeadline : null}
              />
            </div>
          )}
          {spectating ? (
            <div className="flex items-center justify-center gap-2 px-4 py-5">
              {!online && (
                <Button
                  variant="vidro"
                  size="sm"
                  onClick={() => conn.setSpeed?.(SPEED_MULTIPLIER.turbo)}
                >
                  Acelerar
                </Button>
              )}
              <Button
                variant="vidro"
                size="sm"
                onClick={() => (online ? setMenu(true) : startLocalGame())}
              >
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
              keyboard={!layerOpen}
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
          onAgain={
            online ? (isHost() ? () => useOnline.getState().rematch() : undefined) : startLocalGame
          }
          againLabel={online ? 'Revanche' : 'Mais uma?'}
          onLobby={online && isHost() ? () => useOnline.getState().backToLobby() : undefined}
          waitingText={
            online
              ? `Esperando ${room?.seats.find((s) => s.playerId === room.hostId)?.name ?? 'o anfitrião'} chamar a revanche…`
              : undefined
          }
          onExit={exit}
        />
      )}
      <Scoreboard open={score} onClose={() => setScore(false)} view={view} seats={seats} />
      <Sheet open={forca} onClose={() => setForca(false)} label="Força das cartas">
        <h2
          className="font-display text-2xl font-bold"
          style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
        >
          Força das cartas
        </h2>
        <p className="mb-3 text-sm text-tinta-2">
          Da mais forte (1) pra mais fraca. Cartas da mesma linha empardam.
        </p>
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
        onRestart={
          online
            ? undefined
            : () => {
                setMenu(false);
                startLocalGame();
              }
        }
        onExit={exit}
        onSpeed={(m) => conn.setSpeed?.(m)}
      />
      <ReactionPicker
        open={picker}
        onClose={closePicker}
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
          {view.blind && (
            <span className="mt-1 font-hand text-3xl text-luz texto-gravado">carta na testa!</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
