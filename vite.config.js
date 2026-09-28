import { defineConfig, loadEnv } from 'vite';
import { googleVerification } from './scripts/google-verification.mjs';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// https://vite.dev/config/
//
// Local review defaults to a local API server. Set VITE_DEV_API_TARGET explicitly
// to a configured staging deployment when authenticated integration testing is ready.
const DEV_API_TARGET = process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:4399';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), googleVerification(loadEnv(mode, process.cwd(), '').GOOGLE_SITE_VERIFICATION)],
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
    fs: { deny: ['**/.git/**', '**/.env*', '**/server-assets/**', '**/api/_data/**', '**/*.{crt,pem}'] },
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
          if (id.includes('/@zxing/')) return 'barcode-scanner';
          if (id.includes('/three/')) return 'warehouse-3d';
          if (id.includes('react-router')) return 'router';
          if (id.includes('react-dom') || id.includes('/react/')) return 'react';
          if (id.includes('/posthog-js/')) return 'analytics';
          return undefined;
        },
      },
    },
  },
}));
