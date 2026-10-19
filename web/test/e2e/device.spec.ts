// The device view (web only): on the desk Live draws the EP-133 K.O. II by
// default (Live tools' View: All groups, One group, Device), which the
// simulated device drives; its keys take the device's combos (pages on the
// display and the plate, keys held, right-click latches, SHIFT, − / + by what
// is held or shown), and its knobs and fader turn arc's own sound (VOLUME,
// what is held, open or shown, the shown group's level), a tap still showing
// their shortcuts.
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
  // Its group's LED lights at half while another group is shown.
  await ep.getByRole('tab', { name: 'Group C' }).click()
  const ledA = ep.locator('.ep-led--group[data-group="0"]')
  await expect.poll(() => ledA.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--glow'))).toBe('0.5')
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

  // A knob's card links to the guide, searched for it.
  await ep.getByRole('slider', { name: 'Knob X' }).click()
  const card = page.getByRole('dialog', { name: 'Knob X on the EP-133' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: /All Knob X shortcuts/ }).click()
  await expect(page.getByRole('region', { name: 'Shortcut guide' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Shortcut guide' }).getByRole('searchbox')).toHaveValue('knob X')
})

test("the drawn keys are the device's: SOUND, MAIN, ERASE, SAMPLE, FX, and the line's STEP", async ({ page }) => {
  // The mic refused: RSP stands in, with no permission prompt.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  })
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)

  // SOUND opens the SOUND page on the plate (no EDIT, no sheet); MAIN goes back, and steps no project.
  const sound = ep.getByRole('button', { name: 'Sound', exact: true })
  await sound.click()
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.ep-plate__page')).toHaveText(/^SOUND/)
  await expect(ep.locator('[data-pad].is-editing')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await ep.getByRole('button', { name: 'Main', exact: true }).click()
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)

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

  // FX: a tap opens the FX page (− / + the effect); its line on the plate opens the FX sheet.
  await ep.getByRole('button', { name: 'Effects' }).click()
  await expect(page.locator('.ep-plate__page')).toHaveText(/^FX · OFF/)
  await ep.getByRole('button', { name: 'Next effect' }).click()
  await expect(page.locator('.ep-plate__page')).toHaveText(/^FX · DELAY/)
  await expect(page.locator('.ep-plate__hit')).toHaveText('FX · DELAY')
  await page.locator('.ep-plate__page').click()
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

test("the knobs turn the effect's X and Y, and show it on the plate; a tap shows their shortcuts", async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)

  // An effect on, at its knobs' defaults: the FX page's + twice, then MAIN.
  const fxKey = ep.getByRole('button', { name: 'Effects' })
  const main = ep.getByRole('button', { name: 'Main', exact: true })
  await fxKey.click()
  await ep.getByRole('button', { name: 'Next effect' }).click()
  await ep.getByRole('button', { name: 'Next effect' }).click()
  await page.locator('.ep-plate__page').click()
  const sheet = page.getByRole('dialog', { name: 'FX' })
  const xy = sheet.getByRole('group', { name: 'X and Y' })
  await expect(xy).toHaveAttribute('aria-description', /^Reverb, Size 50%/)
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toBeHidden()
  await main.click()

  // A drag up and to the right turns knob X up: the plate's hit line says so, and so does the FX sheet.
  const knobX = ep.getByRole('slider', { name: 'Knob X' })
  await expect(knobX).toHaveAttribute('aria-valuenow', '0.5')
  await expect(knobX).toHaveAttribute('aria-valuetext', 'Reverb size, 50%')
  const b = (await knobX.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 - 20, { steps: 4 })
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 - 40, { steps: 8 })
  await page.mouse.up()
  const turned = Number(await knobX.getAttribute('aria-valuenow'))
  expect(turned).toBeGreaterThan(0.6)
  await expect(page.locator('.ep-plate__hit')).toHaveText(`SIZE · ${Math.round(turned * 100)}%`)
  // No card for a turn.
  await expect(page.getByRole('dialog', { name: 'Knob X on the EP-133' })).toHaveCount(0)
  await fxKey.click()
  await page.locator('.ep-plate__page').click()
  await expect(xy).toHaveAttribute('aria-description', new RegExp(`^Reverb, Size ${Math.round(turned * 100)}%`))
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toBeHidden()
  await main.click()

  // The keys step the focused knob: arrows, then its ends; a double click puts it back.
  const knobY = ep.getByRole('slider', { name: 'Knob Y' })
  await knobY.focus()
  await page.keyboard.press('ArrowUp')
  await expect(knobY).toHaveAttribute('aria-valuenow', '0.51')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(knobY).toHaveAttribute('aria-valuenow', '0.49')
  await page.keyboard.press('End')
  await expect(knobY).toHaveAttribute('aria-valuenow', '1')
  await knobY.dblclick()
  await expect(knobY).toHaveAttribute('aria-valuenow', '0.5')
  // Not Live's keys: the group stays.
  await expect(ep.getByRole('tab', { name: 'Group A' })).toHaveAttribute('aria-selected', 'true')

  // A tap, or Enter, still shows a control's shortcuts.
  await knobX.click()
  const cardX = page.getByRole('dialog', { name: 'Knob X on the EP-133' })
  await expect(cardX).toBeVisible()
  await expect(cardX).toContainText("Turn it for the effect's X in arc")
  await cardX.getByRole('button', { name: 'Close' }).click()
  await ep.getByRole('slider', { name: 'Volume' }).click()
  await expect(page.getByRole('dialog', { name: 'VOLUME on the EP-133' })).toBeVisible()
  await page.keyboard.press('Escape')
  await ep.getByRole('slider', { name: 'Fader' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'FADER on the EP-133' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'FADER on the EP-133' })).toHaveCount(0)
})

test("the fader is the shown group's level, and moves with the group", async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  const fader = ep.getByRole('slider', { name: 'Fader' })
  const cap = page.locator('.ep-fader__cap')
  await expect(fader).toHaveAttribute('aria-valuenow', '1')

  // Group B's: the cap dragged down lowers it, and it says so.
  await ep.getByRole('tab', { name: 'Group B' }).click()
  const top = (await cap.boundingBox())!
  await page.mouse.move(top.x + top.width / 2, top.y + top.height / 2)
  await page.mouse.down()
  await page.mouse.move(top.x + top.width / 2, top.y + top.height / 2 + 10, { steps: 3 })
  await page.mouse.move(top.x + top.width / 2, top.y + top.height / 2 + 40, { steps: 8 })
  await page.mouse.up()
  const level = Number(await fader.getAttribute('aria-valuenow'))
  expect(level).toBeLessThan(0.9)
  expect(level).toBeGreaterThan(0.2)
  expect((await cap.boundingBox())!.y).toBeGreaterThan(top.y + 20)
  await expect(fader).toHaveAttribute('aria-valuetext', `group B's level, ${Math.round(level * 100)}%`)
  await expect(page.locator('.ep-plate__hit')).toHaveText(`GROUP B · ${Math.round(level * 100)}`)

  // Group A keeps its own; B's comes back with B.
  await ep.getByRole('tab', { name: 'Group A' }).click()
  await expect(fader).toHaveAttribute('aria-valuenow', '1')
  expect((await cap.boundingBox())!.y).toBeCloseTo(top.y, 0)
  await ep.getByRole('tab', { name: 'Group B' }).click()
  await expect(fader).toHaveAttribute('aria-valuenow', String(level))
  // The keys: ten steps down, then the bottom.
  await fader.focus()
  await page.keyboard.press('PageDown')
  await expect(fader).toHaveAttribute('aria-valuenow', String(Math.round((level - 0.1) * 100) / 100))
  await page.keyboard.press('Home')
  await expect(fader).toHaveAttribute('aria-valuenow', '0')
})

test('with the pad sheet open, knob X and Y follow its page', async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  const knobX = page.locator('.ep-knob--x')
  const knobY = page.locator('.ep-knob--y')
  await expect(knobX).toHaveAttribute('aria-valuetext', 'effect X, 50%')

  // A right-click on a pad opens its sheet (the desk's).
  await ep.locator('[data-pad="9"]').click({ button: 'right' })
  const sheet = page.getByRole('dialog', { name: /^Pad A 7/ })
  await expect(sheet).toBeVisible()
  const mode = sheet.getByRole('slider', { name: 'Mode' })
  await expect(mode).toBeEnabled()
  // SOUND's page: X is the play mode, Y the pan.
  await expect(knobX).toHaveAttribute('aria-valuetext', new RegExp(`^Mode, ${await mode.getAttribute('aria-valuetext')}$`))
  await expect(knobY).toHaveAttribute('aria-valuetext', /^Pan, /)
  const before = await knobX.getAttribute('aria-valuenow')
  await mode.focus()
  await page.keyboard.press(before === '0' ? 'ArrowRight' : 'ArrowLeft')
  await expect(knobX).not.toHaveAttribute('aria-valuenow', before!)
  await expect(knobX).toHaveAttribute('aria-valuetext', new RegExp(`^Mode, ${await mode.getAttribute('aria-valuetext')}$`))
  // ENV's: attack and release; MIDI has no Y.
  await sheet.getByRole('radio', { name: /^Env/i }).click()
  await expect(knobX).toHaveAttribute('aria-valuetext', /^Attack, /)
  await expect(knobY).toHaveAttribute('aria-valuetext', /^Release, /)
  await sheet.getByRole('radio', { name: /^Midi/i }).click()
  await expect(knobX).toHaveAttribute('aria-valuetext', /^Channel, /)
  await expect(knobY).toHaveAttribute('aria-disabled', 'true')
  // Closed: the effect's again.
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(knobX).toHaveAttribute('aria-valuetext', 'effect X, 50%')
})

test('VOLUME is kept in this browser', async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  const volume = ep.getByRole('slider', { name: 'Volume' })
  await expect(volume).toHaveAttribute('aria-valuenow', '1')
  await volume.focus()
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await page.keyboard.press('ArrowDown')
  await expect(volume).toHaveAttribute('aria-valuenow', '0.79')
  await expect(volume).toHaveAttribute('aria-valuetext', "arc's volume, 79%")
  await expect(page.locator('.ep-plate__hit')).toHaveText('VOLUME · 79')
  await page.reload()
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  await expect(ep.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuenow', '0.79')
})

/** The drawn device's pad A "." linked to its sound (001 kick), as the device pushes it when played; it is the pad played last. */
async function kickPad(page: import('@playwright/test').Page): Promise<import('@playwright/test').Locator> {
  await demo(page, (d) => {
    d.noteOn(36, 127)
    d.pushPadActive(1, 0, 1)
  })
  await demo(page, (d) => d.noteOff(36))
  const pad = page.getByRole('group', { name: 'EP-133 K.O. II' }).locator('[data-pad]', { hasText: 'kick' }).first()
  await expect(pad).toBeVisible()
  return pad
}

test("SOUND's page: − / + step the played pad's sound, shown at once and put on the pad once they rest", async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  await (await kickPad(page)).click()
  await ep.getByRole('button', { name: 'Sound', exact: true }).click()
  const line = page.locator('.ep-plate__page')
  await expect(line).toHaveText('SOUND · A . — X LEVEL · Y PITCH · −/+ SOUND')
  // Knob X is the pad's LEVEL, Y its PITCH.
  await expect(ep.getByRole('slider', { name: 'Knob X' })).toHaveAttribute('aria-valuetext', /^Level, /)
  await expect(ep.getByRole('slider', { name: 'Knob Y' })).toHaveAttribute('aria-valuetext', /^Pitch, /)
  // +: the slot and its name show at once; the pad takes it once the stepping rests, with UNDO.
  await ep.getByRole('button', { name: 'Next sound' }).click()
  await expect(page.locator('.ep-plate__hit')).toHaveText(/^002 /)
  await expect(page.getByRole('status')).toContainText('Pad A .:')
  await expect(ep.locator('[data-pad]', { hasText: 'kick' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(ep.locator('[data-pad]', { hasText: 'kick' })).toHaveCount(1)
  // Esc goes back to MAIN.
  await page.keyboard.press('Escape')
  await expect(line).toHaveCount(0)
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
})

test('SHIFT + SOUND is EDIT: − / + its pages, knob X their X; the sheet opens on the same page', async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  await (await kickPad(page)).click()
  // SHIFT clicked is held for the next key.
  const shift = ep.getByRole('button', { name: 'Shift', exact: true })
  await shift.click()
  await expect(shift).toHaveAttribute('aria-pressed', 'true')
  await ep.getByRole('button', { name: 'Sound', exact: true }).click()
  await expect(shift).toHaveAttribute('aria-pressed', 'false')
  const line = page.locator('.ep-plate__page')
  await expect(line).toHaveText(/^EDIT · SOUND — X MODE · Y PAN/)
  const knobX = ep.getByRole('slider', { name: 'Knob X' })
  await expect(knobX).toHaveAttribute('aria-valuetext', /^Mode, /)
  await ep.getByRole('button', { name: 'Next page' }).click()
  await ep.getByRole('button', { name: 'Next page' }).click()
  await expect(line).toHaveText(/^EDIT · ENV — X ATTACK · Y RELEASE/)
  await expect(knobX).toHaveAttribute('aria-valuetext', /^Attack, /)
  await expect(knobX).not.toHaveAttribute('aria-disabled', 'true')
  const before = Number(await knobX.getAttribute('aria-valuenow'))
  await knobX.focus()
  await page.keyboard.press('ArrowUp')
  await expect(knobX).toHaveAttribute('aria-valuenow', String(before + 1))
  await expect(page.locator('.ep-plate__hit')).toHaveText(/^ATTACK · /)
  // The line opens the pad's sheet, on ENV.
  await line.click()
  const sheet = page.getByRole('dialog', { name: /^Pad A \./ })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('radio', { name: /^Env/i })).toHaveAttribute('aria-checked', 'true')
  // Opened anywhere else (MAIN, a right-click), a pad's sheet opens on SOUND, as before.
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await ep.getByRole('button', { name: 'Main', exact: true }).click()
  await ep.locator('[data-pad="0"]').click({ button: 'right' })
  await expect(sheet.getByRole('radio', { name: /^Sound/i })).toHaveAttribute('aria-checked', 'true')
})

test('KEYS latched by a right-click: knob Y the scale, − / + the octave, let go with no switch', async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  const keys = ep.getByRole('button', { name: 'Keys', exact: true })
  await keys.click({ button: 'right' })
  await expect(keys).toHaveAttribute('aria-pressed', 'true')
  const knobY = ep.getByRole('slider', { name: 'Knob Y' })
  await expect(knobY).toHaveAttribute('aria-valuetext', "KEYS' scale, Chromatic")
  await knobY.focus()
  await page.keyboard.press('ArrowUp')
  await expect(knobY).toHaveAttribute('aria-valuetext', "KEYS' scale, Major")
  await expect(page.locator('.ep-plate__hit')).toHaveText(/^SCALE · major$/i)
  await ep.getByRole('button', { name: 'Octave up' }).click()
  await expect(page.locator('.ep-plate__hit')).toHaveText(/^OCT \d$/)
  // Let go: still PADS (a latched key is no tap), and the knob is the effect's again.
  await keys.click({ button: 'right' })
  await expect(keys).toHaveAttribute('aria-pressed', 'false')
  await expect(ep.locator('[data-pad]')).toHaveCount(12)
  await expect(knobY).toHaveAttribute('aria-valuetext', 'effect Y, 50%')
  // KEYS' scale is Major now.
  await keys.click()
  await expect(ep.locator('[data-key]')).toHaveCount(12)
})

test('TEMPO: its page, its taps the tempo, knob X the tempo; MAIN back', async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  const tempo = ep.getByRole('button', { name: 'Tempo', exact: true })
  await tempo.click()
  const line = page.locator('.ep-plate__page')
  await expect(line).toHaveText(/^TEMPO · \d+ — X TEMPO · Y CLICK · TAP TEMPO$/)
  await expect(tempo).toHaveAttribute('aria-pressed', 'true')
  // Taps half a second apart: about 120 (each click takes a moment of its own).
  for (let i = 0; i < 4; i++) {
    await tempo.click()
    await page.waitForTimeout(500)
  }
  await expect(page.locator('.ep-plate__hit')).toHaveText(/^TEMPO · (9\d|1[0-2]\d)$/)
  const knobX = ep.getByRole('slider', { name: 'Knob X' })
  await expect(knobX).toHaveAttribute('aria-valuetext', /^tempo, /)
  await knobX.focus()
  await page.keyboard.press('End')
  await expect(line).toHaveText(/^TEMPO · 240 /)
  await ep.getByRole('button', { name: 'Main', exact: true }).click()
  await expect(line).toHaveCount(0)
  await expect(knobX).toHaveAttribute('aria-valuetext', 'effect X, 50%')
})

test("a group key latched: + steps its pattern, and pads type one; the computer's keys hold it too", async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  const b = ep.getByRole('tab', { name: /^Group B/ })
  await b.click({ button: 'right' })
  await expect(b).toHaveAttribute('aria-selected', 'true')
  await ep.getByRole('button', { name: 'Next pattern' }).click()
  await expect(page.locator('.ep-plate__hit')).toHaveText('GROUP B · 02')
  // B's pads 1 then 2: pattern 12 as B lets go.
  await ep.locator('[data-pad="15"]').click()
  await ep.locator('[data-pad="16"]').click()
  await b.click({ button: 'right' })
  await expect(page.locator('.ep-plate__hit')).toHaveText('GROUP B · 12')
  // C held on the keyboard, − steps its pattern (round to 99).
  await page.keyboard.down('c')
  await page.keyboard.press('-')
  await page.keyboard.up('c')
  await expect(ep.getByRole('tab', { name: /^Group C/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.ep-plate__hit')).toHaveText('GROUP C · 99')
})

test("the computer's Shift is SHIFT: Shift + SOUND is EDIT, Shift + FX OUTPUT and its + SIDECHAIN", async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  const shift = ep.getByRole('button', { name: 'Shift', exact: true })
  await page.keyboard.down('Shift')
  await expect(shift).toHaveAttribute('aria-pressed', 'true')
  await ep.getByRole('button', { name: 'Sound', exact: true }).click()
  await page.keyboard.up('Shift')
  await expect(shift).toHaveAttribute('aria-pressed', 'false')
  const line = page.locator('.ep-plate__page')
  await expect(line).toHaveText(/^EDIT/)
  await page.keyboard.down('Shift')
  await ep.getByRole('button', { name: 'Effects' }).click()
  await page.keyboard.up('Shift')
  await expect(line).toHaveText(/^OUTPUT — X DRIVE · Y SPEED/)
  await page.keyboard.press('=')
  await expect(line).toHaveText(/^SIDECHAIN — X LENGTH · Y SHAPE/)
  // What arc has nothing for says so: SHIFT + ERASE is the device's system settings.
  await shift.click()
  await ep.getByRole('button', { name: 'Erase' }).click()
  await expect(page.locator('.ep-plate__hit')).toHaveText('SYSTEM · NOT IN ARC')
  await expect(ep.getByRole('button', { name: 'Erase' })).toHaveAttribute('aria-pressed', 'false')
})

test('FADER latched + a pad gives the fader that parameter: its LED lit, the fader turns it', async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  const faderKey = ep.getByRole('button', { name: 'Fader key' })
  await faderKey.click({ button: 'right' })
  await expect(faderKey).toHaveAttribute('aria-pressed', 'true')
  // LEVEL's LED bright, the others arc has dim, TIME / VEL / MOD dark.
  await expect(page.locator('.ep-led--pad.is-on')).toHaveCount(1)
  await expect(page.locator('.ep-led--pad.is-avail')).toHaveCount(8)
  // The pad printed 4 is LPF.
  await ep.locator('[data-pad="6"]').click()
  await expect(page.locator('.ep-plate__hit')).toHaveText('FADER A · LPF')
  // TIME (over 9) isn't in arc.
  await ep.locator('[data-pad="11"]').click()
  await expect(page.locator('.ep-plate__hit')).toHaveText('TIME · NOT IN ARC')
  await faderKey.click({ button: 'right' })
  await expect(page.locator('.ep-led.is-avail')).toHaveCount(0)
  const fader = ep.getByRole('slider', { name: 'Fader' })
  await expect(fader).toHaveAttribute('aria-valuetext', "group A's LPF, OPEN")
  await fader.focus()
  await page.keyboard.press('PageDown')
  await expect(fader).toHaveAttribute('aria-valuenow', '0.9')
  await expect(page.locator('.ep-plate__hit')).toHaveText(/^LPF · \d/)
  // On the FX page the fader is the send; a group held, its level.
  await ep.getByRole('button', { name: 'Effects' }).click()
  await expect(fader).toHaveAttribute('aria-valuetext', /^group A's send to the effect/)
  await ep.getByRole('button', { name: 'Main', exact: true }).click()
  await expect(fader).toHaveAttribute('aria-valuetext', /^group A's LPF/)
})

test('FX latched + a group tap soloes it: MUTE lights, the other groups go dark; FX let go ends it', async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  const fx = ep.getByRole('button', { name: 'Effects' })
  const mute = page.locator('.ep-lcd .ep-mute')
  await expect(mute).not.toHaveClass(/\bon\b/)
  await fx.click({ button: 'right' })
  await ep.getByRole('tab', { name: /^Group C/ }).click()
  await expect(page.locator('.ep-plate__hit')).toHaveText('SOLO · C')
  await expect(mute).toHaveClass(/\bon\b/)
  await expect(page.locator('.ep-led--group[data-group="2"]')).toHaveClass(/is-on/)
  await expect(page.locator('.ep-led--group[data-group="0"]')).toHaveClass(/is-silenced/)
  // The tap soloed, it didn't pick the group.
  await expect(ep.getByRole('tab', { name: /^Group A/ })).toHaveAttribute('aria-selected', 'true')
  await fx.click({ button: 'right' })
  await expect(mute).not.toHaveClass(/\bon\b/)
  await expect(page.locator('.ep-led--group.is-silenced')).toHaveCount(0)
})

test("TEMPO's knob Y is the click's level: OFF at the bottom, turned up the click comes on", async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  await ep.getByRole('button', { name: 'Tempo', exact: true }).click()
  const knobY = ep.getByRole('slider', { name: 'Knob Y' })
  await expect(page.locator('.ep-plate__page')).toHaveText(/X TEMPO · Y CLICK/)
  await expect(knobY).toHaveAttribute('aria-valuetext', "the click's level, Off")
  await knobY.focus()
  await page.keyboard.press('End')
  await expect(knobY).toHaveAttribute('aria-valuetext', "the click's level, 100%")
  await expect(page.locator('.ep-lcd .ep-metro')).toHaveClass(/\bon\b/)
  await page.keyboard.press('Home')
  await expect(knobY).toHaveAttribute('aria-valuetext', "the click's level, Off")
  await expect(page.locator('.ep-plate__hit')).toHaveText('CLICK · OFF')
  await expect(page.locator('.ep-lcd .ep-metro')).not.toHaveClass(/\bon\b/)
})

test('leaving the Device view lets go of its latched keys: the solo ends, FX lets the grid play', async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  await ep.getByRole('button', { name: 'Effects' }).click({ button: 'right' })
  await ep.getByRole('tab', { name: /^Group B/ }).click()
  await expect(page.locator('.ep-lcd .ep-mute')).toHaveClass(/\bon\b/)
  await expect(ep.getByRole('tab', { name: /^Group A/ })).toHaveAttribute('aria-description', /^Silenced\./)
  await page.getByRole('radio', { name: 'All groups' }).click()
  // The grid's pads are pads again, not the punch-ins.
  await expect(page.locator('[data-pad]')).toHaveCount(48)
  await page.getByRole('radio', { name: 'Device' }).click()
  await expect(page.locator('.ep-lcd .ep-mute')).not.toHaveClass(/\bon\b/)
  await expect(page.getByRole('group', { name: 'EP-133 K.O. II' }).getByRole('button', { name: 'Effects' })).toHaveAttribute('aria-pressed', 'false')
})

test("a group key typed fast into a pad key on the keyboard plays the pad (it types a pattern only once held)", async ({ page }) => {
  await page.goto('/?demo')
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  await page.keyboard.down('b')
  await page.keyboard.down('Digit7')
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('[data-pad][data-down]')].map((e) => e.getAttribute('aria-label') ?? ''))).toEqual(['B 7'])
  await page.keyboard.up('Digit7')
  await page.keyboard.up('b')
  await expect(ep.getByRole('tab', { name: /^Group B/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.ep-plate__hit')).not.toHaveText(/GROUP B · 07/)
  // Held past the hold time, the pads type its pattern.
  await page.keyboard.down('b')
  await page.waitForTimeout(600)
  await page.keyboard.press('Digit7')
  await page.keyboard.up('b')
  await expect(page.locator('.ep-plate__hit')).toHaveText('GROUP B · 07')
})

test('EDIT left on in the grid goes as the Device view shows: SOUND page pads play, open no sheet', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  await page.getByRole('radio', { name: 'One group' }).click()
  await page.keyboard.press('e')
  await expect(page.locator('[data-pad].is-editing')).toHaveCount(12)
  await page.getByRole('radio', { name: 'Device' }).click()
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await ep.getByRole('button', { name: 'Sound', exact: true }).click()
  await expect(ep.locator('[data-pad].is-editing')).toHaveCount(0)
  await ep.locator('[data-pad="9"]').click()
  await page.waitForTimeout(300)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
