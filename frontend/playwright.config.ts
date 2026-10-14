import { defineConfig, devices } from '@playwright/test'

// Prueba de humo de consola (#201): abre cada vista contra un backend real con
// datos sintéticos y falla ante cualquier error o aviso en la consola del
// navegador. Usa el servidor de desarrollo de Vite y no el build: en
// producción React no emite sus avisos (p. ej. claves repetidas en listas). El backend lo arranca el workflow de CI
// (o se apunta a uno con BACKEND_PROXY_HOST).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
