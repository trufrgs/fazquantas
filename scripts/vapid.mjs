#!/usr/bin/env node
// Gera um par de chaves VAPID (Web Push, P-256) para o teu servidor.
//
//   node scripts/vapid.mjs --repo dono/repositorio
//     grava a privada como segredo VAPID_PRIVADO no GitHub (pelo gh, sem aparecer na tela) e
//     mostra a pública, que vai em apps/worker/wrangler.jsonc (VAPID_PUBLICO).
//
//   node scripts/vapid.mjs
//     mostra as duas (para testar local). Não cole a privada em lugar nenhum público.
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const par = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await webcrypto.subtle.exportKey('jwk', par.privateKey);
const publica = b64url(new Uint8Array(await webcrypto.subtle.exportKey('raw', par.publicKey)));
const privada = jwk.d;

const i = process.argv.indexOf('--repo');
const repo = i > 0 ? process.argv[i + 1] : null;
if (repo) {
  const r = spawnSync('gh', ['secret', 'set', 'VAPID_PRIVADO', '-R', repo], { input: privada, stdio: ['pipe', 'inherit', 'inherit'] });
  if (r.status !== 0) {
    console.error('Não deu para gravar o segredo (o gh está instalado e com login?). Nada foi mudado.');
    process.exit(1);
  }
  console.log(`VAPID_PRIVADO gravado em ${repo}.`);
  console.log(`VAPID_PUBLICO (cola no apps/worker/wrangler.jsonc): ${publica}`);
} else {
  console.log(`VAPID_PUBLICO: ${publica}`);
  console.log(`VAPID_PRIVADO: ${privada}`);
  console.log('A privada é segredo: no GitHub, use --repo dono/repositorio para gravar direto.');
}
