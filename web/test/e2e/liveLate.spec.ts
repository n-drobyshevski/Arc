// End-to-end: Live's display line says when the sound plays late, in
// Chromium with the simulated EP-133 of ?demo. The output's latency is made
// long (140 ms) before the app loads; once a press wakes the output,
// LiveAudio.late reaches the display through ArcController.liveLate and
// MirrorScreen's outputLate: the one-group strip on the desktop, and the
// all-groups display on a phone, which draws the longer line a size down.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const TEXT = 'Sound plays 140 ms late: wired output is quicker'

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

test('on the desktop, the one-group strip says the sound plays late', async ({ page }) => {
  await lateLive(page)
  await expect(page.locator('.live-strip__line')).toHaveText(TEXT)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('the all-groups display says it, a size down', async ({ page }) => {
    await lateLive(page)
    await expect(page.locator('.live-strip__line')).toHaveText(TEXT)
    // The strip on the right edge opens Live tools, where the view switches.
    await page.getByRole('button', { name: 'Live tools' }).click()
    await page.getByRole('radio', { name: 'All groups' }).click()
    await page.keyboard.press('Escape')
    const line = page.locator('.live-display__line')
    await expect(line).toHaveText(TEXT)
    await expect(line).toHaveClass(/live-display__line--small/)
  })
})
