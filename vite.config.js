import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// https://vite.dev/config/
//
// `npm run dev` runs only the Vite frontend — the /api serverless functions
// don't run locally, so proxied integrations (HubSpot, etc.) would fall back
// to stubs. We forward /api to the deployed Vercel functions (which hold the
// secrets) so localhost shows real data. Vite proxies server-side, so there's
// no browser CORS issue. Override the target with VITE_DEV_API_TARGET, e.g.
// point it at a local `vercel dev` on :3000.
const DEV_API_TARGET = process.env.VITE_DEV_API_TARGET || 'https://unite-2-0.vercel.app';

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
