import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Lightbulb } from 'lucide-react';
import { CoachTip, type TipId } from './CoachTip';

export interface BidPanelProps {
  open: boolean;
  cards: number;
  legal: readonly number[];
  forbidden: number | null;
  bidsSum: number;
  suggested: number | null;
  blind: boolean;
  isDealer: boolean;
  /** És mão: palpita (e depois joga) primeiro. */
  isMao?: boolean;
  onBid: (value: number) => void;
  /** Dica de primeira partida mostrada no topo do painel. */
  tip?: TipId | null;
  /** Atalhos 0–9 ligados (desligados com menu/folha aberta por cima). */
  keyboard?: boolean;
  /**
   * Mesa baixa (celular deitado): uma linha só, para não cobrir a fileira de cima nem as cartas
   * na testa dos outros.
   */
  compact?: boolean;
  /** Distância (px) do pé da mesa até a base do painel; negativa desce por cima da tua faixa. */
  bottom?: number;
  /** Na barra de uma linha, há largura para o aviso ao lado dos números. */
  hintInline?: boolean;
  /** Prazo da tua vez (online com tempo por jogada): o painel cobre a tua faixa, então a conta vai nele. */
  deadline?: number | null;
  /** Relógio da tua vez, no cabeçalho do painel (junto das cantadas). */
  clock?: ReactNode;
}

/** Tempo que falta para palpitar: uma linha fina no alto do painel, que esvazia até o prazo. */
function TimeLeft({ deadline }: { deadline: number }) {
  const [start] = useState(() => Date.now());
  const total = Math.max(0, deadline - start);
  if (total === 0) return null;
  return (
    <span
      className="pointer-events-none absolute inset-x-5 top-1.5 h-1 overflow-hidden rounded-full bg-tinta/10"
      aria-hidden="true"
    >
      <motion.span
        className="block h-full origin-left rounded-full bg-copas"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: total / 1000, ease: 'linear' }}
      />
    </span>
  );
}

/** Painel "Quantas tu faz?" — toque no número confirma o palpite. */
export function BidPanel(p: BidPanelProps) {
  const options = Array.from({ length: p.cards + 1 }, (_, i) => i);
  const { open, legal, onBid } = p;
  const keyboard = p.keyboard ?? true;

  // Desktop: as teclas 0–9 palpitam (só dígitos: Espaço não pode virar "0").
  useEffect(() => {
    if (!open || !keyboard) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!/^[0-9]$/.test(e.key)) return;
      const n = Number(e.key);
      if (legal.includes(n)) {
        e.preventDefault();
        onBid(n);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, keyboard, legal, onBid]);
  const big = options.length > 8;
  const compact = p.compact ?? false;
  // Barra de uma linha só com largura para título, números e aviso; tela estreita usa duas linhas
  // curtas (botões largos o bastante para o dedo).
  const oneRow = compact && (p.hintInline ?? false);
  const title = (
    <h2
      className={`font-display font-bold leading-tight ${compact ? 'text-lg' : 'text-[1.35rem]'}`}
      style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}
    >
      Quantas tu faz?
    </h2>
  );
  const sum = (
    <span className={`flex shrink-0 items-center gap-2 text-tinta-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span>
        cantaram <strong className="tabular-nums text-tinta">{p.bidsSum}</strong> de {p.cards}
      </span>
      {p.clock}
    </span>
  );
  const note =
    p.forbidden !== null ? (
      <>
        Tu é o <strong className="text-tinta">pé</strong>: não pode pedir {p.forbidden}, senão a
        soma bate {p.cards}.
      </>
    ) : p.blind ? (
      <>Tua carta tá na testa: palpita olhando as dos outros.</>
    ) : p.isDealer ? (
      <>Tu é o pé: palpita por último.</>
    ) : p.isMao ? (
      <>Tu é mão: palpita e começa jogando.</>
    ) : null;
  // Na barra de uma linha o aviso vai ao lado dos números, se couber; nunca numa linha a mais.
  const hint =
    note &&
    (compact ? (
      p.hintInline &&
      options.length <= 6 && (
        <p className="w-[13rem] shrink-0 text-xs leading-snug text-tinta-2">{note}</p>
      )
    ) : (
      <p className="mt-2 text-[0.8125rem] leading-snug text-tinta-2">{note}</p>
    ));
  return (
    <AnimatePresence>
      {p.open && (
        <motion.section
          aria-label="Teu palpite"
          className={`papel absolute z-40 mx-auto rounded-3xl shadow-[0_18px_40px_rgb(0_0_0/0.55)] ring-1 ring-black/10 ${
            compact ? 'inset-x-2 px-3 py-2' : 'inset-x-3 max-w-md px-4 pb-3.5 pt-3'
          }`}
          style={{ bottom: p.bottom ?? 8 }}
          initial={{ y: 40, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 30, opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          {p.deadline ? <TimeLeft key={p.deadline} deadline={p.deadline} /> : null}
          <CoachTip tip={p.tip ?? null} inline />
          {(!compact || !oneRow) && (
            <header
              className={`flex items-baseline justify-between gap-3 ${compact ? 'mb-1.5' : 'mb-2.5'}`}
            >
              {title}
              {sum}
            </header>
          )}
          <div className={oneRow ? 'flex items-center gap-3' : undefined}>
            {oneRow && (
              <div className="flex shrink-0 flex-col">
                {title}
                {sum}
              </div>
            )}
            <div
              className={`grid ${compact ? 'flex-1 grid-flow-col auto-cols-fr gap-1.5' : `gap-2 ${big ? 'grid-cols-6' : options.length > 5 ? 'grid-cols-5' : 'grid-flow-col auto-cols-fr'}`}`}
            >
              {options.map((n) => {
                const allowed = p.legal.includes(n);
                const isForbidden = p.forbidden === n;
                const hint = p.suggested === n && allowed;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={!allowed}
                    onClick={() => p.onBid(n)}
                    aria-label={isForbidden ? `${n} (proibido para o pé)` : `Palpite ${n}`}
                    className={`ficha relative font-display font-bold ${compact ? 'h-11 text-xl' : 'h-12 text-2xl'} ${
                      allowed ? 'ficha-ouro' : 'ficha-papel'
                    } ${hint ? 'ring-4 ring-luz/90' : ''}`}
                  >
                    {n}
                    {isForbidden && (
                      <span
                        className="absolute inset-2 rotate-[-35deg] border-t-[3px] border-copas"
                        aria-hidden="true"
                      />
                    )}
                    {hint && (
                      <span
                        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-tinta text-luz shadow"
                        title="Sugestão"
                      >
                        <Lightbulb size="0.875rem" strokeWidth={2.5} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {oneRow && hint}
          </div>
          {!compact && hint}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
