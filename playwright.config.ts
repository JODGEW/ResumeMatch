import process from 'node:process'

import { defineConfig } from '@playwright/test'

const appOrigin = 'http://127.0.0.1:4173'
if (!process.env.QA_LOCK_TOKEN || !process.env.QA_INVOCATION_ID) {
  throw new Error('Phase 1 Playwright must be started through the sanitized QA launcher')
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  outputDir: '.qa-artifacts/playwright-test-output',
  reporter: [['line']],
  use: {
    baseURL: appOrigin,
    browserName: 'chromium',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: `"${process.execPath}" qa/browser/qaCommand.mjs serve`,
    url: appOrigin,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
