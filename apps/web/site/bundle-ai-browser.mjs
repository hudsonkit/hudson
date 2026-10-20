import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  entryPoints: [fileURLToPath(new URL('../../../packages/web/ai-backends/src/browser.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('../public/ai/browser-v1.js', import.meta.url)),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
