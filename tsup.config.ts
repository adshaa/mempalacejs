import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
    'storage/embedding_worker': 'src/storage/embedding_worker.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: false, // Disabled for production size
  clean: true,
  minify: true,
  treeshake: true,
  // Bundle pure-JS dependencies to reduce node_modules footprint
  noExternal: [
    '@clack/prompts',
    'commander',
    'fast-json-stringify',
    'ignore',
    'js-yaml',
    'zod',
    '@modelcontextprotocol/sdk',
  ],
  // Keep native and heavy dependencies external
  external: [
    '@lancedb/lancedb',
    'better-sqlite3',
    '@xenova/transformers',
  ],
  onSuccess: 'chmod +x dist/cli/index.js dist/cli/index.mjs',
});
