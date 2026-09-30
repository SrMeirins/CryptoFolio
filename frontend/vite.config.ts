import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 'backend' resuelve por DNS de Docker Compose dentro de la red del stack de
// dev (docker-compose.dev.yml) — solo funciona corriendo `vite` DENTRO de
// ese contenedor (el flujo real: `make dev`), no invocando `vite`/`npm run
// dev` directo en el host. Si algún día se necesita correr fuera de Docker
// (p. ej. para probar el modo dev de Electron, que carga localhost:5173),
// hace falta otro mecanismo (variable de entorno, host.docker.internal...).
const BACKEND_HOST = 'backend:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // timeout/proxyTimeout a 0: el import de CSV responde con un stream SSE que puede
      // durar varios minutos (precios históricos con backoff de CoinGecko). Sin esto, el
      // http-proxy del dev corta la conexión por inactividad y el frontend lo pinta como
      // "Error de conexión" aunque el backend siga procesando.
      '/api': { target: `http://${BACKEND_HOST}`, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
      '/ws':  { target: `ws://${BACKEND_HOST}`,  ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) return 'vendor-react';
          if (id.includes('node_modules/@tanstack')) return 'vendor-query';
          if (id.includes('node_modules/recharts'))  return 'vendor-charts';
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/date-fns')) return 'vendor-ui';
        },
      },
    },
  },
})
