// Harness de QA exploratório do Faz quantas? (Playwright, headless). Ver README.md desta pasta.
import { mkdirSync } from 'node:fs';
import { chromium, devices, webkit, firefox } from '@playwright/test';

export const BASE = process.env.BASE ?? 'http://localhost:5173';
export const OUT = process.env.OUT ?? new URL('../../test-results/exploratorio/', import.meta.url).pathname;

mkdirSync(OUT, { recursive: true });

const engines = { chromium, webkit, firefox };
const browsers = {};
export async function browser(engine = 'chromium') {
  browsers[engine] ??= await engines[engine].launch();
  return browsers[engine];
}
export async function closeAll() {
  for (const b of Object.values(browsers)) await b.close().catch(() => {});
}

export const findings = [];
export function flag(scenario, msg, extra) {
  const line = `[${scenario}] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ''}`;
  findings.push(line);
  console.log('⚠️ ', line);
}
export function log(scenario, msg) {
  console.log(`   [${scenario}] ${msg}`);
}

export function key() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
}

/**
 * Um aparelho: contexto isolado (como uma janela anônima). `name: null` = sem nada salvo (primeira
 * visita de verdade, com tutorial). Registra erros, WebSockets abertos e mensagens de fechamento.
 */
export async function device(label, { name = label, engine = 'chromium', dev = 'Pixel 7', viewport, settings = {}, preset = true } = {}) {
  const b = await browser(engine);
  const d = engine === 'firefox' ? { ...devices['Desktop Firefox'], viewport: viewport ?? { width: 412, height: 860 } } : { ...devices[dev], ...(viewport ? { viewport } : {}) };
  const ctx = await b.newContext(d);
  const page = await ctx.newPage();
  const errors = [];
  const sockets = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('websocket', (ws) => {
    const rec = { url: ws.url(), opened: Date.now(), closed: null };
    sockets.push(rec);
    ws.on('close', () => (rec.closed = Date.now()));
  });
  if (preset && name !== null) {
    const state = { name, avatar: 'g-cuia', sound: false, haptics: false, speed: 'turbo', seenTutorial: true, profileKey: key(), ...settings };
    await page.addInitScript((v) => {
      if (!window.localStorage.getItem('fodinha:ajustes')) window.localStorage.setItem('fodinha:ajustes', JSON.stringify({ state: v, version: 1 }));
    }, state);
  }
  // Rede simulada no WebSocket da sala: 'ok', 'offline' (fecha na hora e recusa novas), 'drop' (morta em
  // silêncio: nada passa, nada fecha), 'buraco' (drop + conexões novas ficam penduradas) e atraso em ms.
  const rede = { modo: 'ok', atraso: 0, vivas: new Set(), conexoes: 0, quadros: [] };
  const fechar = (lado, code, reason) => {
    try {
      lado.close({ code: code === 1005 || code === 1006 || !code ? 4998 : code, reason: reason ?? '' });
    } catch {
      // já fechado
    }
  };
  const mandar = (para, m) => {
    try {
      para.send(m);
    } catch {
      // o outro lado fechou
    }
  };
  await ctx.routeWebSocket(/\/api\/salas\//, (ws) => {
    rede.conexoes += 1;
    if (rede.modo === 'offline') return fechar(ws, 4998, 'offline');
    if (rede.modo === 'buraco') return; // fica pendurada: nem abre, nem fecha
    const server = ws.connectToServer();
    const c = { ws, server };
    rede.vivas.add(c);
    const passa = (para) => (m) => {
      if (rede.modo === 'drop' || rede.modo === 'buraco') return;
      if (rede.atraso) setTimeout(() => mandar(para, m), rede.atraso);
      else mandar(para, m);
    };
    ws.onMessage((m) => {
      rede.quadros.push({ t: Date.now(), de: 'pagina', m: String(m).slice(0, 50), modo: rede.modo });
      passa(server)(m);
    });
    server.onMessage(passa(ws));
    // Conexão morta em silêncio: o fechamento que a página manda também não chega ao servidor
    // (como um TCP morto); o servidor segue achando que ela está lá, só que muda.
    ws.onClose((code, reason) => {
      rede.vivas.delete(c);
      if (rede.modo === 'drop' || rede.modo === 'buraco') return;
      fechar(server, code, reason);
    });
    server.onClose((code, reason) => { rede.vivas.delete(c); fechar(ws, code, reason); });
  });
  let cdp = null;
  const api = {
    rede,
    /** Modo avião: fecha as conexões da sala e recusa novas (e a rede HTTP também cai). */
    async aviao(on) {
      rede.modo = on ? 'offline' : 'ok';
      if (on) for (const c of [...rede.vivas]) { fechar(c.ws, 4998, 'offline'); fechar(c.server, 1000, 'offline'); rede.vivas.delete(c); }
      await ctx.setOffline(on);
    },
    /** Conexão morta em silêncio (túnel, troca de rede): nada passa e nada fecha. */
    morta(on, { buraco = false } = {}) {
      rede.modo = on ? (buraco ? 'buraco' : 'drop') : 'ok';
    },
    label,
    ctx,
    page,
    errors,
    sockets,
    async net(cond) {
      if (engine !== 'chromium') throw new Error('rede emulada só no chromium');
      cdp ??= await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, ...cond });
    },
    async offline(on) {
      await ctx.setOffline(on);
    },
    openSockets() {
      return sockets.filter((s) => s.closed === null).length;
    },
    async screen() {
      return screenOf(api.page);
    },
    async shot(file) {
      await api.page.screenshot({ path: `${OUT}/${file}.png` }).catch(() => {});
    },
    async close() {
      await ctx.close().catch(() => {});
    },
  };
  return api;
}

/** Em que tela a pessoa está. */
export async function screenOf(page) {
  const vis = (loc) => loc.isVisible().catch(() => false);
  if (await vis(page.getByText('Reconectando…'))) return 'reconectando';
  if (await vis(page.getByRole('dialog', { name: 'Fim de jogo' }))) return 'fim';
  if (await vis(page.getByText(/^Rodada \d+/).first())) return 'jogo';
  if (await vis(page.getByText(/Na mesa \(\d\/8\)/))) return 'lobby';
  if (await vis(page.getByRole('button', { name: 'Criar sala' }))) return 'online';
  if (await vis(page.getByRole('button', { name: 'Jogar com a gurizada' }))) return 'inicio';
  return 'outra';
}

export async function alertText(page) {
  const a = page.getByRole('alert').first();
  return (await a.isVisible().catch(() => false)) ? ((await a.textContent()) ?? '').trim() : null;
}

export async function openOnline(page) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
}

export async function createRoom(page, { password } = {}) {
  await openOnline(page);
  await page.getByRole('button', { name: 'Criar sala' }).click();
  const label = await page.locator('div[aria-label^="Código "]').getAttribute('aria-label', { timeout: 15000 });
  const code = label.replace('Código ', '').replace(/ /g, '');
  if (password) {
    // A senha fica nos ajustes da sala, no lobby.
    await setRoomPassword(page, password);
  }
  return code;
}

export async function setRoomPassword(page, password) {
  await page.getByRole('switch', { name: /Sala com senha/ }).click();
  await page.getByLabel('Nova senha da sala').fill(password);
  await page.getByRole('button', { name: 'Salvar' }).click();
}

export async function joinByLink(page, code) {
  await page.goto(`${BASE}/?sala=${code}`);
}

export async function startGame(page) {
  await page.getByRole('button', { name: 'Começar partida' }).click();
}

/** Quem estiver na vez canta ou joga (uma ação). Devolve o rótulo de quem agiu. */
export async function actOnce(devs) {
  for (const d of devs) {
    const p = d.page;
    const bid = p.locator('section[aria-label="Teu palpite"] button[aria-label^="Palpite"]:not([disabled])').first();
    if (await bid.isVisible().catch(() => false)) {
      await bid.click({ timeout: 2000 }).catch(() => {});
      return `${d.label}:cantou`;
    }
    const card = p.locator('[aria-label="Tuas cartas"] button:not([disabled])').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click({ timeout: 2000 }).catch(() => {});
      await card.click({ timeout: 2000 }).catch(() => {});
      return `${d.label}:jogou`;
    }
    const cont = p.getByRole('button', { name: 'Continuar' });
    if (await cont.isVisible().catch(() => false)) {
      await cont.click({ timeout: 2000 }).catch(() => {});
      return `${d.label}:continuou`;
    }
  }
  return null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Observa as telas por um tempo e registra mudanças (quem caiu para o início, quem ficou reconectando). */
export async function watch(scenario, devs, ms, { act = false, expect = null } = {}) {
  const until = Date.now() + ms;
  const last = new Map();
  const counts = new Map();
  while (Date.now() < until) {
    for (const d of devs) {
      const s = await d.screen();
      if (last.get(d.label) !== s) {
        log(scenario, `${d.label}: ${last.get(d.label) ?? '—'} → ${s}`);
        last.set(d.label, s);
      }
      counts.set(`${d.label}:${s}`, (counts.get(`${d.label}:${s}`) ?? 0) + 1);
      if (expect && !expect.includes(s)) flag(scenario, `${d.label} em tela inesperada: ${s}`, { alerta: await alertText(d.page) });
    }
    if (act) await actOnce(devs);
    await sleep(400);
  }
  return { last, counts };
}

export function report() {
  console.log('\n=== ACHADOS ===');
  if (!findings.length) console.log('(nenhum)');
  for (const f of findings) console.log(f);
}
