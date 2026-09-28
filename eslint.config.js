import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/web/android/**',
      'apps/web/ios/**',
      'apps/web/dev-dist/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      'apps/worker/worker-configuration.d.ts',
      'apps/worker/.wrangler/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['apps/server/**/*.ts', 'scripts/**/*.{js,mjs}', 'e2e/**/*.ts', '*.config.{js,ts}', '**/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // Scripts do Playwright também rodam trechos dentro do navegador.
    files: ['scripts/**/*.{js,mjs}', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
