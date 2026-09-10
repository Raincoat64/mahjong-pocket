import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  root: 'web', base: './', publicDir: '../public', plugins: [react()],
  resolve:{alias:{'@pocket/majiang-core':fileURLToPath(new URL('./vendor/majiang-core-v1.4.1/lib/index.js',import.meta.url))}},
  optimizeDeps:{include:['@pocket/majiang-core']},
  build: {outDir: '../dist', emptyOutDir: true, target: 'safari15.4', commonjsOptions: {include: [/vendor/, /node_modules/]}},
  server: {host: '127.0.0.1'}
});
