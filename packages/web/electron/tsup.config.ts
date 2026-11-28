import { defineConfig } from 'tsup';

export default defineConfig([
  // Main-process and preload APIs, for apps that bundle their own.
  {
    entry: { main: 'src/main.ts', 'preload-api': 'src/preload-api.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    // import.meta.url (HUDSON_PRELOAD) must also work in the CJS build.
    shims: true,
    clean: true,
    outDir: 'dist',
    external: ['electron', 'hudsonkit', 'hudsonkit/bridge-protocol'],
  },
  // The ready-made preload: one CommonJS file with the protocol inlined, so
  // it runs with the sandbox on (a sandboxed preload can only require electron).
  {
    entry: { preload: 'src/preload-entry.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    dts: false,
    clean: false,
    outDir: 'dist',
    platform: 'node',
    external: ['electron'],
    noExternal: ['hudsonkit', 'hudsonkit/bridge-protocol'],
  },
]);
