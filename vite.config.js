import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
//
// `npm run dev` runs only the Vite frontend — the /api serverless functions
// don't run locally, so proxied integrations (HubSpot, etc.) would fall back
// to stubs. We forward /api to the deployed Vercel functions (which hold the
// secrets) so localhost shows real data. Vite proxies server-side, so there's
// no browser CORS issue. Override the target with VITE_DEV_API_TARGET, e.g.
// point it at a local `vercel dev` on :3000.
const DEV_API_TARGET = process.env.VITE_DEV_API_TARGET || 'https://unite-2-0.vercel.app';

export default defineConfig({
  plugins: [react()],
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
});
