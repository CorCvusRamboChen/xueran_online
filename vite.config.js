import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前端在 client/，打包到 client/dist，由后端（src/server）一起托管
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: { '/api': { target: 'http://localhost:3001', ws: true } },
  },
});
