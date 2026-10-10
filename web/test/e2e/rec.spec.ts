// REC and takes end to end, on the simulated EP-133 of ?demo: arm, play a pad, stop,
// the take in Live tools, its actions, and the device's PLAY starting an armed take.
import { demo, expect, test } from './fixtures'

// The phone layout (the display strip's REC chip); the device view has its own spec.
test.use({ viewport: { width: 412, height: 843 } })

test('REC records a pad into a take that Live tools lists', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page).toHaveURL(/#\/live$/)
  // The mirror is listening once the device is read (its project shows).
  await expect(page.locator('.live-strip')).toContainText('P1')
  // The device names pad A "." (001 kick) as it plays it.
  await demo(page, (d) => {
    d.noteOn(36, 127)
    d.pushPadActive(1, 0, 1)
  })
  await demo(page, (d) => d.noteOff(36))
  const pad = page.locator('[data-pad]', { hasText: 'kick' }).first()
  await expect(pad).toBeVisible()

  const rec = page.locator('.rec-chip')
  await expect(rec).toHaveAccessibleName(/^Record\. /)
  await rec.click()
  await expect(rec).toHaveAccessibleName(/^Record, waiting/)

  const box = await pad.boundingBox()
  if (box === null) throw new Error('the pad has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  // As on Android, a press that needs the device while it is busy reading plays nothing: press again then.
  for (let i = 0; i < 3; i++) {
    await page.mouse.down()
    await page.waitForTimeout(400)
    await page.mouse.up()
    if (/^Recording/.test((await rec.getAttribute('aria-label')) ?? '')) break
  }
  await expect(rec).toHaveAccessibleName(/^Recording, \d+:\d\d\. Tap to stop\.$/)
  await rec.click()
  await expect(page.getByRole('status').filter({ hasText: /^Take saved \(\d+:\d\d\)\. It's in Live tools\.$/ })).toBeVisible()
  await expect(rec).toHaveAccessibleName(/^Record\. /)

  await page.getByRole('button', { name: /Live tools/i }).first().click()
  const takes = page.getByRole('region', { name: 'Takes' })
  await expect(takes.getByRole('listitem')).toHaveCount(1)
  await takes.locator('.take__fold').click()
  await expect(takes.getByRole('button', { name: 'Save WAV' })).toBeVisible()
  // A desktop browser can't share a file: no Share, and the note says Save WAV.
  await expect(takes.getByRole('button', { name: 'Share WAV' })).toHaveCount(0)
  await expect(takes.getByRole('button', { name: 'To EP-133' })).toBeVisible()
  await takes.getByRole('button', { name: 'Delete' }).click()
  await expect(takes.getByText('Delete this take?')).toBeVisible()
  await takes.getByRole('button', { name: 'Delete' }).click()
  await expect(takes.getByRole('listitem')).toHaveCount(0)
})

test("an armed take starts with the EP-133's PLAY and ends with its STOP", async ({ page }) => {
  await page.goto('/?demo')
  await expect(page).toHaveURL(/#\/live$/)
  // The mirror is listening once the device is read (its project shows).
  await expect(page.locator('.live-strip')).toContainText('P1')
  const rec = page.locator('.rec-chip')
  await rec.click()
  await expect(rec).toHaveAccessibleName(/^Record, waiting/)
  await demo(page, (d) => d.clock('start'))
  await expect(rec).toHaveAccessibleName(/^Recording/)
  await demo(page, (d) => d.clock('stop'))
  // Nothing was played in the browser: the take is silent, so nothing is kept.
  await expect(rec).toHaveAccessibleName(/^Record\. /)
})
