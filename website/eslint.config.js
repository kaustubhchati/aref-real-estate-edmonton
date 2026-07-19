import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // The app entry mounts the tree once (createRoot) and is never hot-reloaded
  // itself, so react-refresh's "only export components" rule does not apply to it.
  // main.jsx legitimately declares the code-split route consts inline —
  // `const X = lazy(() => import(...))` — right next to the <Route>s that use them
  // (kept flat on purpose; see the file header). Turn the rule off for the entry only.
  {
    files: ['src/main.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
