/**
 * A foto do vexame (caderno de zoeira): como a foto da montanha-russa, o jogo congela a cara de quem
 * acabou de sair do jogo (ou perdeu dois palitos de uma vez), se a câmera dele estava aberta. A foto é
 * tirada em cada aparelho, do vídeo que já chega nele, e fica só na memória da mesa: só sai dali se
 * alguém mandar o Jornal do Bolicho para o grupo.
 */

/** Lado da foto quadrada (px): pequena, é para rir, não para guardar. */
const LADO = 240;

/** Um quadro do vídeo, recortado em quadrado no meio, em JPEG (data URL). `null` se não deu. */
export async function fotografar(stream: MediaStream | null | undefined, espelho = false): Promise<string | null> {
  if (!stream || typeof document === 'undefined' || !stream.getVideoTracks().some((t) => t.readyState === 'live')) return null;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('vídeo'));
        void video.play().catch(() => undefined);
      }),
      new Promise<void>((_, reject) => window.setTimeout(() => reject(new Error('demorou')), 1500)),
    ]);
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const lado = Math.min(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = LADO;
    canvas.height = LADO;
    const g = canvas.getContext('2d');
    if (!g) return null;
    if (espelho) {
      g.translate(LADO, 0);
      g.scale(-1, 1);
    }
    g.drawImage(video, (w - lado) / 2, (h - lado) / 2, lado, lado, 0, 0, LADO, LADO);
    return canvas.toDataURL('image/jpeg', 0.78);
  } catch {
    return null;
  } finally {
    video.pause();
    video.srcObject = null;
  }
}
