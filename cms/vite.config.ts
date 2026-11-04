import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// The React admin lives in client/; the API (and the built admin) is served by Fastify on PORT (default 3000).
const api = process.env.CMS_DEV_API || 'http://localhost:3000';

export default defineConfig({
  root: fileURLToPath(new URL('./client', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./client/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: { outDir: fileURLToPath(new URL('./dist/client', import.meta.url)), emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': api, '/media': api, '/preview': api, '/fonts': api },
  },
});
