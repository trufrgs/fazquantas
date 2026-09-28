import { readFileSync } from 'node:fs';

/** Largura e altura de um PNG (lê o cabeçalho IHDR). */
export function imageSize(file) {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
