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
  sourcemap: true,
  clean: true,
  minify: true,
  treeshake: true,
  onSuccess: 'chmod +x dist/cli/index.js dist/cli/index.mjs',
});
