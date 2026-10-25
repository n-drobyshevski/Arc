// Unit and server tests (test/**/*.test.ts). The server tests need the built
// view, so test/globalSetup.ts builds it first; Playwright's test/e2e/*.spec.ts
// are not collected here (`npm run e2e`).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/globalSetup.ts'],
  },
})
