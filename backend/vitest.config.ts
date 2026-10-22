import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // dist/ son artefactos de build (no volver a ejecutar tests compilados).
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    // Ningún test sale a internet (#359): ver src/test/blockExternalNetwork.ts.
    setupFiles: ['./src/test/blockExternalNetwork.ts'],
  },
});
