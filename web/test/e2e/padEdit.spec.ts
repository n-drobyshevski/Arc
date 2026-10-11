// EDIT's pad sound settings end to end, on the simulated EP-133 of ?demo: SOUND
// turns EDIT on, a pad opens its sheet with PITCH and LEVEL over the page's
// knobs, read from the device; the knobs turn (their readouts follow), MODE
// decides whether ENV's RELEASE turns, and the sounds wait behind CHANGE SOUND.
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 915 } })

test('EDIT: a pad sound settings', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  await page.getByRole('switch', { name: /sound/i }).first().click()
  await page.locator('[data-pad="9"]').click()
  const sheet = page.getByRole('dialog', { name: 'Pad A 7' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Turns go on the EP-133')

  const pitch = sheet.getByRole('slider', { name: 'Pitch' })
  await expect(pitch).toBeEnabled()
  await pitch.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(pitch).toHaveAttribute('aria-valuetext', '-0.1')
  // A double click puts it back.
  await sheet.locator('.knob-slider__label', { hasText: /^Pitch$/ }).dblclick()
  await expect(pitch).toHaveAttribute('aria-valuetext', '0')

  // Oneshot plays to the end: ENV's release rests until the mode is Key.
  await sheet.getByRole('radio', { name: 'ENV' }).click()
  await expect(sheet).toContainText('Oneshot plays to the end')
  await expect(sheet.getByRole('slider', { name: 'Release' })).toBeDisabled()
  await sheet.getByRole('radio', { name: 'SOUND' }).click()
  const mode = sheet.getByRole('slider', { name: 'Mode' })
  await mode.focus()
  await page.keyboard.press('ArrowRight')
  await expect(mode).toHaveAttribute('aria-valuetext', 'Key')
  await sheet.getByRole('radio', { name: 'ENV' }).click()
  await expect(sheet.getByRole('slider', { name: 'Release' })).toBeEnabled()

  // The sounds fold away while the settings show.
  await expect(sheet.getByRole('searchbox')).toHaveCount(0)
  await sheet.getByRole('button', { name: /change sound/i }).click()
  await expect(sheet.getByRole('button', { name: /hide sounds/i })).toBeVisible()
})
