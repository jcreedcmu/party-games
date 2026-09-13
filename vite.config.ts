import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_URL ?? '/',
  root: 'client',
  server: {
    proxy: {
      '/ws': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    sourcemap: true,
  },
});
