import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Preset completo de react-hooks v7 (incluye las reglas del React Compiler).
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
      // #495: el title nativo no llega con teclado ni al tocar. Las explicaciones
      // van en el Tooltip común (components/ui/Tooltip.tsx) o en texto visible.
      'no-restricted-syntax': ['error', {
        selector: "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']",
        message: 'Sin title nativo (#495): usa el Tooltip común o texto visible, y aria-label si es un icono.',
      }],
    },
  },
);
