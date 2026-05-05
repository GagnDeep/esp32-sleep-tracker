import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'node:path';

// Output directly into firmware/data so `pio run -t uploadfs` writes
// the SPA bundle straight to LittleFS. The post-build step in
// build.mjs adds gzip companions + a manifest the device can serve.
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../firmware/data'),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Single bundle keeps the served-by-ESP32 request count tiny.
        manualChunks: undefined,
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/app-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Point at a real device for live API + WS during development:
      //   DEV_TARGET=http://sleep-tracker.local npm run dev
      '/api': process.env.DEV_TARGET ?? 'http://sleep-tracker.local',
      '/ws':  { target: process.env.DEV_TARGET ?? 'ws://sleep-tracker.local', ws: true },
    },
  },
});
