import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/e2e/**/*.test.ts'],
    testTimeout: 30000, // Longer timeout for blockchain operations
    hookTimeout: 20000, // Longer timeout for starting/stopping anvil
    pool: 'forks', // Run in separate process for better isolation
    poolOptions: {
      forks: {
        singleFork: true, // Single fork to share anvil instance
      },
    },
  },
  resolve: {
    alias: {
      'eth-agent': './src/index.ts',
    },
  },
});
