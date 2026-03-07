import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    headless: true,
    browserName: 'firefox',
  },
  projects: [
    {
      name: 'epyc',
      testDir: './e2e/epyc',
      use: { baseURL: 'http://localhost:3100' },
    },
    {
      name: 'pictionary',
      testDir: './e2e/pictionary',
      use: { baseURL: 'http://localhost:3101' },
    },
  ],
  webServer: [
    {
      command: 'npm run build && npx tsx server/index.ts --password test --port 3100 --game epyc',
      port: 3100,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx tsx server/index.ts --password test --port 3101 --game pictionary',
      port: 3101,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
