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

/**
 * What the open guide overlay hides, as words: a tag off the screen, a tag on
 * another, or a tag over a quarter or more of a marked control (what it points
 * at: a word's letters, not its touch area) or of an untagged one (data-coach-clear).
 * Empty when every tag is in view and clear. Tall areas (the pads, the piano) hold
 * their own tag and don't count.
 */
export function coachHides(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const tags = [...document.querySelectorAll('.coach__tag')].map((t) => ({ id: t.getAttribute('data-coach-tag') ?? '', r: t.getBoundingClientRect() }))
    const vw = innerWidth
    const vh = innerHeight
    const shown = (el: Element): DOMRect => (el.querySelector('[data-coach-box]') ?? el).getBoundingClientRect()
    const controls = [
      ...[...document.querySelectorAll('.coach-host [data-coach]')].map((el) => ({ id: el.getAttribute('data-coach') ?? '', r: shown(el) })),
      ...[...document.querySelectorAll('.coach-host [data-coach-clear]')].map((el) => ({ id: el.getAttribute('aria-label') ?? 'untagged', r: el.getBoundingClientRect() })),
    ].filter((c) => c.r.width > 0 && c.r.height > 0 && c.r.height <= vh / 4 && c.r.bottom > 0 && c.r.top < vh)
    const shared = (a: DOMRect, b: DOMRect): number =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    const out: string[] = []
    tags.forEach((t, i) => {
      if (t.r.left < -0.5 || t.r.top < -0.5 || t.r.right > vw + 0.5 || t.r.bottom > vh + 0.5) out.push(`${t.id} off the screen`)
      for (const u of tags.slice(i + 1)) if (shared(t.r, u.r) > 0) out.push(`${t.id} on ${u.id}`)
      for (const c of controls) if (c.id !== t.id && shared(t.r, c.r) >= 0.25 * c.r.width * c.r.height) out.push(`${t.id} hides ${c.id}`)
    })
    return out
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
