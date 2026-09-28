import { useSyncExternalStore } from 'react';

/**
 * Escala da interface: 1 no celular em pé (o desenho de referência) e até 1,4 em tablet e
 * desktop, que têm tela de sobra e ficam mais longe do olho. Pesa a altura (a mesa empilha barra,
 * assentos, cartas e mão) e a largura, e nunca encolhe abaixo do celular.
 */
export function uiScale(width: number, height: number): number {
  const s = Math.min(width * 0.041, height * 0.025) / 16;
  return Math.round(Math.min(1.4, Math.max(1, s)) * 100) / 100;
}

let current = 1;
const listeners = new Set<() => void>();

/** Aplica a escala no `html` (o `rem` de todo o app acompanha) e avisa quem usa `useUiScale`. */
function apply() {
  const next = uiScale(window.innerWidth, window.innerHeight);
  document.documentElement.style.fontSize = `${16 * next}px`;
  document.documentElement.style.setProperty('--ui', String(next));
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

/** Liga a escala (antes do primeiro render) e acompanha redimensionar e girar a tela. */
export function startUiScale(): void {
  apply();
  window.addEventListener('resize', apply);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A escala atual, para medidas calculadas em px (cartas, assentos, geometria da mesa). */
export function useUiScale(): number {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => 1,
  );
}

/** `n` px da escala 1 em `rem` (acompanha a escala sem precisar do hook). */
export function rem(px: number): string {
  return `${px / 16}rem`;
}
