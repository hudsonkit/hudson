import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const hudsonkit = resolve(__dirname, '../hudsonkit/src');

export default defineConfig({
  test: { environment: 'node' },
  resolve: {
    alias: [
      { find: 'hudsonkit/bridge-protocol', replacement: resolve(hudsonkit, 'platform/bridgeProtocol.ts') },
      { find: /^hudsonkit$/, replacement: resolve(hudsonkit, 'index.ts') },
    ],
  },
});
