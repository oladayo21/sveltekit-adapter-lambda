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
    // SvelteKit peer dependency
    '@sveltejs/kit',
    // Rollup build tools (available in user's environment)
    'rollup',
    '@rollup/plugin-commonjs',
    '@rollup/plugin-json',
    '@rollup/plugin-node-resolve',
    // Node.js built-ins
    'node:fs',
    'node:url',
    'node:path',
  ],
});
