import { defineConfig } from 'vitest/config'

// Entorno 'node' (no jsdom): el proceso main de Electron es Node puro, y los
// módulos testeables (secrets-manager.ts) están diseñados para no depender
// del runtime real de Electron (reciben rutas por parámetro en vez de llamar
// a app.getPath() internamente) — mismo criterio que backend/frontend.
export default defineConfig({
  test: {
    environment: 'node',
  },
})
