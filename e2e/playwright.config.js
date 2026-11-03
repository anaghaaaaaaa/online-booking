import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    browserName: 'chromium',
    baseURL: 'http://localhost:8100',
    headless: true,
    actionTimeout: 10000
  }
});
