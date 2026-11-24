import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  root:resolve('apps/web'),
  plugins:[react()],
  resolve:{alias:{exceljs:resolve('.generated/exceljs.mjs')}},
  build:{rollupOptions:{input:[resolve('apps/web/index.html'),resolve('apps/web/fase-1/operations.html')]},outDir:resolve('dist'),emptyOutDir:true}
});
