// The upright grid's pads fill the room they get (Kotlin padFit and PadFitTest): on a
// tall phone the four rows share the height the body leaves, the pads growing taller
// (not wider), up to 1.15 times their width; on a small phone they stay 1.08 times as
// wide as high.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function pad(page: Page): Promise<{ width: number; height: number }> {
  await page.goto('/?demo')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  return (await page.locator('[data-pad="9"]').boundingBox())!
}

test.describe('on a tall phone', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('the pads grow taller into the spare height, up to 1.15 times their width', async ({ page }) => {
    const p = await pad(page)
    expect(p.height).toBeGreaterThan(p.width / 1.08 + 4)
    expect(p.height).toBeLessThanOrEqual(p.width * 1.15 + 1)
  })
})

test.describe('on a small phone', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('the pads stay as they are', async ({ page }) => {
    const p = await pad(page)
    expect(Math.abs(p.height - p.width / 1.08)).toBeLessThan(1.5)
  })
})
