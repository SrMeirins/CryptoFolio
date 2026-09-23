import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // dist/ son artefactos de build (no volver a ejecutar tests compilados).
    // parser.test.ts NO es un test real todavía — es un script de debug manual
    // que requiere TEST_CSV_PATH y no usa describe/it (deuda técnica ya
    // catalogada aparte, ver AUDITORIA_TRACKING.md — fuera del alcance de este fix).
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/modules/csv/parser.test.ts',
    ],
  },
});
