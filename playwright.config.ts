import { defineConfig, devices } from '@playwright/test';

/**
 * E2E: sobe o web (Vite) e o servidor (Worker no wrangler dev). Rodar com `pnpm e2e`.
 * O servidor sobe com tempos curtos (RAPIDO=1) para as partidas online terminarem rápido.
 * `E2E_BASE=https://fazquantas.pages.dev` roda os mesmos testes contra a produção, sem subir nada.
 */
const base = process.env.E2E_BASE;

export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: base ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] }, testIgnore: /admin-massa/ },
    // A manutenção barra sala nova para todo mundo: o admin em massa roda sozinho, depois dos outros.
    // Só ele: `pnpm exec playwright test --project admin --no-deps`.
    { name: 'admin', use: { ...devices['Pixel 7'] }, testMatch: /admin-massa/, dependencies: ['celular'] },
  ],
  webServer: base ? [] : [
    {
      command: 'pnpm --filter @fodinha/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // O servidor de verdade (Worker + Durable Objects) rodando local, com pausas curtas.
      command: 'pnpm --filter @fodinha/worker exec wrangler dev --port 8787 --ip 0.0.0.0 --var RAPIDO:1 --var ADMIN_SENHA:senha-do-teste-e2e',
      url: 'http://localhost:8787/api/saude',
      reuseExistingServer: true,
      timeout: 90_000,
    },
  ],
});
