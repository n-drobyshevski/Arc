// Live for screen readers, as Android's: a display line's or a panel's polite live region says its
// words at most once a second (Kotlin spoken()), so a run of changes is read where it ends; no live
// region holds the line's keys or another region; a pad's, a KEYS key's or a piano key's second
// action (Android's custom actions) is Shift+Enter: Pick to nudge with STEP open, Play in EDIT and,
// on a pad with a sound, in SAMPLE, each named in its description; a
// pad's click in SAMPLE records hands-free, or stops or cancels the take.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function live(page: Page): Promise<void> {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
}

test.use({ viewport: { width: 412, height: 915 } })

test('a run of STEP moves is said where it ends, at most once a second', async ({ page }) => {
  await live(page)
  await page.getByRole('button', { name: 'Step editing' }).first().click()
  const panel = page.getByRole('region', { name: 'Step editing' })
  const said = panel.locator('[aria-live="polite"]')
  await expect(said).toHaveCount(1)
  const first = await said.textContent()
  // A quiet second: the next move is said at once.
  await page.waitForTimeout(1100)
  const next = panel.getByRole('button', { name: 'Next step' })
  await next.click()
  await expect(said).not.toHaveText(first!)
  const one = await said.textContent()
  await next.click()
  await next.click()
  // Within the second the region keeps the first move…
  expect(await said.textContent()).toBe(one)
  // …and then says the last.
  await expect(said).not.toHaveText(one!, { timeout: 2000 })
  await expect(said).toHaveText(/1\.1\.4|step 4/i)
})

test('no live region holds a key or another region', async ({ page }) => {
  await live(page)
  await expect.poll(() => nestedRegions(page)).toBe(0)
  // The desk's drawn EP-133 too.
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('.ko-device')).toBeVisible()
  await expect.poll(() => nestedRegions(page)).toBe(0)
})

async function nestedRegions(page: Page): Promise<number> {
  const nested = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-live]:not([aria-live="off"])')].filter(
      (r) => r.querySelector('button, [role="button"], [aria-live]:not([aria-live="off"])') !== null,
    ).length,
  )
  return nested
}

test('Shift+Enter on a pad with STEP open picks it to nudge', async ({ page }) => {
  await live(page)
  await page.getByRole('button', { name: 'Step editing' }).first().click()
  const panel = page.getByRole('region', { name: 'Step editing' })
  const rec = panel.getByRole('switch', { name: 'Record' })
  await rec.focus()
  await page.keyboard.press('Enter')
  const pad = page.locator('[data-pad="9"]')
  await pad.click()
  await expect(pad).toHaveClass(/is-step-lit/)
  await rec.focus()
  await page.keyboard.press('Enter')
  await expect(pad).toHaveAttribute('aria-description', 'Play. Pick to nudge: Shift+Enter')
  await expect(pad).toHaveAttribute('aria-keyshortcuts', /Shift\+Enter/)
  await pad.focus()
  await page.keyboard.press('Shift+Enter')
  await expect(pad).toHaveClass(/is-step-picked/)
})

test("in EDIT Enter opens a pad's sheet, Shift+Enter plays it", async ({ page }) => {
  await live(page)
  await page.getByRole('switch', { name: 'Sound' }).click()
  const pad = page.locator('[data-pad="9"]')
  await expect(pad).toHaveAttribute('aria-description', 'Tap a pad to change its sound. Play: Shift+Enter')
  await pad.focus()
  await page.keyboard.press('Shift+Enter')
  // It plays (not heard here: no voices headless), and opens nothing.
  await page.waitForTimeout(300)
  await expect(page.getByRole('dialog', { name: 'Pad A 7' })).toHaveCount(0)
  await pad.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Pad A 7' })).toBeVisible()
})

test("in SAMPLE a pad's click records hands-free, says so, and stops", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  })
  await live(page)
  await page.getByRole('button', { name: 'Sample' }).click()
  await expect(page.getByRole('region', { name: 'Sample' })).toBeVisible()
  // The demo's pads are empty: no Play to give.
  const pad = page.locator('[data-pad="9"]')
  await expect(pad).toHaveAttribute('aria-description', 'Record hands-free')
  await pad.focus()
  await page.keyboard.press('Enter')
  await expect(pad).toHaveClass(/is-sample-(waiting|recording)/)
  await expect(pad).toHaveAttribute('aria-description', /^(Cancel|Stop) recording$/)
  await page.keyboard.press('Enter')
  await expect(pad).not.toHaveClass(/is-sample-(waiting|recording)/)
})
