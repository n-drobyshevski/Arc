// The device view (web only): on a wide window Live draws the EP-133 K.O. II and
// the simulated device drives it; its keys act in arc or show their shortcuts.
import { demo, expect, test } from './fixtures'

test.use({ viewport: { width: 1440, height: 1000 } })

test('a wide Live draws the EP-133 and follows the device', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page).toHaveURL(/#\/live$/)
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(ep).toBeVisible()
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)

  // The clock lights PLAY and puts the tempo on the display.
  await demo(page, (d) => {
    d.clock(122)
    d.clock('start')
  })
  await expect(ep.getByRole('button', { name: /^PLAY, Playing$/ })).toBeVisible()
  // A pad played on the device glows on the drawn one.
  const pads = ep.locator('[data-pad]')
  await expect(pads).toHaveCount(12)
  await demo(page, (d) => d.noteOn(45, 127))
  await expect.poll(() => pads.evaluateAll((els) => els.filter((el) => Number((el as HTMLElement).style.getPropertyValue('--glow')) > 0.5).length)).toBe(1)
  await demo(page, (d) => {
    d.noteOff(45)
    d.clock('stop')
  })

  // A–D pick the group; + steps to the next one.
  await ep.getByRole('tab', { name: 'Group C' }).click()
  await expect(ep.getByRole('tab', { name: 'Group C' })).toHaveAttribute('aria-selected', 'true')
  await ep.getByRole('button', { name: 'Next group' }).click()
  await expect(ep.getByRole('tab', { name: 'Group D' })).toHaveAttribute('aria-selected', 'true')

  // KEYS turns the pads into notes, and − / + change the octave.
  await ep.getByRole('button', { name: 'Keys', exact: true }).click()
  await expect(ep.locator('[data-key]')).toHaveCount(12)
  await ep.getByRole('button', { name: 'Octave up' }).click()
  await ep.getByRole('button', { name: 'Keys', exact: true }).click()

  // RECORD arms REC.
  await ep.getByRole('button', { name: /^Record\. / }).click()
  await expect(ep.getByRole('button', { name: /^Record, waiting/ })).toBeVisible()
  await ep.getByRole('button', { name: /^Record, waiting/ }).click()

  // Any other key shows its shortcuts, and the guide opens searched for it.
  await ep.getByRole('button', { name: 'SOUND / EDIT' }).click()
  const card = page.getByRole('dialog', { name: 'SOUND on the EP-133' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /All SOUND shortcuts/ }).click()
  await expect(page.getByRole('region', { name: 'Shortcut guide' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Shortcut guide' }).getByRole('searchbox')).toHaveValue('SOUND')
})

test('the computer keyboard plays Live, and the tools stay open beside the device', async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(ep).toBeVisible()
  // Docked at this width: the tools are a column of their own, with the takes.
  const dock = page.getByRole('complementary', { name: 'Live tools' })
  await expect(dock).toBeVisible()
  await expect(dock.getByRole('region', { name: 'Takes' })).toBeVisible()

  await page.keyboard.press('F3')
  await expect(ep.getByRole('tab', { name: 'Group C' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Minus')
  await expect(ep.getByRole('tab', { name: 'Group B' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('KeyK')
  await expect(ep.locator('[data-key]')).toHaveCount(12)
  await page.keyboard.press('KeyK')
  await expect(ep.locator('[data-pad]')).toHaveCount(12)
  await page.keyboard.press('KeyR')
  await expect(ep.getByRole('button', { name: /^Record, waiting/ })).toBeVisible()
  await page.keyboard.press('KeyR')
  await expect(ep.getByRole('button', { name: /^Record\. / })).toBeVisible()
})

