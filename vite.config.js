import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/race': { target: 'ws://127.0.0.1:2567', ws: true } } },
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
});
