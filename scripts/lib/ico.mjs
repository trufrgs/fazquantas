// Monta um .ico com PNGs dentro (formato aceito por todos os navegadores desde o IE Vista).
import { readFileSync, writeFileSync } from 'node:fs';

/** `pngs`: caminhos de PNGs quadrados de até 256 px. */
export function writeIco(out, pngs) {
  const imgs = pngs.map((p) => {
    const buf = readFileSync(p);
    return { buf, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  });
  const header = Buffer.alloc(6 + 16 * imgs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(imgs.length, 4);
  let offset = header.length;
  imgs.forEach((img, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(img.w >= 256 ? 0 : img.w, e);
    header.writeUInt8(img.h >= 256 ? 0 : img.h, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(img.buf.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += img.buf.length;
  });
  writeFileSync(out, Buffer.concat([header, ...imgs.map((i) => i.buf)]));
}
