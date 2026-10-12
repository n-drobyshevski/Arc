// All four groups on a phone on its side, in one row that doesn't scroll (Kotlin allGroupsSideways): the function
// keys a column on their left, every pad playing on touch-down (no scroll to wait out); STEP's panel takes the
// column's place, the groups narrower beside it.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.use({ viewport: { width: 852, height: 393 } })

async function allGroups(page: Page): Promise<void> {
  await page.goto('/?demo')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  await page.getByRole('button', { name: 'Live tools' }).click()
  await page.getByRole('radio', { name: 'All groups' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-pad]')).toHaveCount(48)
}

test('the four groups in one row beside the function keys, nothing to scroll', async ({ page }) => {
  await allGroups(page)
  const row = page.locator('.live__side--row')
  await expect(row).toBeVisible()
  const groups = row.locator('.live-group')
  await expect(groups).toHaveCount(4)
  const tops = await Promise.all((await groups.all()).map(async (g) => Math.round((await g.boundingBox())!.y)))
  expect(new Set(tops).size).toBe(1)
  // The function keys left of group A.
  const sound = (await page.getByRole('switch', { name: 'Sound' }).boundingBox())!
  const a = (await groups.first().boundingBox())!
  expect(sound.x + sound.width).toBeLessThanOrEqual(a.x)
  // Nothing scrolls, and every pad plays on touch-down.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(row.locator('.live-pad--scroll')).toHaveCount(0)
  // At least 40 px both ways.
  const pad = (await row.locator('[data-pad]').first().boundingBox())!
  expect(pad.width).toBeGreaterThanOrEqual(40)
  expect(pad.height).toBeGreaterThanOrEqual(40)
})

test("STEP's panel takes the column's place, the groups narrower beside it", async ({ page }) => {
  await allGroups(page)
  const before = (await page.locator('.live__side--row .live-group').first().boundingBox())!
  await page.getByRole('button', { name: 'Step editing' }).first().click()
  const panel = page.getByRole('region', { name: 'Step editing' })
  await expect(panel).toBeVisible()
  await expect(page.locator('.fn-row--column')).toHaveCount(0)
  const p = (await panel.boundingBox())!
  const after = (await page.locator('.live__side--row .live-group').first().boundingBox())!
  expect(p.x + p.width).toBeLessThanOrEqual(after.x)
  expect(after.width).toBeLessThan(before.width)
  await panel.getByRole('button', { name: 'Close step editing' }).click()
  await expect(page.locator('.fn-row--column')).toHaveCount(1)
})
