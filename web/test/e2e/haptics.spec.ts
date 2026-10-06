// End-to-end: the pads' haptic tick (platform/haptics.ts) in Chromium, with
// the simulated EP-133 of ?demo. navigator.vibrate is replaced by a recorder
// before the app loads. On an emulated phone (touch screen, coarse pointer) a
// finger's press on a pad, a KEYS key or a piano key ticks once while
// Settings → Haptics is on, and not once it is off; on the desktop
// (vibrate there, but no touch screen) the Settings row is not shown at all.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/** Records navigator.vibrate's calls in window.__arcVibrate, from before the app starts. */
async function recordVibrate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __arcVibrate: unknown[] }
    w.__arcVibrate = []
    Object.defineProperty(Navigator.prototype, 'vibrate', {
      configurable: true,
      writable: true,
      value: (pattern: unknown) => {
        w.__arcVibrate.push(pattern)
        return true
      },
    })
  })
}

const vibrations = (page: Page): Promise<unknown[]> => page.evaluate(() => (window as unknown as { __arcVibrate: unknown[] }).__arcVibrate)

const PHONE = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }

test.describe('on a phone', () => {
  test.use({ ...PHONE, viewport: { width: 393, height: 852 } })

  test('a pad and a KEYS key tick once each, and not with the setting off', async ({ page }) => {
    await recordVibrate(page)
    await page.goto('/?demo#/live')
    const pads = page.locator('[data-pad]')
    await expect(pads).toHaveCount(12)
    await pads.first().tap()
    await expect.poll(() => vibrations(page)).toEqual([10])

    await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
    const keys = page.locator('[data-key]')
    await expect(keys).toHaveCount(12)
    await keys.nth(3).tap()
    await expect.poll(() => vibrations(page)).toEqual([10, 10])

    await page.getByRole('banner').getByRole('button', { name: 'Settings' }).click()
    const haptics = page.getByRole('switch', { name: 'Haptics' })
    await expect(haptics).toHaveAttribute('aria-checked', 'true')
    await haptics.click()
    await expect(haptics).toHaveAttribute('aria-checked', 'false')
    await page.goBack()
    await expect(keys).toHaveCount(12)
    await keys.nth(3).tap()
    await page.getByRole('button', { name: 'Keys. Tap for pads.' }).click()
    await pads.first().tap()
    // Give a late tick the time to show.
    await page.waitForTimeout(200)
    expect(await vibrations(page)).toEqual([10, 10])
  })
})

test.describe('on a phone on its side', () => {
  test.use({ ...PHONE, viewport: { width: 852, height: 393 } })

  test('a piano key ticks once', async ({ page }) => {
    await recordVibrate(page)
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
    const white = page.locator('[data-note]').first()
    await expect(white).toBeVisible()
    await white.tap()
    await expect.poll(() => vibrations(page)).toEqual([10])
  })
})

test('on the desktop the Haptics row is hidden: vibrate is there, but no touch screen', async ({ page }) => {
  await recordVibrate(page)
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  expect(await page.evaluate(() => typeof navigator.vibrate)).toBe('function')
  await page.getByRole('banner').getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByText('Piano keys', { exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Haptics' })).toHaveCount(0)
})
