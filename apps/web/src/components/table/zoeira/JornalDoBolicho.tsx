import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../ui/Button';
import type { Jornal } from './noite';

/**
 * O Jornal do Bolicho: a partida virou primeira página, girando como em filme antigo, pronta para
 * mandar no grupo (caderno de zoeira, 02/10/2026). "Mandar no grupo" gera a imagem do jornal e abre
 * o compartilhar do celular; onde não dá, baixa a imagem.
 */
export function JornalDoBolicho({ jornal, aberto, onFechar }: { jornal: Jornal; aberto: boolean; onFechar: () => void }) {
  const reduce = useReducedMotion();
  const [recado, setRecado] = useState<string | null>(null);
  // Fora do cartão do fim de jogo (que tem transformação): a folha ocupa a tela toda.
  return createPortal(
    <AnimatePresence>
      {aberto && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-noite/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Jornal do Bolicho"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onFechar}
        >
          <motion.div
            className="flex w-full max-w-sm flex-col items-center gap-3"
            initial={reduce ? { opacity: 0 } : { scale: 0.05, rotate: -1080, opacity: 0.6 }}
            animate={{ scale: 1, rotate: -2, opacity: 1 }}
            transition={{ duration: reduce ? 0.2 : 1.1, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <article className="papel w-full px-5 pb-5 pt-4 text-center text-[#17110c] shadow-[0_24px_60px_rgb(0_0_0/0.7)]" style={{ background: '#efe8d6' }}>
              <header className="border-b-[5px] border-double border-[#17110c] pb-1.5">
                <h2 className="m-0 font-display text-3xl font-black leading-none" style={{ fontVariationSettings: '"WONK" 1' }}>
                  Jornal do Bolicho
                </h2>
                <p className="m-0 mt-1 text-xs font-semibold first-letter:uppercase">{jornal.data} · Preço: um palito</p>
              </header>
              <p className="m-0 mt-3 font-display text-[1.75rem] font-black leading-[1.02]">{jornal.manchete}</p>
              {jornal.nota && <p className="m-0 mt-2 text-sm font-semibold leading-snug">{jornal.nota}</p>}
              {jornal.classificados.length > 0 && (
                <div className="mt-3 border-t-2 border-[#17110c] pt-2 text-left text-xs leading-snug">
                  <p className="m-0 mb-0.5 font-display text-sm font-black uppercase tracking-wide">Classificados</p>
                  {jornal.classificados.map((c) => (
                    <p key={c} className="m-0">
                      {c}
                    </p>
                  ))}
                </div>
              )}
            </article>
            <div className="flex w-full gap-2">
              <Button
                variant="ouro"
                className="flex-1"
                onClick={async () => {
                  const r = await mandarJornal(jornal);
                  setRecado(r === 'baixou' ? 'A imagem do jornal foi baixada: é só mandar no grupo.' : r === 'falhou' ? 'Não deu para gerar a imagem agora.' : null);
                }}
              >
                Mandar no grupo
              </Button>
              <button type="button" onClick={onFechar} aria-label="Fechar o jornal" className="flex size-12 items-center justify-center rounded-2xl bg-noite/60 text-papel ring-1 ring-papel/20">
                <X size={20} />
              </button>
            </div>
            {recado && (
              <p role="status" className="m-0 text-center text-sm font-semibold text-luz">
                {recado}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Quebra o texto em linhas que cabem na largura (canvas). */
function linhas(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const out: string[] = [];
  let atual = '';
  for (const palavra of texto.split(' ')) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(tentativa).width > largura && atual) {
      out.push(atual);
      atual = palavra;
    } else atual = tentativa;
  }
  if (atual) out.push(atual);
  return out;
}

/** A imagem do jornal (1080×1350, o formato que o WhatsApp mostra inteiro). */
export async function imagemDoJornal(j: Jornal): Promise<Blob | null> {
  try {
    await document.fonts?.ready;
  } catch {
    // sem as fontes: sai com a do sistema
  }
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1350;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const display = "'Fraunces Variable', Georgia, serif";
  const corpo = "'Figtree Variable', system-ui, sans-serif";
  ctx.fillStyle = '#3a2213';
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.save();
  ctx.translate(540, 675);
  ctx.rotate((-2 * Math.PI) / 180);
  ctx.fillStyle = '#efe8d6';
  ctx.fillRect(-440, -560, 880, 1120);
  ctx.fillStyle = '#17110c';
  ctx.textAlign = 'center';
  let y = -470;
  ctx.font = `900 92px ${display}`;
  ctx.fillText('Jornal do Bolicho', 0, y);
  y += 46;
  ctx.font = `600 30px ${corpo}`;
  ctx.fillText(`${j.data.charAt(0).toLocaleUpperCase('pt-BR')}${j.data.slice(1)} · Preço: um palito`, 0, y);
  y += 26;
  ctx.fillRect(-400, y, 800, 6);
  ctx.fillRect(-400, y + 12, 800, 3);
  y += 110;
  ctx.font = `900 84px ${display}`;
  for (const l of linhas(ctx, j.manchete, 780)) {
    ctx.fillText(l, 0, y);
    y += 88;
  }
  if (j.nota) {
    y += 20;
    ctx.font = `600 40px ${corpo}`;
    for (const l of linhas(ctx, j.nota, 760)) {
      ctx.fillText(l, 0, y);
      y += 52;
    }
  }
  if (j.classificados.length > 0) {
    y += 40;
    ctx.fillRect(-400, y, 800, 4);
    y += 56;
    ctx.textAlign = 'left';
    ctx.font = `900 34px ${display}`;
    ctx.fillText('CLASSIFICADOS', -400, y);
    y += 50;
    ctx.font = `500 32px ${corpo}`;
    for (const cl of j.classificados) {
      for (const l of linhas(ctx, cl, 800)) {
        ctx.fillText(l, -400, y);
        y += 42;
      }
      y += 12;
    }
  }
  ctx.restore();
  ctx.fillStyle = '#ffd9a0';
  ctx.textAlign = 'center';
  ctx.font = `700 34px ${corpo}`;
  ctx.fillText('fazquantas.pages.dev', 540, 1320);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

/** Compartilha a imagem do jornal; onde o celular não compartilha arquivo, baixa. */
export async function mandarJornal(j: Jornal): Promise<'mandou' | 'baixou' | 'falhou'> {
  const blob = await imagemDoJornal(j);
  if (!blob) return 'falhou';
  const file = new File([blob], 'jornal-do-bolicho.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Jornal do Bolicho', text: j.manchete });
      return 'mandou';
    }
  } catch (e) {
    // Desistiu de compartilhar: não é erro.
    if (e instanceof DOMException && e.name === 'AbortError') return 'mandou';
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jornal-do-bolicho.png';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'baixou';
  } catch {
    return 'falhou';
  }
}
