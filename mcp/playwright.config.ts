// The beat and guide views in a browser (test/e2e/*.spec.ts): a test host
// page (test/e2e/host) embeds a view the server serves and drives it with the
// ext-apps AppBridge, as Claude would.
//
//   npm run e2e                                          (CI: after `npx playwright install chromium`)
//   CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e  (a Chromium already on the machine)
//
// The webServer builds the views and the server, then serves the host and /mcp
// on 127.0.0.1:4174. Vitest never sees these files: it only collects *.test.ts.
import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI
const executablePath = process.env.CHROMIUM_PATH || undefined

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 420, height: 900 },
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          // Play needs a user gesture anyway; this keeps headless audio from waiting on one.
          args: ['--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
  ],
  webServer: {
    command:
      'npm run build:views && npm run build:server && vite --config test/e2e/host/vite.config.ts --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
