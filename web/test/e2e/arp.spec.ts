// ARP end to end, on the simulated EP-133 of ?demo: RPT and LATCH under KEYS /
// PADS on the plate's strip (LATCH resting till RPT is on); a pad tapped with LATCH on keeps
// repeating, ringed, and names the display line; RPT off lets it go. The
// tempo sheet's TIMING page sets the arp's order, octaves and LATCH.
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 915 } })

test('ARP: note repeat latched on a pad, and the arp section of TIMING', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  const rpt = page.getByRole('switch', { name: 'Note repeat' })
  const latch = page.locator('.mode-strip').getByRole('switch', { name: 'Latch' })
  await expect(rpt).toHaveAttribute('aria-checked', 'false')
  await expect(latch).toHaveAttribute('aria-disabled', 'true')
  await rpt.click()
  await expect(rpt).toHaveAttribute('aria-checked', 'true')
  await latch.click()
  await expect(latch).toHaveAttribute('aria-checked', 'true')

  // A tap: the pad repeats on, ringed, and the line says so.
  const pad = page.locator('[data-pad="9"]')
  await pad.click()
  await expect(pad).toHaveClass(/is-arp-held/)
  await expect(page.locator('.live-strip').first()).toContainText(/REPEAT ∞ · 1\/16/)

  // RPT off: the notes go, the line comes back.
  await rpt.click()
  await expect(pad).not.toHaveClass(/is-arp-held/)
  await expect(page.locator('.live-strip').first()).not.toContainText('REPEAT')
  await expect(latch).toHaveAttribute('aria-disabled', 'true')

  // TIMING: the arp's order, octaves and LATCH (kept, so the switch under the grid follows).
  await page.getByRole('switch', { name: 'Click' }).first().click({ button: 'right' })
  const sheet = page.getByRole('dialog', { name: 'Tempo' })
  await sheet.getByRole('radio', { name: 'Timing' }).click()
  await expect(sheet).toContainText(/Arp and repeat/i)
  const up = sheet.getByRole('radio', { name: 'Up', exact: true })
  await up.click()
  await expect(up).toHaveAttribute('aria-checked', 'true')
  const three = sheet.getByRole('radio', { name: '3', exact: true })
  await three.click()
  await expect(three).toHaveAttribute('aria-checked', 'true')
  const sheetLatch = sheet.getByRole('switch', { name: 'Latch' })
  await expect(sheetLatch).toHaveAttribute('aria-checked', 'true')
  await sheetLatch.click()
  await expect(sheetLatch).toHaveAttribute('aria-checked', 'false')
  await sheet.getByRole('button', { name: 'Done' }).click()
  await rpt.click()
  await expect(latch).toHaveAttribute('aria-checked', 'false')
})
