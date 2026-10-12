// The device view (web only): on the desk Live draws the EP-133 K.O. II by
// default (Live tools' View: All groups, One group, Device), which the
// simulated device drives; its keys are Live's (SOUND, MAIN as PROJECT, TEMPO,
// SAMPLE, FX, ERASE, KEYS, RECORD, PLAY) or show their shortcuts.
import { demo, expect, test } from './fixtures'

test.use({ viewport: { width: 1440, height: 1000 } })

test('the Device view draws the EP-133 and follows the device', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page).toHaveURL(/#\/live$/)
  // The desk's default.
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(ep).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Device' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)

  // The clock lights the display's ▶ and puts the tempo on it.
  await demo(page, (d) => {
    d.clock(122)
    d.clock('start')
  })
  await expect(page.locator('.ep-play')).toHaveClass(/is-on/)
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

  // RECORD is the pattern's: a tap arms it, another disarms (pattern.spec.ts plays it).
  await ep.getByRole('button', { name: 'Record, off' }).click()
  await ep.getByRole('button', { name: 'Record, armed' }).click()
  await expect(ep.getByRole('button', { name: 'Record, off' })).toBeVisible()

  // The keys arc has nothing for show their shortcuts.
  await ep.getByRole('button', { name: 'TIMING / CORRECT' }).click()
  const card = page.getByRole('dialog', { name: 'TIMING on the EP-133' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /All TIMING shortcuts/ }).click()
  await expect(page.getByRole('region', { name: 'Shortcut guide' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Shortcut guide' }).getByRole('searchbox')).toHaveValue('TIMING')
})

test("the drawn keys are Live's: SOUND, MAIN as PROJECT, ERASE, SAMPLE, FX, and the line's STEP", async ({ page }) => {
  // The mic refused: RSP stands in, with no permission prompt.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  })
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)

  // SOUND turns EDIT on: the line says so, the pads are marked, a tap opens the pad's sheet.
  const sound = ep.getByRole('switch', { name: 'Sound' })
  await sound.click()
  await expect(sound).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.live-strip--edit')).toBeVisible()
  await expect(ep.locator('[data-pad].is-editing')).toHaveCount(12)
  await ep.locator('[data-pad="9"]').click()
  const sheet = page.getByRole('dialog', { name: /^Pad A 7/ })
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await sound.click()
  await expect(sound).toHaveAttribute('aria-checked', 'false')

  // MAIN is PROJECT: a tap steps to the next project.
  await ep.getByRole('button', { name: 'Project' }).click()
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 2/i)

  // ERASE latches on and off.
  const erase = ep.getByRole('button', { name: 'Erase' })
  await erase.click()
  await expect(erase).toHaveAttribute('aria-pressed', 'true')
  await erase.click()
  await expect(erase).toHaveAttribute('aria-pressed', 'false')

  // SAMPLE opens its panel over the device's top; again closes it.
  const sample = ep.getByRole('button', { name: 'SAMPLE / CHOP' })
  await sample.click()
  const panel = page.locator('.ko-device__panel').getByRole('region', { name: 'Sample' })
  await expect(panel).toBeVisible()
  await expect(sample).toHaveAttribute('aria-pressed', 'true')
  await sample.click()
  await expect(panel).toHaveCount(0)

  // The line over the device has STEP: its panel unrolls over the device's top too.
  await page.getByRole('button', { name: 'Step editing' }).first().click()
  await expect(page.locator('.ko-device__panel').getByRole('region', { name: 'Step editing' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.ko-device__panel')).toHaveCount(0)

  // FX: a tap opens the FX sheet.
  await ep.getByRole('button', { name: 'Effects' }).click()
  await expect(page.getByRole('dialog', { name: 'FX' })).toBeVisible()
})

test('the grid chosen instead is kept for the next visit, and the Device view again', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.getByRole('group', { name: 'EP-133 K.O. II' })).toBeVisible()
  await page.getByRole('radio', { name: 'All groups' }).click()
  await expect(page.getByRole('group', { name: 'EP-133 K.O. II' })).toHaveCount(0)
  await expect(page.locator('[data-pad]')).toHaveCount(48)
  // (The demo keeps no settings across a reload, so the grid comes back as One group; the view's choice is kept.)
  await page.reload()
  await expect(page.locator('[data-pad]').first()).toBeVisible()
  await expect(page.getByRole('group', { name: 'EP-133 K.O. II' })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Device' }).click()
  await page.reload()
  await expect(page.getByRole('group', { name: 'EP-133 K.O. II' })).toBeVisible()
})

test('the 1–99 grid lies over the drawn device, and A–D carry the numbers', async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(ep).toBeVisible()
  // The project's patterns in (they set the scene).
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  await expect(page.locator('.live-strip')).toContainText('Press a pad')
  await page.getByRole('button', { name: 'Scenes, scene 1 of 1' }).click()
  const panel = page.getByRole('region', { name: 'Scenes and patterns' })
  await panel.getByRole('button', { name: /^Group C, pattern 1.*Pick a pattern/ }).click()
  const grid = page.locator('.ko-device__box .scene-grid-over').getByRole('group', { name: /pattern grid/i })
  await expect(grid).toBeVisible()
  await grid.getByRole('button', { name: /^Pattern 7\b/ }).click()
  await expect(grid).toHaveCount(0)
  await expect(ep.getByRole('tab', { name: /^Group C, pattern 7$/ })).toContainText('07')
})
