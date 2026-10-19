// End-to-end smoke test (test/e2e/*.spec.ts) against the production build.
//
//   npm run e2e                                          (CI: the browser `npx playwright install chromium` put in place)
//   CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e  (a Chromium already on the machine)
//
// The app is built and served by `vite preview` on 127.0.0.1:4173; a server
// already running there is reused outside CI. Vitest never sees these files:
// it only collects test/**/*.test.ts, and these are *.spec.ts.
//
// The perf harness (perf.spec.ts, tagged @perf) is left out unless PERF=1:
//
//   PERF=1 CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test perf.spec.ts
//
// It runs against a build of its own, unminified so the render counts keep the
// components' names, served on 127.0.0.1:4174 (and always built afresh).
import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI
const executablePath = process.env.CHROMIUM_PATH || undefined
const PERF = !!process.env.PERF
const PERF_DIST = 'node_modules/.arc-perf'
const port = PERF ? 4174 : 4173

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  ...(PERF ? { grep: /@perf/ } : { grepInvert: /@perf/ }),
  retries: CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
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
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: PERF
      ? `npm run build -- --minify false --outDir ${PERF_DIST} --emptyOutDir && npm run preview -- --outDir ${PERF_DIST} --host 127.0.0.1 --port ${port} --strictPort`
      : 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !CI && !PERF,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
