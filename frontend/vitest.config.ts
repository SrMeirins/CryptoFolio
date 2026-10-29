import { defineConfig } from 'vitest/config'
import { appVersionDefine } from './appVersion'

// Solo funciones puras de momento (sin testing-library ni jsdom) — cubre la
// lógica de cálculo del frontend (ej. fiscal/helpers.tsx) sin necesitar
// renderizar componentes React.
export default defineConfig({
  // La misma versión que la build (#444).
  define: appVersionDefine,
  test: {
    environment: 'node',
    // e2e/ son pruebas de Playwright (npm run test:e2e), no de vitest.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    // Vitest entrega los .css vacíos por defecto; el test de contraste de la
    // paleta (#198) necesita leer index.css tal cual.
    css: { include: [/index\.css/] },
  },
})
