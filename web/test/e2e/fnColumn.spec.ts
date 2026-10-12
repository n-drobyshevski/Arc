// The function keys on a phone on its side (Kotlin FunctionColumn): SOUND, PROJECT, TEMPO and FX
// in a column left of one group's pads and of KEYS' grid, sized to its height; STEP's panel takes
// its place while open; the all-groups page, which scrolls, keeps the row.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const fnKeys = (page: Page) => [
  page.getByRole('switch', { name: 'Sound' }),
  page.getByRole('button', { name: 'Project' }),
  page.getByRole('switch', { name: 'Click' }).first(),
  page.getByRole('button', { name: 'Effects' }),
]

/** The four keys are shown, one under another, left of [right] (the pads or the keys). */
async function columnLeftOf(page: Page, right: string): Promise<void> {
  const keys = fnKeys(page)
  const boxes = []
  for (const k of keys) {
    await expect(k).toBeVisible()
    boxes.push((await k.boundingBox())!)
  }
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i]!.y).toBeGreaterThan(boxes[i - 1]!.y)
    expect(Math.abs(boxes[i]!.x - boxes[0]!.x)).toBeLessThan(2)
  }
  const target = (await page.locator(right).first().boundingBox())!
  for (const b of boxes) expect(b.x + b.width).toBeLessThanOrEqual(target.x)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  // Nothing cut: the column holds its keys.
  expect(await page.locator('.fn-row--column').evaluate((e: HTMLElement) => e.scrollHeight <= e.clientHeight + 1)).toBe(true)
}

for (const [width, height] of [
  [852, 393],
  [740, 360],
] as const) {
  test.describe(`on its side, ${width}×${height}`, () => {
    test.use({ viewport: { width, height } })

    test("a column left of one group's pads and of KEYS' grid, STEP's panel in its place", async ({ page }) => {
      await page.goto('/?demo')
      await expect(page.locator('[data-pad]')).toHaveCount(12)
      await columnLeftOf(page, '.ko-body')

      // SOUND turns EDIT on and off; TEMPO held opens the Tempo sheet.
      const sound = page.getByRole('switch', { name: 'Sound' })
      await sound.click()
      await expect(sound).toHaveAttribute('aria-checked', 'true')
      await sound.click()
      await expect(sound).toHaveAttribute('aria-checked', 'false')
      await page.getByRole('switch', { name: 'Click' }).first().click({ button: 'right' })
      const sheet = page.getByRole('dialog', { name: 'Tempo' })
      await expect(sheet).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(sheet).toHaveCount(0)

      // KEYS' grid: the same column, left of the keys.
      await page.locator('[data-pad="9"]').click()
      await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
      await page.getByRole('radiogroup', { name: 'Keys view' }).getByRole('radio', { name: 'Keys on the pads' }).click()
      await columnLeftOf(page, '.live-kgrid')

      // STEP open: its panel in the column's place.
      await page.getByRole('button', { name: 'Step editing' }).first().click()
      const panel = page.getByRole('region', { name: 'Step editing' })
      await expect(panel).toBeVisible()
      await expect(page.locator('.fn-row--column')).toHaveCount(0)
      await panel.getByRole('button', { name: 'Close step editing' }).click()
      await expect(page.locator('.fn-row--column')).toHaveCount(1)
    })
  })
}

test.describe('all four groups on its side', () => {
  test.use({ viewport: { width: 852, height: 393 } })

  test('the page that scrolls keeps the row', async ({ page }) => {
    await page.goto('/?demo')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('button', { name: 'Live tools' }).click()
    await page.getByRole('radio', { name: 'All groups' }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-pad]')).toHaveCount(48)
    for (const k of fnKeys(page)) await expect(k).toBeVisible()
    await expect(page.locator('.fn-row--column')).toHaveCount(0)
  })
})
