import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { play } from '../../../lib/sound';
import { rem } from '../../../lib/ui-scale';
import { DURACAO_PALCO, useZoeira } from './agenda';
import { Capim, Cinzeiro, CuiaDeCima, Espeto, Galo, GatoPreto, Suor } from './desenhos';
import { Avatar } from '../../ui/Avatar';
import { RostoNaMesa } from '../../ui/Midia';
import { sintetizar } from '../../../lib/sintetizado';
import { Card, CARD_RATIO } from '../../cards/Card';
import type { Point } from '../layout';
import { DURACAO, FREGUES_EM } from './diretor';

/**
 * A voz da mesa: o narrador de galpão (ditado gaúcho escrito à mão numa tira de papel) e o coro da
 * turma (a frase que três mandaram juntos, em letra de torcida). É o único letreiro da zoeira, um de
 * cada vez; `top` é o mesmo lugar livre da faixa "As cantadas" (as duas nunca aparecem juntas).
 */
export function FaixaDaMesa({ top }: { top: number | null }) {
  const faixa = useZoeira((s) => s.faixa);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!faixa?.coro) return;
    // As palmas do coro: o estalo da carta, quatro vezes.
    for (let i = 0; i < 4; i++) play('play', { delayMs: i * 430, rate: 1.5 });
  }, [faixa?.chave, faixa?.coro]);
  return (
    <AnimatePresence>
      {faixa && !faixa.coro && (
        <motion.div
          key={faixa.chave}
          role="status"
          className="pointer-events-none absolute inset-x-3 z-30 mx-auto flex max-w-md justify-center"
          style={{ top: top ?? '30%' }}
          initial={reduce ? { opacity: 0 } : { x: '-110%', opacity: 1 }}
          animate={{ x: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { x: '110%', transition: { duration: 0.3, ease: 'easeIn' } }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <span
            className="papel rounded-md px-4 py-2 text-center font-hand text-[1.7rem] font-bold leading-[1.05] shadow-[0_12px_30px_rgb(0_0_0/0.5)]"
            style={{ rotate: '-2.5deg' }}
          >
            {faixa.texto}
          </span>
        </motion.div>
      )}
      {faixa?.coro && (
        <motion.div
          key={faixa.chave}
          role="status"
          className="pointer-events-none absolute inset-x-2 top-[36%] z-30 flex justify-center"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={reduce ? { opacity: 1, scale: 1 } : { opacity: 1, scale: [0.8, 1.14, 1, 1.14, 1, 1.14, 1, 1.14, 1], rotate: [-4, 3, -3, 3, -3, 3, -3, 3, -2] }}
          exit={{ opacity: 0, scale: 1.4, transition: { duration: 0.25 } }}
          transition={{ duration: (DURACAO.coro - 400) / 1000, ease: 'easeOut' }}
        >
          <span
            className="text-center font-display font-black uppercase leading-[0.95] text-papel"
            style={{
              fontVariationSettings: '"SOFT" 100, "WONK" 1',
              // Frase curta em letra grande; a comprida encolhe para caber.
              fontSize: `min(${rem(76)}, ${Math.round(150 / Math.max(6, faixa.texto.length))}vw)`,
              WebkitTextStroke: `${rem(7)} var(--color-copas-escuro)`,
              paintOrder: 'stroke fill',
              textShadow: `0 ${rem(5)} 0 var(--color-copas-escuro), 0 ${rem(10)} ${rem(22)} rgb(0 0 0 / 0.55)`,
            }}
          >
            {faixa.texto}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * O cartão fidelidade do freguês, no meio da mesa, só com a mão fechada (tempo morto): quem teve a
 * carta morta cinco vezes pelo mesmo dono leva os cinco carimbos, um por um.
 */
export function CartaoDoFregues({ nameOf }: { nameOf: (id: string) => string }) {
  const todo = useZoeira((s) => s.palco);
  const palco = todo?.tipo === 'fregues' ? todo : null;
  useEffect(() => {
    if (!palco) return;
    for (let i = 0; i < FREGUES_EM; i++) play('bid', { delayMs: 520 + i * 230, rate: 1.5 + i * 0.08 });
  }, [palco]);
  return (
    <AnimatePresence>
      {palco && (
        <motion.div
          key={palco.chave}
          role="status"
          aria-label={`Cartão fidelidade: ${nameOf(palco.fregues)}, freguês de ${nameOf(palco.dono)}. ${FREGUES_EM} de ${FREGUES_EM}.`}
          className="pointer-events-none absolute inset-x-4 top-[30%] z-40 flex justify-center"
          initial={{ y: 260, rotate: 12, opacity: 0 }}
          animate={{ y: 0, rotate: -3, opacity: 1 }}
          exit={{ y: -40, opacity: 0, transition: { duration: 0.25 } }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          <div className="papel flex w-full max-w-xs flex-col items-center gap-1.5 rounded-2xl px-4 py-3 text-center shadow-[0_18px_40px_rgb(0_0_0/0.55)] ring-1 ring-black/10">
            <span className="font-display text-2xl font-black leading-none" style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
              Cartão fidelidade
            </span>
            <span className="text-sm font-semibold text-tinta-2">
              <strong className="text-tinta">{nameOf(palco.fregues)}</strong>, freguês de <strong className="text-tinta">{nameOf(palco.dono)}</strong>
            </span>
            <span className="flex gap-2 py-0.5" aria-hidden="true">
              {Array.from({ length: FREGUES_EM }, (_, i) => (
                <span key={i} className="relative block size-9 rounded-full ring-2 ring-tinta/25">
                  <motion.span
                    className="absolute inset-0 block rounded-full border-[0.3rem] border-copas"
                    style={{ rotate: -12, boxShadow: 'inset 0 0 0 0.16rem var(--color-papel), inset 0 0 0 0.42rem var(--color-copas)' }}
                    initial={{ scale: 2.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.23, duration: 0.16, ease: 'easeIn' }}
                  />
                </span>
              ))}
            </span>
            <motion.span
              className="font-hand text-2xl font-bold leading-none text-copas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + FREGUES_EM * 0.23 }}
            >
              A próxima surra é por conta da casa
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * O cinzeiro da espera: junta as bitucas dos palheiros fumados esperando alguém (por baixo de
 * assentos e cartas, como coisa em cima da mesa). A conta de quem fez a mesa esperar sai no fim.
 */
export function CinzeiroDaMesa({ left, bottom, largura }: { left: number; bottom: number; largura: number }) {
  const total = useZoeira((s) => s.cinzeiro.total);
  if (total <= 0) return null;
  return (
    <motion.div
      key={total}
      role="img"
      aria-label={`Cinzeiro da espera: ${total} ${total === 1 ? 'bituca' : 'bitucas'}`}
      className="pointer-events-none absolute z-[1]"
      style={{ left, bottom, width: largura }}
      initial={{ scale: 1.25 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 16 }}
    >
      <Cinzeiro w="100%" bitucas={total} />
      <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-noite/80 px-1 text-xs font-bold tabular-nums text-papel ring-1 ring-papel/25">
        {total}
      </span>
    </motion.div>
  );
}

export interface PorUmFio {
  nome: string;
  avatar: string;
  palitos: number;
  cantou: number | null;
  camera: boolean;
}

/**
 * O corte de novela da mão que decide: a última carta aparece inteira, e a imagem corta para o rosto
 * de quem está por um fio (a câmera, se estiver aberta; senão o avatar suando), grande, com as faixas
 * de cinema e a legenda de telejornal, enquanto o bombo rufa; depois corta de volta para a mesa e a
 * vencedora sobe. Corte seco, sem zoom de desenho animado: um empurrãozinho lento de câmera, e só. A
 * legenda diz o que a mesa já sabe (palitos e cantada), nunca o resultado.
 */
function CorteDeNovela({ quem, infoDe, largura, altura, escala }: { quem: string[]; infoDe: (id: string) => PorUmFio | null; largura: number; altura: number; escala: number }) {
  const gente = quem.map((id) => ({ id, info: infoDe(id) })).filter((x) => x.info);
  const n = Math.max(1, gente.length);
  // Em px da tela; o rosto usa a escala 1 (`rem`), daí a divisão.
  const lado = Math.min(largura * (n > 1 ? 0.4 : 0.56), altura * (n > 1 ? 0.34 : 0.44), 340 * escala);
  const topo = Math.max(altura * 0.12, altura / 2 - lado * 0.62);
  return (
    <motion.div className="pointer-events-none absolute inset-0 z-[56] overflow-hidden" exit={{ opacity: 0, transition: { duration: 0.08 } }} role="status" aria-label={`A mão que decide: ${gente.map((g) => g.info!.nome).join(' e ')}`}>
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, rgb(30 18 10 / 0.86), rgb(0 0 0 / 0.95))' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.08 }}
      />
      <div className="absolute inset-x-0 top-0 h-[9%] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[9%] bg-black" />
      <div className="absolute inset-x-0 flex items-start justify-center" style={{ top: topo, gap: largura * 0.06 }}>
        {gente.map(({ id, info }) => {
          const i = info!;
          return (
            <motion.div
              key={id}
              className="flex flex-col items-center"
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: 1, scale: 1.07 }}
              transition={{ opacity: { duration: 0.06 }, scale: { duration: DURACAO_PALCO.corte / 1000, ease: 'linear' } }}
            >
              <span className="relative block rounded-full shadow-[0_0_0_4px_rgb(251_242_223/0.9),0_0_60px_18px_rgb(255_215_150/0.35)]">
                <RostoNaMesa playerId={id} seed={i.avatar} size={lado / escala} tamanhoVideo={lado / escala} />
                {!i.camera && (
                  <motion.span
                    className="absolute block"
                    style={{ right: '8%', top: '22%', width: lado * 0.12 }}
                    initial={{ y: 0, opacity: 0 }}
                    animate={{ y: [0, 0, lado * 0.2], opacity: [0, 1, 0] }}
                    transition={{ duration: 1.6, times: [0, 0.2, 1], delay: 0.3, ease: 'easeIn' }}
                  >
                    <Suor w="100%" />
                  </motion.span>
                )}
              </span>
              <span className="mt-2 flex flex-col items-start border-l-4 border-ouros bg-black/85 px-3 py-1 text-left">
                <span className="font-display text-lg font-bold leading-tight text-papel">{i.nome}</span>
                <span className="text-xs font-semibold leading-tight text-papel/75">
                  {i.palitos === 1 ? 'No último palito' : `${i.palitos} palitos`}
                  {i.cantou !== null ? `, cantou ${i.cantou}` : ''}
                </span>
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

/**
 * O resto do palco (o meio da mesa, só em tempo morto): o duelo de galpão quando sobram dois, a cuia
 * que gira e aponta quem dá as cartas no começo, o baralho que escapa da mão de quem dá, e o corte de
 * novela da mão que decide.
 */
export function PalcoDaMesa({
  nameOf,
  avatarDe,
  pontoDe,
  centro,
  infoDe,
  largura,
  altura,
  escala,
}: {
  nameOf: (id: string) => string;
  avatarDe: (id: string) => string | undefined;
  pontoDe: (id: string) => Point | null;
  centro: Point;
  infoDe: (id: string) => PorUmFio | null;
  largura: number;
  altura: number;
  escala: number;
}) {
  const palco = useZoeira((s) => s.palco);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!palco) return;
    if (palco.tipo === 'duelo') play('sweep', { rate: 0.5 });
    if (palco.tipo === 'cuia') play('shuffle', { rate: 1.4 });
    if (palco.tipo === 'tropeco') play('deal', { rate: 0.7 });
    if (palco.tipo === 'corte') {
      sintetizar('rufar', { duracaoMs: DURACAO_PALCO.corte });
      play('pau', { delayMs: DURACAO_PALCO.corte + 120, rate: 0.6 });
    }
  }, [palco]);
  return (
    <AnimatePresence>
      {palco?.tipo === 'corte' && <CorteDeNovela key={palco.chave} quem={palco.quem} infoDe={infoDe} largura={largura} altura={altura} escala={escala} />}
      {palco?.tipo === 'duelo' && (
        <motion.div key={palco.chave} role="status" aria-label={`Duelo: ${nameOf(palco.a)} contra ${nameOf(palco.b)}`} className="pointer-events-none absolute inset-0 z-[44] overflow-hidden" exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-x-0 top-0 h-[12%] bg-black" initial={{ y: '-100%' }} animate={{ y: 0 }} exit={{ y: '-100%' }} transition={{ duration: 0.3 }} />
          <motion.div className="absolute inset-x-0 bottom-0 h-[12%] bg-black" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.3 }} />
          <div className="absolute inset-x-0 top-[34%] flex items-center justify-center gap-[12%]">
            {[palco.a, palco.b].map((id, i) => (
              <motion.div
                key={id}
                className="flex flex-col items-center gap-1"
                initial={{ x: i === 0 ? -160 : 160, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 20, delay: 0.25 }}
              >
                <Avatar seed={avatarDe(id) ?? id} size={84} className="ring-4 ring-papel/80" />
                <span className="font-display text-lg font-bold texto-gravado">{nameOf(id)}</span>
              </motion.div>
            ))}
          </div>
          {!reduce && (
            <motion.span
              className="absolute block"
              style={{ bottom: '15%', width: 54 }}
              initial={{ left: '-14%', rotate: 0 }}
              animate={{ left: '110%', rotate: 900, y: [0, -14, 0, -10, 0, -8, 0] }}
              transition={{ duration: DURACAO_PALCO.duelo / 1000, ease: 'linear' }}
            >
              <Capim w="100%" />
            </motion.span>
          )}
        </motion.div>
      )}
      {palco?.tipo === 'cuia' && (
        <motion.div
          key={palco.chave}
          role="status"
          aria-label={`A cuia escolheu: ${nameOf(palco.pe)} dá as cartas`}
          className="pointer-events-none absolute z-[44] block"
          style={{ left: centro.x - 60, top: centro.y - 60, width: 120 }}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          <CuiaGirando alvo={pontoDe(palco.pe)} centro={centro} parado={!!reduce} />
        </motion.div>
      )}
      {palco?.tipo === 'tropeco' && !reduce && (
        <Tropeco key={palco.chave} de={pontoDe(palco.de) ?? centro} centro={centro} />
      )}
    </AnimatePresence>
  );
}

function CuiaGirando({ alvo, centro, parado }: { alvo: Point | null; centro: Point; parado: boolean }) {
  // A bomba para apontando quem dá as cartas, depois de umas voltas.
  const fim = alvo ? (Math.atan2(alvo.x - centro.x, -(alvo.y - centro.y)) * 180) / Math.PI : 0;
  return (
    <motion.span className="block" initial={{ rotate: parado ? fim : 0 }} animate={{ rotate: parado ? fim : 1080 + fim }} transition={{ duration: 1.8, ease: [0.15, 0.7, 0.25, 1] }}>
      <CuiaDeCima w="120px" />
    </motion.span>
  );
}

/** O baralho escapa da mão de quem dá: as cartas se espalham viradas e voltam para o monte. */
function Tropeco({ de, centro }: { de: Point; centro: Point }) {
  const w = 34;
  return (
    <motion.div className="pointer-events-none absolute inset-0 z-[44]" exit={{ opacity: 0 }} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => {
        const ang = (i * 137) % 360;
        const r = 50 + ((i * 29) % 70);
        const x = centro.x + Math.cos((ang * Math.PI) / 180) * r;
        const y = centro.y + Math.sin((ang * Math.PI) / 180) * r * 0.7;
        return (
          <motion.span
            key={i}
            className="absolute block"
            style={{ left: 0, top: 0, width: w, marginLeft: -w / 2, marginTop: (-w * CARD_RATIO) / 2 }}
            initial={{ x: de.x, y: de.y, rotate: 0 }}
            animate={{ x: [de.x, x, x, centro.x], y: [de.y, y, y, centro.y], rotate: [0, ang, ang, 0], opacity: [1, 1, 1, 0] }}
            transition={{ duration: DURACAO_PALCO.tropeco / 1000, times: [0, 0.3, 0.65, 1], ease: 'easeOut', delay: i * 0.02 }}
          >
            <Card width={w} faceDown />
          </motion.span>
        );
      })}
    </motion.div>
  );
}

const PASSANTES = { galo: { Desenho: Galo, w: 64, pula: true }, gato: { Desenho: GatoPreto, w: 70, pula: false }, espeto: { Desenho: Espeto, w: 150, pula: false } } as const;

/**
 * Quem atravessa a mesa por baixo das cartas e dos assentos (o galo do "é galo", o gato preto da
 * sexta-feira 13, o espeto do Dia do Churrasco). Um de cada vez, e nunca pega toque.
 */
export function PassanteNaMesa({ altura }: { altura: number }) {
  const passante = useZoeira((s) => s.passante);
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <AnimatePresence>
      {passante && (
        <motion.span
          key={passante.chave}
          aria-hidden="true"
          className="pointer-events-none absolute z-[2] block"
          style={{ top: altura * 0.62, width: PASSANTES[passante.tipo].w }}
          initial={{ left: '-25%' }}
          animate={{ left: '112%', y: PASSANTES[passante.tipo].pula ? [0, -6, 0, -6, 0, -6, 0, -6, 0] : 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURACAO_PALCO.passante / 1000, ease: 'linear' }}
        >
          {(() => {
            const D = PASSANTES[passante.tipo].Desenho;
            return <D w="100%" />;
          })()}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
