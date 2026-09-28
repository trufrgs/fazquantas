import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // O engine é consumido como TypeScript do workspace: precisa entrar no bundle.
  noExternal: ['@fodinha/engine'],
});
