import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/playwright',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  webServer: {
    command: 'node scripts/preview-local.cjs --servers-only',
    url: 'http://127.0.0.1:15177',
    reuseExistingServer: true,
    timeout: 120_000
  },
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
})
