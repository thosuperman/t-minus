import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { devApi } from './devServer';

// Forge's Custom UI host does not run the entry as an ES module, so ship one classic script at the end of <body>.
const classicScript = (): Plugin => ({
  name: 'tminus-classic-script',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      html
        .replace(/\s*<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, '')
        .replace('</body>', '  <script src="./assets/app.js"></script>\n  </body>'),
  },
});

// Forge serves Custom UI from a sub-path, so asset URLs must be relative.
export default defineConfig(({ command }) => ({
  root: __dirname,
  resolve: command === 'serve' ? { alias: { '@forge/bridge': path.resolve(__dirname, 'bridgeStub.ts') } } : {},
  base: './',
  plugins: [react(), devApi(), classicScript()],
  server: { port: 5199, fs: { allow: [path.resolve(__dirname, '..')] } },
  // One classic (non-module) bundle: Forge's Custom UI host ran the module build as a classic script and failed on import.meta.
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'assets/app.js', assetFileNames: 'assets/[name][extname]' } },
  },
}));
