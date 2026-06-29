import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api to the Node backend on :4100 so the browser stays
// same-origin (no CORS). In production the backend serves the built dist/.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      '/api': {
        target: 'http://localhost:4100',
        changeOrigin: true
      }
    }
  },
  build: { outDir: 'dist' }
});
