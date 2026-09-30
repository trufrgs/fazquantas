import {
  ATE_O_FIM,
  card,
  createRng,
  DEFAULT_TIMING,
  isAsyncTurn,
  isManilha,
  paceMultiplier,
  sortByStrength,
  strength,
  suggest,
  type CardId,
  type ClientAction,
  type PlayerView,
  type Suit,
} from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameConnection, SeatInfo, ViewUpdate } from '../../lib/connection';
import { leaveTable, startLocalGame } from '../../lib/game-actions';
import { untilLabel } from '../setup/TuasSalas';
import { InlineTurnTimer, TurnSpotlight, UrgentEdge, useTimeLeft } from './TurnClock';
import { formatLeft, isUrgent } from '../../lib/tempo';
import { haptic } from '../../lib/haptics';
import { acelerarMusica } from '../../lib/musica';
import { play } from '../../lib/sound';
import { contextoDaRodada, emCameraRapida, manilhaNaTesta } from './manilhas';
import { CARD_RATIO } from '../cards/Card';
import { NaTesta } from './NaTesta';
import { galoDeUmToque } from './frases';
import { FrasesAMao } from './FrasesAMao';
import { useAlgumaCamera, VideoAmpliado } from '../ui/Midia';
import { useApp } from '../../stores/app';
import { useGame, type LiveReaction } from '../../stores/game';
import { isHost, useOnline } from '../../stores/online';
import { SPEED_MULTIPLIER, useSettings } from '../../stores/settings';
import { AdminNotice } from '../ui/AdminNotice';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { BidPanel } from './BidPanel';
import { CoachTip, markTipSeen, type TipId } from './CoachTip';
import { ForcaChip, Hierarchy } from './ForcaChip';
import { GameOver } from './GameOver';
import { Hand } from './Hand';
import {
  BID_PANEL,
  BID_TIP_H,
  cantadasTop,
  cardSizes,
  compactBidPanel,
  mesaDimensionada,
  PILULA_FRASES,
  pilulaDeFrases,
  pisoDoAvatar,
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
import { rem, useUiScale } from '../../lib/ui-scale';
import { DEMORA_MS, useTableEffects } from './useTableEffects';

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
          ? `${name(actor.playerId)} cantando…`
          : `Vez de ${name(actor.playerId)}`,
      tone: 'info',
    };
  }
  if (actor.kind === 'bid') return { text: 'Tua vez de cantar', tone: 'turn' };
  if (view.handHidden) return { text: 'Revelando tua carta…', tone: 'turn' };
  const need = (me?.bid ?? 0) - (me?.tricks ?? 0);
  if (need > 0) return { text: `Tua vez: falta${need > 1 ? 'm' : ''} ${need}`, tone: 'turn' };
  if (need === 0) return { text: 'Tua vez: não faz mais', tone: 'turn' };
  return { text: `Tua vez: fez ${-need} a mais`, tone: 'turn' };
}

/** A mesa está jogando por mim: um toque em qualquer lugar (ou no botão) me traz de volta. */
function AwayBanner() {
  useEffect(() => {
    const back = () => useOnline.getState().present();
    window.addEventListener('pointerdown', back);
    return () => window.removeEventListener('pointerdown', back);
  }, []);
  return (
    <div
      role="alert"
      className="papel fixed left-1/2 top-3 z-[60] flex w-[min(92vw,26rem)] -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl ring-2 ring-ouros"
      style={{ top: 'calc(0.75rem + var(--safe-top))' }}
    >
      <span className="flex-1 text-sm">
        <strong className="block text-base">A mesa tá jogando por ti</strong>
        Tu estourou o tempo duas vezes seguidas.
      </span>
      <Button variant="ouro" onClick={() => useOnline.getState().present()}>
        Voltei
      </Button>
    </div>
  );
}

export function GameScreen() {
  const conn = useGame((s) => s.conn);
  const update = useGame((s) => s.update);
  const seats = useGame((s) => s.seats);
  const reactions = useGame((s) => s.reactions);
  const gameKey = useGame((s) => s.gameKey);
  const inRoom = useOnline((s) => s.room !== null);
  // O ritmo do jogo: o da sala, online; no local, o do jogo agora (o "Acelerar" muda sem mexer nos
  // ajustes). Os golpes das manilhas e a pausa do resumo acompanham o tempo da mão na mesa.
  const pace = useOnline((s) => s.room?.pace ?? 'normal');
  const acelerando = useOnline((s) => s.room?.acelerando ?? false);
  const speed = useSettings((s) => s.speed);
  const ritmo = inRoom ? paceMultiplier(pace) * (acelerando ? ATE_O_FIM : 1) : (conn?.speed?.() ?? SPEED_MULTIPLIER[speed]);
  useTableEffects(update, inRoom, ritmo);
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
  return <Table key={gameKey} conn={conn} update={update} seats={seats} reactions={reactions} ritmo={ritmo} />;
}

function Table({
  conn,
  update,
  seats,
  reactions,
  ritmo,
}: {
  conn: GameConnection;
  update: ViewUpdate;
  seats: SeatInfo[];
  reactions: LiveReaction[];
  /** O ritmo do jogo (1 = normal). */
  ritmo: number;
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
  const { hand: handCardW, trick: trickBase } = cardSizes(vw, vh, crowd, s);
  // Alguém de câmera aberta: os assentos crescem para o rosto caber maior que o avatar.
  const algumaCamera = useAlgumaCamera();
  const comCamera = useOnline((st) => st.room?.midias?.filter((m) => m.camera).map((m) => m.playerId).join(',') ?? '');
  // O painel de palpite desce por cima da tua faixa; em mesa baixa (celular deitado) vira uma linha.
  const mySeatH = mySeatSize.height || 47 * s;
  // Avatar (ou rosto) e carta da mesa do tamanho do espaço que sobra: a carta fica perto da maior
  // possível e o assento cresce com o resto, sem ficar menor que o de antes (mesa cheia: 40 px).
  const piso = pisoDoAvatar(crowd, vw / s, vh / s, algumaCamera);
  const comVira = view.rules.hierarchy === 'vira';
  // O canto de baixo, à direita, é das frases favoritas: assento e carta não vão ali. Na mesa baixa
  // (celular deitado) não sobra canto: as frases sobem para o alto, que ali é largo.
  const frasesNoAlto = table.height > 0 && table.height < 330 * s;
  const reservas = useMemo(
    () => (table.width > 0 && !frasesNoAlto ? [pilulaDeFrases(table.width, table.height, s)] : []),
    [table.width, table.height, s, frasesNoAlto],
  );
  const mesa = useMemo(
    () =>
      mesaDimensionada({
        width: table.width,
        height: table.height,
        order,
        youId: you,
        trickBase,
        scale: s,
        video: algumaCamera,
        mySeatH,
        chip: comVira,
        piso,
        reservas,
      }),
    [table.width, table.height, order, you, trickBase, s, algumaCamera, mySeatH, comVira, piso, reservas],
  );
  const seatBox = mesa.box;
  const trickCardW = mesa.trickCard;
  const geometry = useMemo(
    () =>
      tableGeometry(
        table.width,
        table.height,
        order,
        you,
        trickCardW,
        seatBox,
        s,
        reservas,
      ),
    [table.width, table.height, order, you, trickCardW, seatBox, s, reservas],
  );
  // Cartas à mostra (rodada às cegas; quem saiu vê tudo): na frente de cada assento, do maior
  // tamanho que não cobre ninguém nem fica atrás do painel de palpite ou do chip das manilhas.
  const banner = useRoundBanner(view);
  const showing = view.phase === 'bidding' || view.phase === 'playing';
  const maxShown = showing
    ? Math.max(
        0,
        ...view.players.filter((p) => p.id !== you).map((p) => p.visibleCards?.length ?? 0),
      )
    : 0;
  // Na rodada às cegas o arranjo vale até a última carta ser jogada (ela sai de onde estava).
  const revealing = maxShown > 0 || (view.blind && showing);
  // Barra de uma linha em mesa baixa ou quando o painel normal cobriria algum assento. A dica da
  // primeira vez só entra no painel se, com ela, ele ainda não cobrir ninguém (na mesa cheia de
  // celular pequeno, cobria as cartas na testa de quem senta embaixo, justo na hora de lê-las).
  const panelFits = useMemo(
    () =>
      table.height > 0
        ? { plain: !compactBidPanel(geometry, you, s, mySeatH), withTip: !compactBidPanel(geometry, you, s, mySeatH, BID_TIP_H) }
        : { plain: true, withTip: true },
    [table.height, geometry, you, s, mySeatH],
  );
  const panelCompact = !panelFits.plain;
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
      chip: view.rules.hierarchy === 'vira',
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
    view.rules.hierarchy,
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

  // A dica que está na tela (a do palpite só quando cabe no painel). Com a dica, o painel sobe: na
  // rodada às cegas ele não pode chegar nas cartas na testa, que é o que se lê para cantar (no
  // celular pequeno, cobria as quatro de uma vez, 30/09/2026).
  const topoComDica = table.height - ((142 + BID_TIP_H) * s - mySeatH);
  const testaLivre = !reveal || [...reveal.spots.values()].every((p) => p.y + (reveal.cardWidth * CARD_RATIO) / 2 <= topoComDica);
  const shownTip = bidding ? (panelFits.withTip && testaLivre ? tip : null) : tip;
  const send = async (action: ClientAction) => {
    markTipSeen(shownTip);
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
  // Rodada da carta na testa: quem perdeu por ter a manilha na própria testa ganha a sua cena.
  const naTesta = manilhaNaTesta(view);
  // A tua cena sai em cima da tua mão (o teu assento fica fora da mesa); a dos outros, no assento.
  const assentoNaTesta = naTesta && naTesta.playerId !== you ? geometry.seats.get(naTesta.playerId) : undefined;
  const collectTo = winnerId ? (geometry.seats.get(winnerId) ?? geometry.center) : geometry.center;
  const status = statusLine(view, nameOf);
  // Quem cantou por último na ordem da rodada (os balões para o lado só mostram esse).
  const lastBidder =
    view.phase === 'bidding' ? [...view.order].reverse().find((id) => view.players.find((x) => x.id === id)?.bid != null) ?? null : null;
  const handWidth = Math.min(vw, 640 * s);
  const dealFrom = { x: 0, y: -(table.height - geometry.deck.y) - handCardW * 0.9 };
  const autoMs = DEFAULT_TIMING.roundPauseMs / ritmo;
  // Alguém demorando na vez: depois de uns segundos, os outros avatares puxam um palheiro enquanto
  // esperam (quem está pensando não; ele é o motivo da fumaceira).
  const esperando = view.actor && (view.phase === 'bidding' || view.phase === 'playing') ? `${view.seq}:${view.actor.playerId}` : null;
  const [demorou, setDemorou] = useState<string | null>(null);
  useEffect(() => {
    if (!esperando) return undefined;
    const t = window.setTimeout(() => setDemorou(esperando), DEMORA_MS);
    return () => window.clearTimeout(t);
  }, [esperando]);
  const pitando = (id: string) => demorou !== null && demorou === esperando && view.actor?.playerId !== id;
  const mySeat = online ? room?.seats.find((x) => x.playerId === room.youId) : undefined;
  const meAway = mySeat?.kind === 'human' && mySeat.away && view.phase !== 'gameOver';
  const series = online ? (room?.series ?? null) : null;
  const seriesOn = !!series && series.bestOf > 1;
  const hostName = room?.seats.find((x) => x.playerId === room.hostId)?.name ?? 'o anfitrião';
  // Pós-jogo online: qualquer um pede a revanche; o anfitrião puxa, ou ela começa sozinha quando todo
  // mundo que está na mesa pediu.
  const revanche = room?.revanche ?? [];
  const pediRevanche = !!room && revanche.includes(room.youId);
  const proximaDaSerie = seriesOn && !series!.champion;
  const [revancheErro, setRevancheErro] = useState<string | null>(null);
  // (A revanche remonta a mesa: o erro de um pedido não sobra para a partida seguinte.)
  const pedirRevanche = async () => setRevancheErro(await useOnline.getState().rematch());
  // Alguém pediu revanche: o anfitrião ouve (ele é quem puxa).
  const pedidosAntes = useRef(revanche.length);
  useEffect(() => {
    if (online && revanche.length > pedidosAntes.current && isHost()) play('pop');
    pedidosAntes.current = revanche.length;
  }, [revanche.length, online]);
  const nomes = (ids: readonly string[]) => ids.map((id) => room?.seats.find((x) => x.playerId === id)?.name ?? '').filter(Boolean);
  const juntos = (ns: string[]) => (ns.length <= 1 ? (ns[0] ?? '') : `${ns.slice(0, -1).join(', ')} e ${ns.at(-1)}`);
  const quemPediu = nomes(revanche.filter((id) => id !== room?.youId));
  // Série terminada: o que vem é uma série nova (não "revanche").
  const oQue = proximaDaSerie ? 'a próxima' : seriesOn ? 'nova série' : 'revanche';
  const againLabel = !online
    ? 'Mais uma?'
    : isHost()
      ? proximaDaSerie
        ? `Próxima partida (${series!.games.length + 1}ª)`
        : seriesOn
          ? 'Nova série'
          : 'Revanche'
      : pediRevanche
        ? `Tu pediu ${oQue}`
        : `Quero ${oQue}`;
  const querem = (ns: string[]) => `${juntos(ns)} ${ns.length === 1 ? 'quer' : 'querem'}`;
  const comoComeca = room?.ranked
    ? `Começa quando ${hostName} puxar.`
    : `Começa quando ${hostName} puxar ou todo mundo na mesa pedir.`;
  const revancheNota = isHost()
    ? quemPediu.length > 0
      ? `${querem(quemPediu)} ${oQue}!`
      : null
    : quemPediu.length === 0
      ? comoComeca
      : `${querem(quemPediu)} ${pediRevanche ? 'também' : oQue}. ${comoComeca}`;
  const reactionFor = (id: string) => [...reactions].reverse().find((r) => r.playerId === id);
  const spectating = !!me?.eliminated && view.phase !== 'gameOver';
  // Só sobraram bots jogando: dá para passar o resto em câmera rápida ("acelerar até o fim").
  const vivos = view.players.filter((p) => !p.eliminated);
  const soBots = spectating && vivos.length > 1 && vivos.every((p) => seats.find((s) => s.id === p.id)?.kind === 'bot');
  const cameraRapida = emCameraRapida(ritmo);
  // O resumo do fim da rodada: dá para esconder o desta rodada ou não mostrar mais (pedido do Igor,
  // 30/09/2026). Sem ele, no jogo local a pausa de leitura acaba logo (não há o que ler).
  const [resumoEscondido, setResumoEscondido] = useState<number | null>(null);
  const resumoAberto = view.phase === 'roundEnd' && !cameraRapida && settings.resumoDaRodada && resumoEscondido !== view.roundNumber;
  useEffect(() => {
    if (online || view.phase !== 'roundEnd' || resumoAberto || cameraRapida) return undefined;
    const t = window.setTimeout(() => conn.skipPause?.(), 1500);
    return () => window.clearTimeout(t);
  }, [online, view.phase, view.roundNumber, resumoAberto, cameraRapida, conn]);
  // Na câmera rápida o tango corre junto.
  useEffect(() => {
    acelerarMusica(cameraRapida && view.phase !== 'gameOver');
    return () => acelerarMusica(false);
  }, [cameraRapida, view.phase]);

  const frasesAMao = (
    <FrasesAMao
      onFrase={(r) => conn.react(r)}
      onMais={() => setPicker((v) => !v)}
      galo={() => galoDeUmToque(trickPlays.map((pl) => pl.cardId), contextoDaRodada(view.rules, view.vira))}
    />
  );

  const exit = () => {
    if (online) useOnline.getState().leave();
    leaveTable();
  };
  const asyncRoom = online && !!room && isAsyncTurn(room.turnTimeoutSec);
  const turnTotalMs = online && room?.turnTimeoutSec ? room.turnTimeoutSec * 1000 : null;
  const turnLeft = useTimeLeft(view.turnDeadline);
  // Vez com tempo (tua ou de outra pessoa): o tempo vai no aviso da tua faixa, nada por cima das
  // cartas; vermelho quando aperta. Avisos passageiros (tempo esgotado, erro) usam o mesmo lugar.
  const comTempo = online && !!view.actor && turnLeft !== null;
  const apertado = comTempo && isUrgent(turnLeft, turnTotalMs);
  const statusComTempo: { text: string; tone: StatusTone } = toast
    ? { text: toast, tone: 'bad' }
    : notice
      ? { text: notice.text, tone: 'info' }
      : comTempo
        ? {
            text: `${status.text} · ${formatLeft(turnTotalMs ? Math.min(turnLeft, turnTotalMs) : turnLeft)}`,
            tone: apertado ? 'bad' : status.tone,
          }
        : status;
  const park = () => {
    useOnline.getState().park();
    leaveTable();
  };
  const actorName = view.actor ? view.players.find((x) => x.id === view.actor!.playerId)?.name : undefined;
  const asyncNote =
    asyncRoom && view.actor && actorName
      ? `${view.actor.playerId === view.you ? 'Tua vez' : `Vez de ${actorName}`} · ${view.turnDeadline ? untilLabel(view.turnDeadline) : 'sem pressa'}`
      : null;

  return (
    <div
      ref={rootRef}
      className="mesa relative flex h-full flex-col overflow-hidden"
      // Celular deitado: nada embaixo do entalhe da câmera (a mesa mede o espaço que sobra).
      style={{ paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}
    >
      <TopBar
        round={view.roundNumber}
        cards={view.cardsThisRound}
        direction={view.direction}
        pyramid={view.rules.progression !== 'up'}
        onMenu={() => setMenu(true)}
        onScore={() => setScore(true)}
        note={asyncNote}
        frases={frasesNoAlto ? frasesAMao : null}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-[73.75rem] flex-1 flex-col">
        <div ref={tableRef} className="relative min-h-0 flex-1">
          {/* A vira muda a cada rodada: fica na mesa. Com manilhas fixas, a consulta mora no menu. */}
          {view.rules.hierarchy === 'vira' && <ForcaChip mode={view.rules.hierarchy} vira={view.vira} onOpen={() => setForca(true)} />}

          {online && onlineStatus === 'reconnecting' && (
            <div
              role="status"
              className="absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-copas px-4 py-1.5 text-sm font-bold whitespace-nowrap shadow-lg"
            >
              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-papel" />
              Reconectando…
            </div>
          )}
          {table.width > 0 && view.phase !== 'gameOver' && (
            <TurnSpotlight
              at={
                !view.actor
                  ? null
                  : view.actor.playerId === you
                    ? { x: table.width / 2, y: table.height + 30 }
                    : (geometry.seats.get(view.actor.playerId) ?? null)
              }
              urgent={turnLeft !== null && isUrgent(turnLeft, turnTotalMs)}
            />
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
                    video={comCamera.split(',').includes(p.id)}
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
                    compact={mesa.compact}
                    avatar={mesa.avatar}
                    rosto={mesa.rosto}
                    largura={mesa.box.w}
                    noAlto={at.y <= geometry.topo + 1}
                    isMao={view.order[0] === p.id}
                    round={view.roundNumber}
                    edge={at.x - seatBox.w * s / 2 < 12 * s ? 'left' : at.x + seatBox.w * s / 2 > table.width - 12 * s ? 'right' : null}
                    side={at.x < table.width / 2 ? 'right' : 'left'}
                    blind={view.blind}
                    lastToBid={lastBidder === p.id}
                    pitando={pitando(p.id)}
                    pitandoAtraso={(view.order.indexOf(p.id) * 1.3) % 3.6}
                  />
                );
              })}
          {/* As cartas na testa entram depois da faixa da rodada (as duas ocupam o centro da mesa). */}
        {reveal && !banner && <RevealCards players={view.players} you={you} layout={reveal} />}
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
              ctx={contextoDaRodada(view.rules, view.vira)}
              rodada={view.roundNumber}
              ritmo={ritmo}
            />
          )}
          <RoundBanner view={view} shown={banner} />
          <CantadasBanner view={view} seatOf={seatOf} top={cantadasTop(geometry, reveal, view.players.filter((p) => p.inRound).length, s)} />
          {naTesta && (
            <NaTesta
              key={`testa-${view.roundNumber}`}
              manilha={naTesta.nome}
              tu={naTesta.playerId === you}
              x={assentoNaTesta?.x ?? table.width / 2}
              acima={assentoNaTesta ? assentoNaTesta.y - geometry.seatBox.h / 2 : table.height - 8 * s}
              abaixo={assentoNaTesta ? assentoNaTesta.y + geometry.seatBox.h / 2 : table.height - 8 * s}
              largura={table.width}
            />
          )}
          <CoachTip tip={bidding ? null : tip} />
          <VideoAmpliado />
          <BidPanel
            open={bidding}
            cards={view.cardsThisRound}
            legal={view.legalBids}
            forbidden={view.forbiddenBid}
            bidsSum={view.bidsSum}
            suggested={suggestion.bid ?? null}
            blind={view.blind}
            isDealer={view.dealerId === you}
            isMao={!!you && view.order[0] === you}
            onBid={(value) => void send({ type: 'bid', value })}
            tip={bidding ? shownTip : null}
            keyboard={!layerOpen}
            compact={panelCompact}
            hintInline={vw >= 600 * s}
            deadline={myTurn ? view.turnDeadline : null}
            bottom={panelBottom}
            clock={
              myTurn && view.turnDeadline ? (
                <InlineTurnTimer key={view.turnDeadline} deadline={view.turnDeadline} totalMs={turnTotalMs} />
              ) : null
            }
          />
          {/* As frases favoritas no canto de baixo, perto do polegar. Na tua vez de cantar, o painel
              cobre o canto: somem até tu cantar. */}
          {table.width > 0 && !frasesNoAlto && !bidding && view.phase !== 'gameOver' && (
            <div className="absolute z-30" style={{ right: rem(PILULA_FRASES.direita), bottom: rem(PILULA_FRASES.baixo) }}>
              {frasesAMao}
            </div>
          )}
          <ReactionPicker
            open={picker}
            onClose={closePicker}
            naMesa={trickPlays.map((pl) => pl.cardId)}
            ctx={contextoDaRodada(view.rules, view.vira)}
            lugar={
              frasesNoAlto
                ? undefined
                : {
                    right: rem(PILULA_FRASES.direita),
                    bottom: rem(PILULA_FRASES.baixo + PILULA_FRASES.h + 8),
                    maxHeight: Math.max(160 * s, table.height - (PILULA_FRASES.baixo + PILULA_FRASES.h + 16) * s),
                    overflowY: 'auto',
                  }
            }
            onPick={(r) => {
              conn.react(r);
              setPicker(false);
            }}
          />
          <UrgentEdge on={myTurn && apertado} />
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
                status={statusComTempo}
                reaction={reactionFor(me.id)}
                isTurn={myTurn && !(view.phase === 'playing' && view.handHidden)}
                deadline={myTurn ? view.turnDeadline : null}
                isMao={!!you && view.order[0] === you}
                round={view.roundNumber}
                pitando={pitando(me.id)}
              />
            </div>
          )}
          {spectating ? (
            <div className="flex items-center justify-center gap-2 px-4 py-5">
              {soBots && !cameraRapida && (
                <Button variant="ouro" size="sm" onClick={() => conn.acelerar?.()}>
                  ⏩ Acelerar até o fim
                </Button>
              )}
              {soBots && cameraRapida && (
                <span className="animate-pulse rounded-full bg-noite/60 px-3 py-1.5 font-display text-sm font-bold text-ouros ring-1 ring-ouros/40">
                  ⏩ Câmera rápida…
                </span>
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
        open={resumoAberto}
        onEsconder={() => setResumoEscondido(view.roundNumber)}
        onNaoMostrar={() => settings.set({ resumoDaRodada: false })}
        view={view}
        seats={seats}
        autoMs={autoMs}
        onContinue={online ? undefined : () => conn.skipPause?.()}
        onAcelerar={soBots && !cameraRapida && !view.result ? () => conn.acelerar?.() : undefined}
      />
      {view.phase === 'gameOver' && (
        <GameOver
          view={view}
          seats={seats}
          series={seriesOn ? series : null}
          onAgain={online ? () => void pedirRevanche() : startLocalGame}
          againLabel={againLabel}
          againDisabled={online && !isHost() && pediRevanche}
          note={online ? (revancheErro ?? revancheNota) : null}
          onLobby={online && isHost() ? () => useOnline.getState().backToLobby() : undefined}
          exitLabel={online ? 'Sair da sala' : 'Voltar ao início'}
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
          Quem mata quem, da mais forte (1) pra mais fraca. Cartas da mesma linha empardam.
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
        hierarchy={view.rules.hierarchy}
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
        onPark={asyncRoom ? park : undefined}
        onSpeed={(m) => conn.setSpeed?.(m)}
        pace={online && isHost() ? room?.pace : undefined}
        onPace={online && isHost() ? (pace) => void useOnline.getState().update({ pace }) : undefined}
      />
      {meAway && <AwayBanner />}
      {online && <AdminNotice />}
    </div>
  );
}

/** Faixa no centro da mesa quando começa uma rodada ("Rodada 4 · 4 cartas"). */
/** Faixa do começo da rodada: aparece até o primeiro palpite ou por 1,5 s. */
function useRoundBanner(view: PlayerView): boolean {
  const [hiddenRound, setHiddenRound] = useState<number | null>(null);
  const fresh = view.phase === 'bidding' && view.players.every((p) => p.bid === null);
  const shown = fresh && hiddenRound !== view.roundNumber ? view.roundNumber : null;
  useEffect(() => {
    if (shown === null) return undefined;
    const t = window.setTimeout(() => setHiddenRound(shown), 1500);
    return () => window.clearTimeout(t);
  }, [shown]);
  return shown !== null;
}

/**
 * As cantadas na mesa, antes da primeira carta (o "pré-flop" da Fodinha): quanto cada um cantou e se
 * a mesa está pesada (cantaram mais que as cartas) ou leve. Fica enquanto ninguém jogou carta.
 */
function CantadasBanner({
  view,
  seatOf,
  top,
}: {
  view: PlayerView;
  seatOf: (id: string) => { avatar: string } | undefined;
  /** Topo da faixa na mesa (px); `null`: no terço de cima (mesa cheia, sem espaço livre embaixo). */
  top: number | null;
}) {
  const inRound = view.players.filter((p) => p.inRound);
  const allBid = inRound.length > 0 && inRound.every((p) => p.bid !== null);
  const beforeFirstCard =
    view.phase === 'playing' && inRound.every((p) => p.tricks === 0) && (view.trick?.plays.length ?? 0) === 0;
  const shown = allBid && beforeFirstCard;
  const sum = inRound.reduce((n, p) => n + (p.bid ?? 0), 0);
  const cards = view.cardsThisRound;
  const tone =
    sum > cards
      ? 'Mesa pesada: alguém vai ficar sem.'
      : sum < cards
        ? 'Mesa leve: vai sobrar mão.'
        : 'Certinho: quem errar, perde.';
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={view.roundNumber}
          className="pointer-events-none absolute inset-x-3 z-30 mx-auto flex max-w-md flex-col items-center"
          style={{ top: top ?? '30%' }}
          initial={{ opacity: 0, y: 16, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          role="status"
          aria-label={`As cantadas: ${inRound.map((p) => `${p.name} ${p.bid}`).join(', ')}. Cantaram ${sum} pra ${cards}.`}
        >
          <div className="papel flex w-full flex-col items-center gap-1.5 rounded-3xl px-4 py-2.5 shadow-[0_18px_40px_rgb(0_0_0/0.55)] ring-1 ring-black/10">
            <span className="font-display text-xl font-bold" style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
              As cantadas
            </span>
            <ul className="flex flex-wrap justify-center gap-x-3 gap-y-2">
              {inRound.map((p) => (
                <li key={p.id} className="flex items-center gap-1.5">
                  <Avatar seed={seatOf(p.id)?.avatar ?? p.id} size={26} />
                  <span className="max-w-20 truncate text-sm font-semibold">{p.id === view.you ? 'Tu' : p.name}</span>
                  <span className="rounded-full bg-tinta px-2 py-0.5 font-display text-base font-bold tabular-nums text-papel">{p.bid}</span>
                </li>
              ))}
            </ul>
            <span className="text-center text-sm text-tinta-2">
              Cantaram <strong className="text-tinta">{sum}</strong> pra {cards} {cards === 1 ? 'carta' : 'cartas'}. {tone}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RoundBanner({ view, shown: visible }: { view: PlayerView; shown: boolean }) {
  const shown = visible ? view.roundNumber : null;
  const mao = view.players.find((p) => p.id === view.order[0]);
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
          {mao && (
            <span className="mt-1.5 rounded-full bg-noite/55 px-3 py-0.5 text-sm font-semibold text-papel ring-1 ring-papel/15">
              {mao.id === view.you ? 'Tu é mão: palpita e joga primeiro' : `${mao.name} é mão`}
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
