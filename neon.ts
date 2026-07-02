import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  preview: {
    // One credential to the AI gateway. The runtime injects NEON_AI_GATEWAY_TOKEN
    // and NEON_AI_GATEWAY_BASE_URL; the function routes to any model with them.
    aiGateway: true,
    functions: {
      chat: {
        name: 'ai gateway chat',
        source: 'src/index.ts',
      },
    },
  },
});
