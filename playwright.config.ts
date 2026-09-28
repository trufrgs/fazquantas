import { defineConfig, devices } from '@playwright/test';

/**
 * E2E: sobe o web (Vite) e o servidor multiplayer. Rodar com `pnpm e2e`.
 * O servidor sobe com tempos curtos (FODINHA_FAST=1) para as partidas online terminarem rápido.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @fodinha/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @fodinha/server dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 60_000,
      env: { FODINHA_FAST: '1' },
    },
  ],
});
