// End-to-end: Live's display line keeps an amber chip (a Bluetooth glyph and a
// clock) for as long as the sound plays late, in Chromium with the simulated
// EP-133 of ?demo. The output's latency is made long (140 ms) before the app
// loads; once a press wakes the output, LiveAudio.late reaches the display
// through ArcController.liveLate and MirrorScreen's outputLate: the one-group
// strip on the desktop, and the all-groups display on a phone. The sentence is
// the chip's tooltip and label, not the line's main text, and hits keep showing.
import type { Page } from '@playwright/test'
import { demo, expect, test } from './fixtures'

const TEXT = 'Sound plays 140 ms late: wired output is quicker'
const WAITING = 'Press a pad on the EP-133.'

/** Live on the demo device, its output 140 ms late (baseLatency 0, outputLatency 0.14 s), woken by a press. */
async function lateLive(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const [name, value] of [
      ['baseLatency', 0],
      ['outputLatency', 0.14],
    ] as const) {
      Object.defineProperty(AudioContext.prototype, name, { configurable: true, get: () => value })
    }
  })
  await page.goto('/?demo#/live')
  const pads = page.locator('[data-pad]')
  await expect(pads.first()).toBeVisible()
  await pads.first().click()
}

test('on the desktop, the one-group strip has the chip, not the sentence', async ({ page }) => {
  await lateLive(page)
  const chip = page.locator('.live-strip [data-late-chip]')
  await expect(chip).toHaveAttribute('aria-label', TEXT)
  await expect(chip).toHaveAttribute('title', TEXT)
  await expect(chip.locator('svg')).toHaveCount(2)
  await expect(page.locator('.live-strip__line')).not.toHaveText(TEXT)
  await expect(page.locator('.live-strip__line')).toHaveText(WAITING)
  // A hit from the device shows beside the chip.
  await demo(page, (d) => d.noteOn(36, 127))
  await expect(page.locator('.live-strip__line')).toHaveText(/^A .+ · 127$/)
  await expect(chip).toBeVisible()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('the all-groups display has it after the tempo and project, and the line is its own', async ({ page }) => {
    await lateLive(page)
    await expect(page.locator('.live-strip [data-late-chip]')).toHaveAttribute('aria-label', TEXT)
    // The strip on the right edge opens Live tools, where the view switches.
    await page.getByRole('button', { name: 'Live tools' }).click()
    await page.getByRole('radio', { name: 'All groups' }).click()
    await page.keyboard.press('Escape')
    const chip = page.locator('.live-display [data-late-chip]')
    await expect(chip).toHaveAttribute('aria-label', TEXT)
    const line = page.locator('.live-display__line')
    await expect(line).not.toHaveText(TEXT)
    // "Press a pad on the EP-133." is longer than a hit: a size down.
    await expect(line).toHaveText(WAITING)
    await expect(line).toHaveClass(/live-display__line--small/)
    // The chip is the same size as the line's other chips would be: 28 high, and it stays.
    const box = await chip.boundingBox()
    expect(box?.height).toBeGreaterThan(24)
    expect(box?.height).toBeLessThan(32)
  })

  test('a long press names it', async ({ page }) => {
    await lateLive(page)
    const chip = page.locator('.live-strip [data-late-chip]')
    const box = (await chip.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect(page.locator('.late-chip__tip')).toHaveText(TEXT, { timeout: 2000 })
    await page.mouse.up()
  })
})
