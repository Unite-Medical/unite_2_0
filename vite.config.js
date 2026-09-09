import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// https://vite.dev/config/
//
// Local review defaults to a local API server. Set VITE_DEV_API_TARGET explicitly
// to a configured staging deployment when authenticated integration testing is ready.
const DEV_API_TARGET = process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:4399';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: command === 'build'
      ? [
        { find: './seed.js', replacement: path.resolve(ROOT, 'src/lib/publicSeed.js') },
        { find: /(?:\.\.\/|\.\/)data\/realCatalog\.js$/, replacement: path.resolve(ROOT, 'src/data/publicCatalog.js') },
        { find: /\.\/realCatalog\.js$/, replacement: path.resolve(ROOT, 'src/data/publicCatalog.js') },
      ]
      : [],
  },
  server: {
    proxy: {
      '/api': {
        target: DEV_API_TARGET,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'router';
          if (id.includes('react-dom') || id.includes('/react/')) return 'react';
          return 'vendor';
        },
      },
    },
  },
}));
