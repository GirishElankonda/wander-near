import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  // Multi-page app: both HTML files are entry points
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        tripPlanner: path.resolve(__dirname, 'trip-planner.html'),
      },
    },
    // Clean dist folder on every build
    outDir: 'dist',
    emptyOutDir: true,
  },

  // Resolve ogl to its ESM source so Vite can bundle it
  resolve: {
    alias: {
      ogl: path.resolve(__dirname, 'node_modules/ogl/src/index.js'),
    },
  },

  // All VITE_* prefixed vars are exposed to the client bundle by default
  envPrefix: 'VITE_',
});
