import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'protocol/index': 'src/protocol/index.ts',
    'integrations/mcp/index': 'src/integrations/mcp/index.ts',
    'integrations/anthropic': 'src/integrations/anthropic.ts',
    'integrations/openai': 'src/integrations/openai.ts',
    'integrations/langchain': 'src/integrations/langchain.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2022',
  outDir: 'dist',
  external: [
    '@anthropic-ai/sdk',
    'openai',
    '@langchain/core',
    'langchain',
  ],
});
