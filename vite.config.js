import path from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);
const i18n = require('./scripts/i18n/babel-plugin.cjs');
// 中英双语：打包时把代码里的中文接上翻译（见 src/shared/i18n/core.js）。翻译自己的代码和词典不动。
const NO_I18N = /[\/](client[\/]src[\/]i18n\.js|src[\/]shared[\/]i18n[\/])/;

// 前端在 client/，打包到 client/dist，由后端（src/server）一起托管
export default defineConfig({
  root: 'client',
  plugins: [react({
    babel: (id) => (NO_I18N.test(id) || /node_modules/.test(id) ? {} : { plugins: [[i18n, { runtime: '@i18n' }]] }),
  })],
  resolve: { alias: { '@i18n': path.resolve('client/src/i18n.js') } },
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: { '/api': { target: 'http://localhost:3001', ws: true } },
  },
});
