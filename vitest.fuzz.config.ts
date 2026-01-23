import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.fuzz.test.ts'],
    testTimeout: 120000, // Fuzz tests can take much longer
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      'eth-agent': './src/index.ts',
    },
  },
});
