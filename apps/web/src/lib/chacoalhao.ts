import { useEffect, useRef } from 'react';

/** Aceleração (m/s², sem a gravidade) que conta como um sacudão, e quantos seguidos viram chacoalhão. */
const FORTE = 22;
const SACUDOES = 3;
const JANELA_MS = 900;

type ComPermissao = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * No iPhone o sensor de movimento pede permissão, e só dentro de um toque. Chamar no toque de "Virar
 * a mesa": dali em diante, chacoalhar o celular também vira. No Android não precisa.
 */
export function pedirSensor(): void {
  const D = (globalThis as { DeviceMotionEvent?: ComPermissao }).DeviceMotionEvent;
  if (typeof D?.requestPermission === 'function') void D.requestPermission().catch(() => undefined);
}

/**
 * Chacoalhar o celular (perdeu palito e ficou brabo) vira a mesa (caderno de zoeira, 02/10/2026).
 * `ativo` falso desliga (menu aberto, fim de jogo).
 */
export function useChacoalhao(ativo: boolean, aoChacoalhar: () => void): void {
  const fn = useRef(aoChacoalhar);
  useEffect(() => {
    fn.current = aoChacoalhar;
  }, [aoChacoalhar]);
  useEffect(() => {
    if (!ativo || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return undefined;
    let batidas: number[] = [];
    const ouvir = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      if (!a) return;
      const forca = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      if (forca < FORTE) return;
      const agora = Date.now();
      batidas = [...batidas.filter((t) => agora - t < JANELA_MS), agora];
      if (batidas.length >= SACUDOES) {
        batidas = [];
        fn.current();
      }
    };
    window.addEventListener('devicemotion', ouvir);
    return () => window.removeEventListener('devicemotion', ouvir);
  }, [ativo]);
}
