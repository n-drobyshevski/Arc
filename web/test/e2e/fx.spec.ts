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

test('FX: the sheet sets the effect, its sends and the output', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  const fx = page.getByRole('button', { name: 'Effects' })
  await fx.click()
  const sheet = page.getByRole('dialog', { name: 'FX' })
  await expect(sheet).toBeVisible()
  // No pad played yet: nothing to hear the effects on.
  await expect(sheet).toContainText('Play a pad in Live to hear the effects here.')
  await expect(sheet.getByRole('group', { name: 'X and Y' })).toHaveAttribute('aria-disabled', 'true')

  await sheet.getByRole('radio', { name: /^Reverb/ }).click()
  await expect(fx.locator('.fn-key__label')).toHaveText(/^Reverb$/i)
  const xy = sheet.getByRole('group', { name: 'X and Y' })
  await expect(xy).not.toHaveAttribute('aria-disabled', 'true')
  // The XY pad: a touch puts the dot there.
  const box = (await xy.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.1)
  await expect(xy).toHaveAttribute('aria-description', /Reverb, /)
  // A send: the keyboard steps it.
  const sendB = sheet.getByRole('slider', { name: 'Send B' })
  await expect(sendB).toHaveAttribute('aria-valuenow', '0')
  await sendB.focus()
  await page.keyboard.press('ArrowUp')
  await expect(sendB).toHaveAttribute('aria-valuenow', '5')
  // Tapped again, the effect goes off.
  await sheet.getByRole('radio', { name: /^Reverb, on/ }).click()
  await expect(fx.locator('.fn-key__label')).toHaveText(/^FX off$/i)

  // OUTPUT: the compressor and the sidechain's groups.
  await sheet.getByRole('radio', { name: 'Output' }).click()
  await sheet.getByRole('switch', { name: /Output comp/ }).click()
  await expect(sheet.getByRole('switch', { name: /Output comp/ })).toHaveAttribute('aria-checked', 'true')
  const duckC = sheet.getByRole('checkbox', { name: 'Duck group C' })
  const was = await duckC.getAttribute('aria-checked')
  await duckC.click()
  await expect(duckC).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true')
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toBeHidden()
})
