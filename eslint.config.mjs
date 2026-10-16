import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['node_modules', '.next', 'coverage', 'test-results', 'playwright-report', 'spikes', 'next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // D2: Arwes may only be imported inside src/ui/arwes.
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@arwes/*'], message: 'Import Arwes only inside src/ui/arwes (decision D2).' }] },
      ],
    },
  },
  {
    files: ['src/ui/arwes/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },
  { files: ['**/*.{mjs,cjs,js}'], languageOptions: { globals: globals.node } },
);
