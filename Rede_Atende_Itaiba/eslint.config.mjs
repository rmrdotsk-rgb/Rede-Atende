import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

// Babel parses TypeScript syntax; tsc remains responsible for types and unused names.
// typescript-eslint 8 does not support this project's TypeScript 7 peer range.
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.local/**',
      'docs/**',
      'test-results/**',
      'playwright-report/**',
      'historico/**',
    ],
  },
  {
    files: ['**/*.{js,mjs}'],
    ...js.configs.recommended,
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { parserOpts: { plugins: ['typescript', 'jsx'] } },
      },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { 'react-hooks': hooks, 'jsx-a11y': a11y },
    rules: {
      'no-debugger': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'constructor-super': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      ...a11y.configs.recommended.rules,
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'region'] }],
    },
  },
  {
    files: ['**/*.{ts,mts}'],
    languageOptions: {
      parserOptions: { babelOptions: { parserOpts: { plugins: ['typescript'] } } },
    },
  },
];
