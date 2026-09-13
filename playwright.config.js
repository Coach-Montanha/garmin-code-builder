import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chrome',
      use: {
        channel: 'chrome',
      },
    },
    {
      name: 'edge',
      use: {
        channel: 'msedge',
      },
    },
  ],
  webServer: process.env.SKIP_WEBSERVER ? undefined : {
    command: 'node server/app.js',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 10000,
    ignoreHTTPSErrors: true,
  },
});
