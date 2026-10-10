// The device view (web only): on the desk, Live tools' View has a third choice
// that draws the EP-133 K.O. II, which the simulated device drives; its keys
// act in arc or show their shortcuts.
import { demo, expect, test } from './fixtures'

test.use({ viewport: { width: 1440, height: 1000 } })

test('the Device view draws the EP-133 and follows the device', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page).toHaveURL(/#\/live$/)
  // The desk's own layout is the default.
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(ep).toHaveCount(0)
  await page.getByRole('radio', { name: 'Device' }).click()
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
  await expect(pads).toHaveCount(12)

  // TAKE in the tools shows on the drawn plate.
  const takes = page.getByRole('region', { name: 'Takes' })
  await takes.getByRole('button', { name: /^Take\. / }).click()
  await expect(page.locator('.ep-plate__status')).toHaveText(/take armed/i)
  await takes.getByRole('button', { name: /^Take, waiting/ }).click()
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)

  // RECORD (the pattern's, which the web has not) and the other keys show their shortcuts.
  await ep.getByRole('button', { name: 'RECORD' }).click()
  await expect(page.getByRole('dialog', { name: 'RECORD on the EP-133' })).toBeVisible()
  await ep.getByRole('button', { name: 'SOUND / EDIT' }).click()
  const card = page.getByRole('dialog', { name: 'SOUND on the EP-133' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /All SOUND shortcuts/ }).click()
  await expect(page.getByRole('region', { name: 'Shortcut guide' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Shortcut guide' }).getByRole('searchbox')).toHaveValue('SOUND')
})

test('the Device view is kept for the next visit', async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('radio', { name: 'Device' }).click()
  await expect(page.getByRole('group', { name: 'EP-133 K.O. II' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('group', { name: 'EP-133 K.O. II' })).toBeVisible()
  await page.getByRole('radio', { name: 'All groups' }).click()
  await expect(page.getByRole('group', { name: 'EP-133 K.O. II' })).toHaveCount(0)
})
