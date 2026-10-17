// Wide and short windows laid out as Android's (Window.kt's rules; ui/useDesk.ts's queries):
// Settings in two panes from 720 wide, its close key at the nav's head; Device's projects and
// sounds side by side, and the Guide's device beside its list, from 840 wide unless the window
// is short (under 480 high); on a short window Backups' device panel is one line.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!

test.describe('800 × 900', () => {
  test.use({ viewport: { width: 800, height: 900 } })

  test('Settings: the section nav beside the sections, the close key at its head', async ({ page }) => {
    await page.goto('/?demo#/settings')
    const nav = page.getByRole('navigation', { name: 'Settings' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Close settings' })).toBeVisible()
    const pane = await box(page, '.settings__pane')
    expect(pane.x).toBeGreaterThanOrEqual((await nav.boundingBox())!.x + 200)
    // A section picked: it is lit, and scrolled to the pane's top.
    await nav.getByRole('button', { name: 'Live', exact: true }).click()
    await expect(nav.getByRole('button', { name: 'Live', exact: true })).toHaveAttribute('aria-current', 'true')
    await expect.poll(async () => (await box(page, '[data-section="live"]')).y - pane.y).toBeLessThan(80)
  })
})

test.describe('900 × 700', () => {
  test.use({ viewport: { width: 900, height: 700 } })

  test("Device's projects and sounds side by side; the Guide's device beside its list", async ({ page }) => {
    await page.goto('/?demo#/device')
    await expect(page.locator('.device--wide')).toBeVisible()
    const side = await box(page, '.device__side')
    const binder = await box(page, '.device__binder')
    expect(binder.x).toBeGreaterThanOrEqual(side.x + side.width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await page.goto('/?demo#/guide')
    const device = page.locator('.guide__device')
    await expect(device).toBeVisible()
    const list = await box(page, '.guide__list-col')
    expect(list.width).toBeLessThanOrEqual(620.5)
    expect((await device.boundingBox())!.x).toBeGreaterThanOrEqual(list.x + list.width)
  })
})

test.describe('900 × 460, short', () => {
  test.use({ viewport: { width: 900, height: 460 } })

  test('Device and the Guide keep one column', async ({ page }) => {
    await page.goto('/?demo#/device')
    await expect(page.locator('[data-screen="device"]')).toBeVisible()
    await expect(page.locator('.device--wide')).toHaveCount(0)
    await page.goto('/?demo#/guide')
    await expect(page.getByRole('region', { name: 'Shortcut guide' })).toBeVisible()
    await expect(page.locator('.guide__device')).toHaveCount(0)
  })
})

for (const [name, width, height, line] of [
  ['a phone on its side', 852, 393, true],
  ['an upright phone', 393, 852, false],
] as const) {
  test.describe(name, () => {
    test.use({ viewport: { width, height } })

    test(`Backups' device panel ${line ? 'is one line' : 'stays stacked'}`, async ({ page }) => {
      await page.goto('/?demo#/backups')
      const panel = page.locator('.device-panel')
      await expect(panel.locator('.device-panel__title')).toHaveText('EP-133')
      await expect(panel.locator('.device-panel__sub')).toHaveText('OS 2.0.5')
      if (line) {
        await expect(panel).toHaveClass(/device-panel--line/)
        expect((await panel.boundingBox())!.height).toBeLessThan(70)
        await expect(panel).toContainText('free')
      } else {
        await expect(panel).not.toHaveClass(/device-panel--line/)
        await expect(panel.locator('.device-panel__stat').first()).toHaveText(/^12\s*sounds$/)
      }
    })
  })
}
