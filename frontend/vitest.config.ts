import { defineConfig } from 'vitest/config'

// Solo funciones puras de momento (sin testing-library ni jsdom) — cubre la
// lógica de cálculo del frontend (ej. fiscal/helpers.tsx) sin necesitar
// renderizar componentes React.
export default defineConfig({
  test: {
    environment: 'node',
  },
})
