import { describe, expect, it } from 'vitest';
import { adpcmCodifica, adpcmDecodifica, codificaVoz, decodificaVoz, preparaVoz, VOZ, VOZ_MAX_B64, vozValida } from './voz';

/** Um "Cagão!" de mentira: um tom que sobe e desce de volume, com silêncio antes e depois. */
function falaDeMentira(taxa: number, segundos: number, silencio = 0.3): Float32Array {
  const n = Math.floor(taxa * (segundos + silencio * 2));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / taxa - silencio;
    if (t < 0 || t > segundos) continue;
    out[i] = 0.3 * Math.sin(2 * Math.PI * 220 * t) * Math.sin((Math.PI * t) / segundos);
  }
  return out;
}

describe('a frase na tua voz', () => {
  it('ADPCM: o que sai parece o que entrou (relação sinal-ruído boa)', () => {
    const fala = falaDeMentira(VOZ.taxa, 1, 0);
    const volta = adpcmDecodifica(adpcmCodifica(fala));
    let sinal = 0;
    let ruido = 0;
    for (let i = 0; i < fala.length; i++) {
      sinal += fala[i]! ** 2;
      ruido += (fala[i]! - volta[i]!) ** 2;
    }
    expect(10 * Math.log10(sinal / ruido)).toBeGreaterThan(18);
    expect(adpcmCodifica(fala).length).toBe(Math.ceil(fala.length / 2));
  });

  it('prepara: desce a taxa, corta o silêncio, limita a dois segundos e sobe o volume', () => {
    const longa = preparaVoz(falaDeMentira(48000, 3), 48000)!;
    expect(longa.length).toBeLessThanOrEqual(VOZ.taxa * VOZ.maxS);
    const curta = preparaVoz(falaDeMentira(44100, 0.8), 44100)!;
    expect(curta.length).toBeGreaterThan(VOZ.taxa * 0.6);
    expect(curta.length).toBeLessThan(VOZ.taxa * 1.1);
    expect(Math.max(...curta.map(Math.abs))).toBeGreaterThan(0.85);
    expect(preparaVoz(new Float32Array(48000), 48000)).toBeNull();
  });

  it('a gravação de dois segundos cabe numa mensagem da sala, e o que vier estragado não toca', () => {
    const b64 = codificaVoz(preparaVoz(falaDeMentira(48000, 3), 48000)!);
    expect(b64.length).toBeLessThanOrEqual(VOZ_MAX_B64);
    expect(VOZ_MAX_B64 + 200).toBeLessThan(16 * 1024);
    expect(vozValida(b64)).toBe(true);
    expect(decodificaVoz(b64).length).toBeGreaterThan(0);
    expect(vozValida('nao é base64!')).toBe(false);
    expect(vozValida('A'.repeat(VOZ_MAX_B64 + 4))).toBe(false);
    expect(vozValida(42)).toBe(false);
  });
});
