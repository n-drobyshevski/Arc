// Shared bits of the e2e smoke test: a `test` that fails on any console error
// or uncaught page error (in every page of the test's context), the demo
// device's handle, and the fixture paths.
import { fileURLToPath } from 'node:url'
import { test as base, expect, type Page } from '@playwright/test'
import type { ArcDemo } from '../../src/dev/demo'

/** The .pak the Android tests import (reference/ is the frozen spec). */
export const SAMPLE_PAK = fileURLToPath(new URL('../../../reference/test/fixtures/sample.pak', import.meta.url))

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ context }, use, testInfo) => {
      const errors: string[] = []
      context.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console.error: ${m.text()} (${m.location().url})`)
      })
      context.on('weberror', (e) => errors.push(`page error: ${e.error().stack ?? e.error().message}`))
      await use(errors)
      if (errors.length !== 0) await testInfo.attach('page-errors.txt', { body: errors.join('\n'), contentType: 'text/plain' })
      expect(errors, 'console errors and uncaught page errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Runs [fn] with `window.__arcDemo` in the page (?demo only). */
export function demo<T>(page: Page, fn: (d: ArcDemo) => T): Promise<T> {
  return page.evaluate(`(${fn.toString()})(window.__arcDemo)`) as Promise<T>
}

/** Makes the page look like a person's browser, so the first-run guide overlay opens (app.tsx skips it for webdriver). */
export async function notAutomated(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true })
  })
}

/** The section switch in the top bar: opens the Sections menu and picks [name]. */
export async function selectTab(page: Page, name: 'Backups' | 'Live' | 'Device'): Promise<void> {
  await page.getByRole('banner').getByRole('button', { name: /, Sections$/ }).click()
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('banner').getByRole('button', { name: `${name}, Sections` })).toBeVisible()
}

/**
 * Opens Settings: the nav rail's Settings key on the desktop layout (from
 * 1024px wide, where the top bar has the theme switch in the gear's place),
 * the top bar's gear below it.
 */
export async function openSettings(page: Page): Promise<void> {
  const desk = (page.viewportSize()?.width ?? 0) >= 1024
  const key = desk
    ? page.locator('.nav-rail').getByRole('button', { name: 'Settings', exact: true })
    : page.getByRole('banner').getByRole('button', { name: 'Settings', exact: true })
  await key.click()
  await expect(page.locator('.app__screen[data-view="settings"]')).toBeVisible()
}

/**
 * Imports a .pak through the Import key. The app makes a hidden <input type=file>
 * per pick and clicks it; Playwright intercepts that picker (FileChooser) and
 * sets the input's files, which fires its change event like a real choice.
 */
export async function importPak(page: Page, file: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import a .pak' }).click()
  const fc = await chooser
  await fc.element().setInputFiles(file)
}
