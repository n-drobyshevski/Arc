// SAMPLE end to end, on the simulated EP-133 of ?demo: the mic key in the top bar
// opens the panel in the function keys' place (lit while open); a pad held records
// into it (the header counts the take, the pad lit); let go, the review sheet opens
// with the slot it goes into; DISCARD lets it go with UNDO on the toast, and UNDO
// brings it back; KEEP uploads it. LATCH reads STOP while a hands-free take goes on.
// The mic is refused here, so RSP (Live's own mix) stands in, as it does for a
// person who says no (sampleMic.spec.ts records from a fake mic).
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 915 } })

test('SAMPLE: the panel, a held take, the review sheet, UNDO and KEEP', async ({ page }) => {
  // The mic refused, as a person can.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  })
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  const mic = page.getByRole('button', { name: 'Sample' })
  await expect(mic).toHaveAttribute('aria-pressed', 'false')
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  const panel = page.getByRole('region', { name: 'Sample' })
  await expect(panel).toBeVisible()
  // Refused: RSP stands in, and the toast says why.
  await expect(page.locator('.toast')).toContainText('arc needs the microphone to sample it. RSP works without it.')
  await expect(panel).toContainText('RSP')
  await expect(panel).toContainText('Hold a pad to record')
  // In the function keys' place.
  await expect(page.getByRole('button', { name: 'Effects' })).toHaveCount(0)
  await expect(panel.getByRole('meter', { name: 'Input level' })).toBeVisible()
  await expect(panel.getByRole('slider', { name: /Level/ })).toBeVisible()

  // A pad held a second records into it.
  const pad = page.locator('[data-pad="9"]')
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  // Past a tap (a tap plays the pad instead): a second in.
  await expect(panel).toContainText('0:01 / 0:40')
  await expect(pad).toHaveClass(/is-sample-recording/)
  await page.mouse.up()

  const review = page.getByRole('dialog', { name: 'New sample' })
  await expect(review).toBeVisible()
  await expect(review).toContainText('Pad A 7')
  await expect(review).toContainText(/Slot \d+, the next free one/)
  await review.getByRole('button', { name: 'Discard' }).click()
  await expect(review).toHaveCount(0)
  const toast = page.locator('.toast')
  await expect(toast).toContainText('Sample discarded.')
  await toast.getByRole('button', { name: /undo/i }).click()
  await expect(review).toBeVisible()

  await review.getByRole('button', { name: 'Keep' }).click()
  await expect(review).toHaveCount(0)
  await expect(page.locator('.toast')).toContainText('Pad A 7: new sample on the EP-133.', { timeout: 15000 })

  // LATCH: a tap records hands-free, and LATCH reads STOP until it is stopped.
  await panel.getByRole('switch', { name: 'Latch' }).click()
  await expect(panel).toContainText('Tap a pad to record hands-free')
  await page.locator('[data-pad="8"]').click()
  const stop = panel.getByRole('button', { name: 'Stop recording' })
  await expect(stop).toBeVisible()
  await stop.click()
  await expect(review).toBeVisible()
  await review.getByRole('button', { name: 'Discard' }).click()

  // The ✕ closes the panel; the function keys are back.
  await panel.getByRole('button', { name: 'Close sampling' }).click()
  await expect(panel).toHaveCount(0)
  await expect(mic).toHaveAttribute('aria-pressed', 'false')
})
