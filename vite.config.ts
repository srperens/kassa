import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // In dev we proxy API calls to the Fastify server.
      '/api': 'http://localhost:3000',
    },
  },
});
