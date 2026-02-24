import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environmentMatchGlobs: [
      ['client/**', 'jsdom'],
      ['server/**', 'node'],
    ],
  },
});
