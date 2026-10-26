import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  { ignores: ['**/node_modules/**', 'frontend/.next/**', 'frontend/out/**', 'packages/**'] },
  js.configs.recommended,
  {
    files: ['backend/**/*.js', 'scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node }
  },
  {
    files: ['frontend/**/*.{js,mjs}'],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node }
    },
    settings: { react: { version: '19' } },
    rules: { ...react.configs.recommended.rules, ...react.configs['jsx-runtime'].rules, 'react/prop-types': 'off' }
  },
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
    }
  }
];
