import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: 'http://backend:3001', changeOrigin: true },
      '/ws':  { target: 'ws://backend:3001',  ws: true },
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
