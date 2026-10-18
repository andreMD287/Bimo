import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    globalSetup: ['test/global-setup.ts'],
    // Cada archivo crea su propia base de datos; los archivos pueden correr en paralelo.
  },
});
