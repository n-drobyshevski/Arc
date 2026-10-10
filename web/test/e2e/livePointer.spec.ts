// End-to-end: a glissando on Live's piano (ui/live/PianoKeyboard.tsx) in
// Chromium, with the simulated EP-133 of ?demo. Chromium sends
// pointerrawupdate, so a held finger's moves are read from it as they arrive:
// with every pointermove stopped before the page sees it, a slide still
// reaches the next keys, and lets go of the one it left.
import { expect, test } from './fixtures'

test('a mouse glissando on the piano follows pointerrawupdate alone', async ({ page }) => {
  await page.addInitScript(() => {
    // Before any of the app's handlers: the frame-aligned moves never arrive.
    window.addEventListener('pointermove', (e) => e.stopImmediatePropagation(), true)
  })
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  expect(await page.evaluate(() => 'onpointerrawupdate' in window)).toBe(true)
  await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
  const whites = page.locator('.piano__key--white')
  await expect(whites.first()).toBeVisible()
  const first = whites.nth(0)
  const third = whites.nth(2)
  const a = (await first.boundingBox())!
  const c = (await third.boundingBox())!
  const y = a.y + a.height * 0.85
  await page.mouse.move(a.x + a.width / 2, y)
  await page.mouse.down()
  await expect(first).toHaveAttribute('data-down', '')
  await page.mouse.move(c.x + c.width / 2, y, { steps: 8 })
  await expect(third).toHaveAttribute('data-down', '')
  await expect(first).not.toHaveAttribute('data-down', '')
  await page.mouse.up()
  await expect(third).not.toHaveAttribute('data-down', '')
})
