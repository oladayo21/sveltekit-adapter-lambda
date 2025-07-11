import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/', 'coverage/', '**/*.config.*', '**/*.d.ts'],
      include: ['src/**/*'],
    },
  },
});
