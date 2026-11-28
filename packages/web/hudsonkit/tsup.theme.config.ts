import { defineConfig } from 'tsup';

// Environment-neutral entries: the theme bootstrap, and the host bridge wire
// protocol (read by @hudsonkit/electron's main and preload, which must not
// load React). Built after the client bundle so tsup's DTS writer cannot race
// or remove their `.d.ts` files.
export default defineConfig({
  entry: {
    'theme-script': 'src/theme-script.ts',
    'bridge-protocol': 'src/platform/bridgeProtocol.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: false,
  treeshake: true,
  clean: false,
  outDir: 'dist',
  external: [
    'react',
    'react-dom',
    'iconoir-react',
  ],
});
