// The panels' motion and gestures, as Android's (SamplePanel.kt): a swipe right to left across
// the pads opens SAMPLE and left to right closes it, a short or mostly vertical one does nothing;
// Escape closes the open panel (SAMPLE, STEP), one a press; the panel unrolls as it opens, and
// not at all where the system asks for less motion.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 915 } })

/** A drag by [dx], [dy] px, in steps as a finger would, from the middle of a pad on the side it goes away from. */
async function drag(page: Page, dx: number, dy = 0): Promise<void> {
  const boxes = await Promise.all((await page.locator('[data-pad]').all()).map((p) => p.boundingBox()))
  const xs = boxes.filter((b) => b !== null)
  const box = xs.reduce((a, b) => ((dx < 0 ? b.x > a.x : b.x < a.x) ? b : a))
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  await page.mouse.up()
}

async function live(page: Page): Promise<void> {
  // The mic refused: RSP stands in, with no permission prompt.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  })
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
}

test('a swipe across the pads opens SAMPLE and back closes it; short or up and down does nothing', async ({ page }) => {
  await live(page)
  const panel = page.getByRole('region', { name: 'Sample' })
  const mic = page.getByRole('button', { name: 'Sample' })
  const width = page.viewportSize()!.width

  // Too short, and mostly down: nothing.
  await drag(page, -0.1 * width)
  await drag(page, -0.1 * width, 0.4 * width)
  await expect(panel).toHaveCount(0)

  // Right to left, past 30 % of the way: open.
  await drag(page, -0.45 * width)
  await expect(panel).toBeVisible()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  // Right to left again does nothing more; left to right closes it.
  await drag(page, -0.45 * width)
  await expect(panel).toBeVisible()
  await drag(page, 0.45 * width)
  await expect(panel).toHaveCount(0)
  await expect(mic).toHaveAttribute('aria-pressed', 'false')
})

test('Escape closes the open panel, one a press', async ({ page }) => {
  await live(page)
  await page.getByRole('button', { name: 'Sample' }).click()
  const sample = page.getByRole('region', { name: 'Sample' })
  await expect(sample).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sample).toHaveCount(0)

  await page.getByRole('button', { name: 'Step editing' }).first().click()
  const step = page.getByRole('region', { name: 'Step editing' })
  await expect(step).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(step).toHaveCount(0)
  // The function keys back.
  await expect(page.getByRole('button', { name: 'Effects' })).toBeVisible()
})

test('the panel unrolls as it opens, and not where the system asks for less motion', async ({ page }) => {
  await live(page)
  await page.getByRole('button', { name: 'Step editing' }).first().click()
  const step = page.getByRole('region', { name: 'Step editing' })
  await expect(step).toBeVisible()
  expect(await step.evaluate((e) => getComputedStyle(e).animationName)).toBe('panel-unroll')
  await page.keyboard.press('Escape')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Step editing' }).first().click()
  await expect(step).toBeVisible()
  expect(await step.evaluate((e) => getComputedStyle(e).animationName)).toBe('none')
})
