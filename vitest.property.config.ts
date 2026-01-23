import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.property.test.ts'],
    testTimeout: 60000, // Property tests can take longer
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      'eth-agent': './src/index.ts',
    },
  },
});
