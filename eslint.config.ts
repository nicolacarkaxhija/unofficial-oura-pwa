import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.changeset', 'tests/fixtures/oura_export.zip'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Warn when exporting non-components from .tsx files (HMR requirement)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // `any` is forbidden — use `unknown` and narrow with Zod or type guards
      '@typescript-eslint/no-explicit-any': 'error',
      // Consistent type-only imports signal to bundlers what to tree-shake
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // Prefer `unknown` over `any` in catch clauses
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
      // Floating promises in event handlers or useEffect are a common bug source
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
)
