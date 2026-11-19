import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El servidor Fastify escucha en 8787; /api se reenvia ahi (incluido el flujo SSE).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        configure: (proxy) => {
          // Evita que intermediarios acumulen el flujo de eventos.
          proxy.on('proxyRes', (proxyRes) => {
            const type = proxyRes.headers['content-type'];
            if (typeof type === 'string' && type.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
  build: { outDir: 'dist' },
});
