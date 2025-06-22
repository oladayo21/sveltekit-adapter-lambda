import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  treeshake: true,
  minify: false,
  external: [
    // Core utilities dependency
    '@foladayo/lambda-adapter-kit',
    // SvelteKit peer dependency
    '@sveltejs/kit',
    // Node.js built-ins
    'node:fs',
    'node:url',
    'node:path',
  ],
});
