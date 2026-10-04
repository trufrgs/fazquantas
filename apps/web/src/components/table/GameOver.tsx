import { seriesTable, type PlayerView, type SeriesState } from '@fodinha/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { SeatInfo } from '../../lib/connection';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { useZoeira } from './zoeira/agenda';
import { JornalDoBolicho } from './zoeira/JornalDoBolicho';
import { fraseDoLance, jornalDaNoite, trofeusDaNoite } from './zoeira/noite';

export interface GameOverProps {
  view: PlayerView;
  seats: SeatInfo[];
  onAgain?: () => void;
  againLabel?: string;
  /** Online, convidado que já pediu a revanche: o botão fica marcado. */
  againDisabled?: boolean;
  /** Linha embaixo do botão (quem pediu revanche, como ela começa, ou o erro). */
  note?: string | null;
  onExit: () => void;
  /** Texto do botão de sair ("Sair da sala" online; no jogo local, "Voltar ao início"). */
  exitLabel?: string;
  /** Online, anfitrião: volta a sala para o lobby. */
  onLobby?: () => void;
  /** Online, série "melhor de X" (a partida que acabou já está contada). */
  series?: SeriesState | null;
}

async function celebrate() {
  const { default: confetti } = await import('canvas-confetti');
  const colors = ['#e3a82b', '#c4372d', '#2e5c9c', '#3d7a3a', '#f7efde'];
  confetti({
    particleCount: 140,
    spread: 80,
    origin: { y: 0.35 },
    colors,
    disableForReducedMotion: true,
  });
  window.setTimeout(
    () =>
      confetti({
        particleCount: 90,
        angle: 60,
        spread: 60,
        origin: { x: 0, y: 0.6 },
        colors,
        disableForReducedMotion: true,
      }),
    250,
  );
  window.setTimeout(
    () =>
      confetti({
        particleCount: 90,
        angle: 120,
        spread: 60,
        origin: { x: 1, y: 0.6 },
        colors,
        disableForReducedMotion: true,
      }),
    400,
  );
}

export function GameOver({
  view,
  seats,
  onAgain,
  againLabel = 'Mais uma?',
  againDisabled = false,
  note,
  onExit,
  exitLabel = 'Voltar ao início',
  onLobby,
  series,
}: GameOverProps) {
  const result = view.result;
  const youWon = !!result && !!view.you && result.winners.includes(view.you);
  const draw = (result?.winners.length ?? 0) > 1;
  const champion = series?.champion ?? null;
  const youChampion = !!champion && !!view.you && champion.includes(view.you);

  useEffect(() => {
    if (youWon || youChampion) void celebrate();
  }, [youWon, youChampion]);

  const cinzeiro = useZoeira((s) => s.cinzeiro);
  const contas = useZoeira((s) => s.contas);
  const fotos = useZoeira((s) => s.fotos);
  const lances = useZoeira((s) => s.lances);
  const trofeus = useMemo(() => trofeusDaNoite(view, contas), [view, contas]);
  const jornal = useMemo(() => jornalDaNoite(view, contas, new Date(), { fotos, lances }), [view, contas, fotos, lances]);
  const [lendo, setLendo] = useState(false);
  if (!result) return null;
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? series?.names[id] ?? id;

  const gameTitle = draw
    ? `Empate entre ${result.winners.map(name).join(' e ')}`
    : youWon
      ? 'Bah, tu ganhou!'
      : `${name(result.winners[0]!)} ganhou`;
  const title = champion
    ? youChampion
      ? champion.length > 1
        ? 'Série dividida!'
        : 'Tu levou a série!'
      : `${champion.map(name).join(' e ')} ${champion.length > 1 ? 'dividiram' : 'levou'} a série`
    : gameTitle;
  const kicker = series
    ? champion
      ? `fim da série · melhor de ${series.bestOf}`
      : `partida ${series.games.length} · melhor de ${series.bestOf}`
    : 'fim de jogo';

  const mine = view.you ? view.history.filter((r) => r.bids[view.you!] !== undefined) : [];
  const exact = mine.filter((r) => r.bids[view.you!] === r.tricks[view.you!]).length;

  return (
    <AnimatePresence>
      <motion.div
        className="ate-o-fim fixed inset-0 z-50 flex overflow-y-auto bg-noite/70 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        role="dialog"
        aria-modal="true"
        aria-label="Fim de jogo"
      >
        <motion.div
          className="papel m-auto w-full max-w-sm rounded-[1.75rem] p-5 shadow-2xl"
          initial={{ y: 40, scale: 0.9, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}
        >
          <p className="text-center font-hand text-2xl text-tinta-2">{kicker}</p>
          <h2
            className="text-center font-display text-4xl font-bold leading-tight"
            style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
          >
            {title}
          </h2>
          {series && (
            <div className="mt-4 rounded-2xl bg-tinta/5 p-3" aria-label="Placar da série">
              <p className="mb-2 flex items-baseline justify-between text-sm font-semibold text-tinta-2">
                <span>Placar da série</span>
                <span>
                  {champion ? `${series.games.length} partidas` : `leva quem fizer ${series.target}`}
                </span>
              </p>
              <ol className="flex flex-col gap-1">
                {seriesTable(series).map((row) => (
                  <li
                    key={row.id}
                    className={`flex items-center gap-2 rounded-xl px-2 py-1 ${champion?.includes(row.id) ? 'bg-ouros/35' : ''} ${row.id === view.you ? 'font-bold' : ''}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <span className="flex gap-0.5" aria-label={`${row.wins} ${row.wins === 1 ? 'vitória' : 'vitórias'}`}>
                      {Array.from({ length: Math.max(series.target, row.wins) }, (_, i) => (
                        <span
                          key={i}
                          aria-hidden="true"
                          className={`h-3 w-3 rounded-full ring-1 ring-tinta/25 ${i < row.wins ? 'bg-ouros-escuro' : 'bg-transparent'}`}
                        />
                      ))}
                    </span>
                    <span className="w-14 text-right text-sm tabular-nums text-tinta-2">{row.points} pts</span>
                  </li>
                ))}
              </ol>
              {champion && champion.some((id) => (series.wins[id] ?? 0) < series.target) && (
                <p className="mt-2 text-center text-sm text-tinta-2">
                  {champion.length > 1
                    ? 'Empate em vitórias e em pontos: o título fica dividido.'
                    : 'Ninguém chegou às vitórias que decidem: desempatou nos pontos.'}
                </p>
              )}
            </div>
          )}
          {series && (
            <p className="mt-4 text-sm font-semibold text-tinta-2">
              {champion ? 'Última partida' : 'Esta partida'}: {gameTitle.replace('Bah, tu ganhou!', 'tu ganhou')}
            </p>
          )}
          <ol className={`${series ? 'mt-2' : 'mt-4'} flex flex-col gap-2`}>
            {result.ranking.map((id, i) => {
              const seat = seats.find((s) => s.id === id);
              const p = view.players.find((x) => x.id === id);
              const winner = result.winners.includes(id);
              return (
                <li
                  key={id}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${winner ? 'bg-ouros/35 ring-1 ring-ouros-escuro/40' : 'bg-tinta/5'} ${id === view.you ? 'font-bold' : ''}`}
                >
                  <span className="w-5 text-center font-display text-lg font-bold tabular-nums">
                    {i + 1}
                  </span>
                  <Avatar seed={seat?.avatar ?? id} size={32} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{p?.name ?? id}</span>
                  <span className="text-sm text-tinta-2">
                    {winner ? '🏆' : p?.eliminatedRound ? `saiu na ${p.eliminatedRound}ª` : ''}
                  </span>
                </li>
              );
            })}
          </ol>
          {mine.length > 0 && (
            <p className="mt-3 text-center text-sm text-tinta-2">
              Tu acertou <strong className="text-tinta">{exact}</strong> de {mine.length}{' '}
              {mine.length === 1 ? 'palpite' : 'palpites'}.
            </p>
          )}
          {/* Os troféus da noite (os que ninguém quer ganhar) e o jornal para mandar no grupo. */}
          {trofeus.length > 0 && (
            <div className="mt-3 rounded-2xl bg-tinta/5 p-3" aria-label="Troféus da noite">
              <p className="m-0 mb-1 font-display text-base font-bold" style={{ fontVariationSettings: '"SOFT" 100' }}>
                Troféus da noite
              </p>
              <div className="flex flex-col gap-1">
                {trofeus.map((t) => (
                  <p key={t.id} className="m-0 flex flex-col text-sm leading-tight">
                    <span className="font-semibold">
                      {t.titulo}: <span className="font-bold">{name(t.quem)}</span>
                    </span>
                    <span className="text-xs text-tinta-2">{t.detalhe}</span>
                  </p>
                ))}
              </div>
              {cinzeiro.total > 0 && <p className="m-0 mt-1 font-hand text-lg leading-tight text-tinta-2">Cinzeiro da espera: {cinzeiro.total} {cinzeiro.total === 1 ? 'bituca' : 'bitucas'}.</p>}
            </div>
          )}
          {(fotos.length > 0 || lances.length > 0) && (
            <div className="mt-3 rounded-2xl bg-tinta/5 p-3" aria-label="A foto do vexame e o lance da noite">
              {fotos.length > 0 && (
                <>
                  <p className="m-0 mb-2 font-display text-base font-bold" style={{ fontVariationSettings: '"SOFT" 100' }}>
                    A foto do vexame
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {fotos.slice(0, 3).map((f, i) => (
                      <figure key={`${f.id}-${f.rodada}`} className="m-0 flex flex-col items-center" style={{ rotate: `${i % 2 ? 4 : -4}deg` }}>
                        <img src={f.url} alt={`A cara de ${name(f.id)} na hora`} className="size-20 border-[4px] border-b-[14px] border-white object-cover shadow-md" />
                        <figcaption className="mt-0.5 text-xs font-semibold text-tinta-2">
                          {name(f.id)}, {f.rodada}ª
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </>
              )}
              {lances.length > 0 && (
                <p className={`m-0 text-sm leading-tight ${fotos.length > 0 ? 'mt-2' : ''}`}>
                  <span className="font-semibold">Lance da noite: </span>
                  {fraseDoLance(name(lances.at(-1)!.dono), lances.at(-1)!.carta)}
                </p>
              )}
            </div>
          )}
          {jornal && (
            <>
              <button
                type="button"
                onClick={() => setLendo(true)}
                className="mt-3 w-full rounded-2xl border-2 border-dashed border-tinta/30 py-2 font-display text-lg font-black"
                style={{ fontVariationSettings: '"WONK" 1' }}
              >
                Jornal do Bolicho: ler e mandar no grupo
              </button>
              <JornalDoBolicho jornal={jornal} aberto={lendo} onFechar={() => setLendo(false)} />
            </>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {onAgain && (
              <Button variant={againDisabled ? 'papel' : 'ouro'} size="lg" onClick={onAgain} disabled={againDisabled}>
                {againLabel}
              </Button>
            )}
            {note && (
              <p role="status" className="text-center text-sm font-semibold text-tinta-2">
                {note}
              </p>
            )}
            {onLobby && (
              <Button variant="papel" onClick={onLobby}>
                Voltar pra sala
              </Button>
            )}
            <Button variant="papel" onClick={onExit}>
              {exitLabel}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
