// FX end to end, on the simulated EP-133 of ?demo: FX held (here a right-click,
// which latches it) turns the big grid's pads into the punch-ins; one held names
// the display line, and let go of, the line comes back; FX let go of, the pads
// play their sounds again.
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 843 } })

test('FX: the punch-ins on the pads', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  const fx = page.getByRole('button', { name: 'Effects' })
  await expect(fx).toHaveAttribute('aria-pressed', 'false')
  await expect(fx.locator('.fn-key__label')).toHaveText(/^FX off$/i)

  await fx.click({ button: 'right' })
  await expect(fx).toHaveAttribute('aria-pressed', 'true')
  const pads = page.locator('[data-punch]')
  await expect(pads).toHaveCount(12)
  // The pad printed 4 is LPF (slot 6, after '.', 0, ENTER, 1, 2, 3).
  const lpf = page.locator('[data-punch="6"]')
  await expect(lpf).toContainText('LPF')
  const box = (await lpf.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 4)
  await page.mouse.down()
  await expect(lpf).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.live-strip__punch')).toHaveText('PUNCH · LPF')
  await page.mouse.up()
  await expect(lpf).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.live-strip__punch')).toHaveCount(0)

  await fx.click({ button: 'right' })
  await expect(fx).toHaveAttribute('aria-pressed', 'false')
  await expect(pads).toHaveCount(0)
})
