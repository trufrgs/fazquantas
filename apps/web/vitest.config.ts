import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], maxWorkers: 3, environment: 'node' },
});
