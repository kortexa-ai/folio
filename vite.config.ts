import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { target: 'es2022' },
  worker: { format: 'es' },
  define: { __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(0, 16)) }
});
