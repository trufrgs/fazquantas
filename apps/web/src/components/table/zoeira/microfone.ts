import { useEffect, useRef } from 'react';
import { midia } from '../../../lib/midia';

/**
 * A mesa ouvindo os microfones abertos (só o volume, nada é gravado nem sai do aparelho):
 *
 * - `useSopro`: de microfone aberto, soprar o celular abre a fumaça por um instante (só na tua tela);
 * - `useAbano`: abanar com o dedo (um arrasto rápido em qualquer lugar) faz o mesmo;
 * - `useGargalhada`: logo depois de uma mão fechar, dois ou mais microfones saltando juntos é a mesa
 *   caindo na gargalhada: a mão vira "lance da noite".
 *
 * Sopro e risada contam pelo salto sobre o barulho de fundo de cada um (a TV ligada ou o bar de
 * verdade não disparam nada). As contas puras são as classes `Detector…` (testadas).
 */

/** Volume (RMS de 0 a 1) do sopro: bem acima da fala, e `salto` vezes acima do fundo. */
export const SOPRO = { volume: 0.16, salto: 3, medidas: 3, descansoMs: 2500 } as const;
/** Risada: volume e salto sobre o fundo, quantas medidas de cada um, e quantos rindo juntos. */
export const GARGALHADA = { volume: 0.09, salto: 2.5, medidas: 4, gente: 2, janelaMs: 2600 } as const;
/** Um arrasto deste tamanho (px da tela) em tão pouco tempo é abano. */
export const ABANO = { px: 110, ms: 160, descansoMs: 1200 } as const;

/** A média do volume de fundo (umas oito medidas por segundo: uns dois segundos e meio de memória). */
const media = (antes: number | undefined, volume: number) => (antes === undefined ? volume : antes * 0.95 + volume * 0.05);
/** Medidas de aquecimento: antes delas, o fundo ainda não é conhecido e nada dispara. */
const AQUECE = 8;

/** O sopro de uma pessoa: `SOPRO.medidas` medidas seguidas bem acima do fundo dela. */
export class DetectorDeSopro {
  private seguidas = 0;
  private livreEm = 0;
  private fundo: number | undefined;
  private medidas = 0;

  /** Uma medida do teu microfone; `true` quando é sopro. */
  medir(volume: number, aberto: boolean, agora: number): boolean {
    if (this.medidas++ < AQUECE) {
      this.fundo = media(this.fundo, volume);
      return false;
    }
    const alto = aberto && volume > Math.max(SOPRO.volume, (this.fundo ?? 0) * SOPRO.salto);
    this.seguidas = alto ? this.seguidas + 1 : 0;
    if (!alto) this.fundo = media(this.fundo, volume);
    if (this.seguidas < SOPRO.medidas || agora < this.livreEm) return false;
    this.seguidas = 0;
    this.livreEm = agora + SOPRO.descansoMs;
    return true;
  }
}

/** A gargalhada da mesa: depois de `abrir` (a mão fechou), gente saltando junta sobre o próprio fundo. */
export class DetectorDeGargalhada {
  private fundo = new Map<string, number>();
  private medidas = new Map<string, number>();
  /** Quem já tem fundo conhecido (passou do aquecimento). */
  private aquecidos = new Set<string>();
  private janela: { desde: number; base: Map<string, number>; altos: Map<string, number>; riu: boolean } | null = null;

  /** A mão fechou (`null`: saiu do fim de mão). */
  abrir(agora: number | null): void {
    const base = new Map([...this.fundo].filter(([id]) => this.aquecidos.has(id)));
    this.janela = agora === null ? null : { desde: agora, base, altos: new Map(), riu: false };
  }

  /** Uma medida de alguém; `true` na hora em que a mesa caiu na gargalhada (uma vez por mão). */
  medir(id: string, volume: number, aberto: boolean, agora: number): boolean {
    const j = this.janela;
    if (j && agora - j.desde <= GARGALHADA.janelaMs) {
      // Na janela, o fundo não muda (senão a própria risada vira o fundo).
      if (j.riu) return false;
      // Quem não tinha fundo conhecido antes da mão (microfone recém-aberto) não conta.
      const base = j.base.get(id);
      if (base === undefined) return false;
      if (aberto && volume > Math.max(GARGALHADA.volume, base * GARGALHADA.salto)) j.altos.set(id, (j.altos.get(id) ?? 0) + 1);
      if ([...j.altos.values()].filter((n) => n >= GARGALHADA.medidas).length < GARGALHADA.gente) return false;
      j.riu = true;
      return true;
    }
    const n = (this.medidas.get(id) ?? 0) + 1;
    this.medidas.set(id, n);
    this.fundo.set(id, media(this.fundo.get(id), volume));
    if (n === AQUECE) this.aquecidos.add(id);
    return false;
  }
}

export function useSopro(ativo: boolean, eu: string | null, aoSoprar: () => void): void {
  const fn = useRef(aoSoprar);
  useEffect(() => {
    fn.current = aoSoprar;
  }, [aoSoprar]);
  useEffect(() => {
    if (!ativo || !eu) return undefined;
    const d = new DetectorDeSopro();
    return midia.aoVolume((id, volume, aberto) => {
      if (id === eu && d.medir(volume, aberto, Date.now())) fn.current();
    });
  }, [ativo, eu]);
}

export function useAbano(ativo: boolean, aoAbanar: () => void): void {
  const fn = useRef(aoAbanar);
  useEffect(() => {
    fn.current = aoAbanar;
  }, [aoAbanar]);
  useEffect(() => {
    if (!ativo) return undefined;
    let rastro: { x: number; y: number; t: number }[] = [];
    let livreEm = 0;
    const mexeu = (e: PointerEvent) => {
      // Só arrasto (dedo na tela, ou botão do mouse apertado): passar o mouse por cima não abana.
      if (e.pointerType !== 'touch' && (e.buttons & 1) === 0) {
        rastro = [];
        return;
      }
      const t = e.timeStamp;
      rastro = [...rastro.filter((p) => t - p.t <= ABANO.ms), { x: e.clientX, y: e.clientY, t }];
      const a = rastro[0]!;
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) >= ABANO.px && Date.now() >= livreEm) {
        livreEm = Date.now() + ABANO.descansoMs;
        rastro = [];
        fn.current();
      }
    };
    window.addEventListener('pointermove', mexeu, { passive: true });
    return () => window.removeEventListener('pointermove', mexeu);
  }, [ativo]);
}

/**
 * `maoFechada`: a mão que acabou de fechar (`chaveDaMao`; `null` fora do fim de mão). Nos
 * `GARGALHADA.janelaMs` seguintes, gente saltando junta chama `aoRir` (uma vez por mão).
 */
export function useGargalhada(ativo: boolean, maoFechada: string | null, aoRir: () => void): void {
  const fn = useRef(aoRir);
  useEffect(() => {
    fn.current = aoRir;
  }, [aoRir]);
  const detector = useRef<DetectorDeGargalhada | null>(null);
  useEffect(() => {
    if (!ativo) return undefined;
    const d = new DetectorDeGargalhada();
    detector.current = d;
    const sair = midia.aoVolume((id, volume, aberto) => {
      if (d.medir(id, volume, aberto, Date.now())) fn.current();
    });
    return () => {
      sair();
      detector.current = null;
    };
  }, [ativo]);
  useEffect(() => {
    detector.current?.abrir(maoFechada === null ? null : Date.now());
  }, [maoFechada]);
}
