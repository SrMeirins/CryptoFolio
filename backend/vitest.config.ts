import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // dist/ son artefactos de build (no volver a ejecutar tests compilados).
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
});
