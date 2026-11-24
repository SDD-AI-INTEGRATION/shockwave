import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';
import { build as buildSite } from 'vite';

const require = createRequire(import.meta.url);
const exceljs = resolve('.generated/exceljs.mjs');

// The published ExcelJS browser bundle embeds its own UUID dependency.
// Bundle the source entry point so npm's audited dependency override applies.
await build({
  entryPoints: [require.resolve('exceljs/lib/exceljs.bare.js')],
  outfile: exceljs,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  plugins: [
    {
      name: 'shared-exceljs-streams',
      setup(build) {
        // JSZip's standalone bundle embeds a separate Buffer implementation.
        build.onResolve({ filter: /^jszip$/ }, () => ({ path: require.resolve('jszip') }));
        // Normalize built-in specifiers so every stream uses the same Buffer.
        build.onResolve({ filter: /^(node:)?buffer$/ }, () => ({ path: require.resolve('buffer/') }));
        build.onResolve({ filter: /^stream$/ }, () => ({
          path: require.resolve('readable-stream/readable-browser.js'),
        }));
      },
    },
    nodeModulesPolyfillPlugin({
      globals: { Buffer: true, process: true },
      modules: { crypto: true, events: true, fs: 'empty', process: true, util: true },
    }),
  ],
});

await buildSite();
await build({
  entryPoints: ['apps/web/review-api.ts'],
  outfile: 'dist/review-api.js',
  alias: { exceljs },
  bundle: true,
  minify: true,
  platform: 'browser',
  target: 'es2022',
});
