// The display line's keys as Android's (PatternLine.kt): RECORD and PLAY one
// key, the scene's S01 and STEP a second (STEP its glyph on a phone's line,
// its word where the line is wide), ERASE and ↶ a third; what doesn't fit
// gives way so the counter is never cut.
import type { Page } from '@playwright/test'
import { demo, expect, gridOnDesk, test } from './fixtures'

/** A pad named by the device, then RECORD armed and the pad played: recording, with notes. */
async function record(page: Page): Promise<void> {
  await demo(page, (d) => {
    d.noteOn(36, 127)
    d.pushPadActive(1, 0, 1)
  })
  await demo(page, (d) => d.noteOff(36))
  const pad = page.locator('[data-pad]', { hasText: 'kick' }).first()
  await expect(pad).toBeVisible()
  const rec = page.getByRole('button', { name: /^Record, / })
  await rec.click()
  await expect(rec).toHaveAccessibleName('Record, armed')
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(150)
  await page.mouse.up()
  await expect(rec).toHaveAccessibleName('Record, recording')
}

/** The counter sits whole inside its line. */
async function counterWhole(page: Page): Promise<void> {
  const strip = page.locator('.live-strip').first()
  const num = strip.locator('.pattern-words__num')
  await expect(num).toBeVisible()
  const s = (await strip.boundingBox())!
  const n = (await num.boundingBox())!
  expect(n.x + n.width).toBeLessThanOrEqual(s.x + s.width)
  expect(await strip.evaluate((e: HTMLElement) => e.scrollWidth <= e.clientWidth)).toBe(true)
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('S01 and STEP share a key, STEP its glyph; the counter whole while recording', async ({ page }) => {
    await page.goto('/?demo')
    await expect(page.locator('.live-strip')).toContainText('Project 1')
    const strip = page.locator('.live-strip').first()
    const scene = strip.getByRole('button', { name: /^Scenes, scene 1/ })
    const step = strip.getByRole('button', { name: 'Step editing' })
    await expect(scene).toBeVisible()
    await expect(step).toBeVisible()
    // One key: the same group of cells holds both.
    const key = strip.locator('.transport-keys').filter({ has: page.getByRole('button', { name: /^Scenes, scene 1/ }) })
    await expect(key.getByRole('button', { name: 'Step editing' })).toBeVisible()
    await expect(step).not.toContainText('STEP')

    await record(page)
    await counterWhole(page)
  })
})

test.describe('on a small phone', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('the counter stays whole while recording, ERASE and ↶ giving way first', async ({ page }) => {
    await page.goto('/?demo')
    await expect(page.locator('.live-strip')).toContainText('Project 1')
    await record(page)
    await counterWhole(page)
  })
})

test.describe('on the desk', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test("a wide line (all groups in a row) has RECORD's and STEP's words", async ({ page }) => {
    await gridOnDesk(page)
    await page.goto('/?demo')
    await expect(page.locator('.live-strip')).toContainText('Project 1')
    await page.getByRole('radio', { name: /All groups/i }).first().click()
    const strip = page.locator('.live-row .live-strip')
    await expect(strip.getByRole('button', { name: 'Step editing' })).toHaveText('STEP')
    await expect(strip.getByRole('button', { name: /^Record, / })).toContainText('RECORD')
  })
})
