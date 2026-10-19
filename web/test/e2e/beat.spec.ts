// BEAT CARDS end to end, on the simulated EP-133 of ?demo: Live tools' CLAUDE section
// (its shares dimmed with no notes, PASTE BEAT), a beat card pasted on Live opening its
// sheet (the grid, where it goes, the tempo's SET key), IMPORT placing it with a toast, and
// PASTE BEAT reading the clipboard. A card of scenes imported sets a chain: SHARE CHAIN
// shares it, followed by the sound list while "With my sound list" is ticked; its sheet
// shows each scene and the chain, and with SET CHAIN off IMPORT leaves the chain. REPLACE
// on the Scenes row puts a card's scenes in the project's place from S01, and is kept for
// the next card. A card's
// SOUNDS and SILENT PADS: its sound ticked, a sound picked for a silent pad with PICK
// SOUND, both put on the pads by IMPORT; a silent pad with a name starts with a sound Arc
// suggests, until CHANGE picks another. A card's FX and PAD SHAPING: APPLY FX switched,
// a pad line ticked, and IMPORT applying the FX.
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 915 } })

const CARD = ['ARC BEAT 1', 'name Four on the floor', 'tempo 124', '[A]', 'A7 | X... X... X... X... |'].join('\n')
const SCENES = ['ARC BEAT 1', 'name Two', 'chain 1x2 2', '', 'scene One', '[A]', 'A7 | X... .... X... .... |', '', 'scene Two', '[A]', 'A7 | X.X. X.X. X.X. X.X. |'].join('\n')

test('BEAT CARDS: the CLAUDE section, a pasted card, IMPORT', async ({ page }) => {
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  await page.getByRole('button', { name: 'Live tools' }).click()
  const tools = page.getByRole('dialog', { name: 'Live tools' })
  const claude = tools.getByRole('region', { name: 'Claude' })
  await expect(claude).toBeVisible()
  // Nothing recorded yet: the shares are dimmed, and say so.
  await expect(claude.getByRole('button', { name: /^Share scene S01 with Claude, no notes yet$/ })).toBeDisabled()
  await expect(claude.getByRole('button', { name: /^Share A · 01 with Claude, no notes yet$/ })).toBeDisabled()
  await expect(claude.getByRole('button', { name: 'Paste a beat card from the clipboard' })).toBeEnabled()
  await expect(claude.getByRole('link', { name: 'Get the arc-beats skill' })).toHaveAttribute('href', '/arc-beats-skill.zip')

  // A card pasted on Live opens its sheet.
  await page.keyboard.press('Escape')
  await expect(tools).toBeHidden()
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, CARD)
  const sheet = page.getByRole('dialog', { name: 'Four on the floor' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('group', { name: /^Group A/ })).toBeVisible()
  await expect(sheet).toContainText('A · 02')
  // The tempo's SET key, OFF to begin with: the row keeps Arc's tempo with the card's beside it, and on says the change.
  const chip = sheet.getByRole('switch', { name: /^Keep the tempo at \d+, the card says 124$/ })
  await expect(chip).toHaveAttribute('aria-checked', 'false')
  await expect(chip).toHaveText('SetOff')
  await expect(sheet).toContainText(/\d+ · card 124/)
  await chip.click()
  const set = sheet.getByRole('switch', { name: /^Set the tempo to 124, now \d+$/ })
  await expect(set).toHaveAttribute('aria-checked', 'true')
  await expect(set).toHaveText('SetOn')
  await expect(sheet).toContainText(/\d+ → 124/)
  await sheet.getByRole('button', { name: 'Import' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: /^Imported to A · 02/ })).toBeVisible()

  // PASTE BEAT reads the clipboard: the same card again goes to the next free pattern.
  await page.evaluate((text) => {
    Object.defineProperty(navigator.clipboard, 'readText', { configurable: true, value: async () => text })
  }, CARD)
  await page.getByRole('button', { name: 'Live tools' }).click()
  await tools.getByRole('button', { name: 'Paste a beat card from the clipboard' }).click()
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('A · 03')
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet).toBeHidden()
})

test('SHARE CHAIN: a card of scenes sets the chain, shared with the sound list or without it', async ({ page }) => {
  await page.addInitScript(() => {
    const sent: string[] = []
    ;(window as unknown as { sent: string[] }).sent = sent
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: { text?: string }) => void sent.push(d.text ?? '') })
  })
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  await page.getByRole('button', { name: 'Live tools' }).click()
  const tools = page.getByRole('dialog', { name: 'Live tools' })
  const claude = tools.getByRole('region', { name: 'Claude' })
  // No chain yet: no SHARE CHAIN. The demo EP-133's sounds are known: the tick box is on.
  await expect(claude.getByRole('button', { name: /^Share the chain with Claude/ })).toHaveCount(0)
  const tick = claude.getByRole('checkbox', { name: /^With my sound list · \d+ sounds$/ })
  await expect(tick).toBeChecked()

  await page.keyboard.press('Escape')
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, SCENES)
  const sheet = page.getByRole('dialog', { name: 'Two' })
  await sheet.getByRole('button', { name: 'Import' }).click()
  await expect(sheet).toBeHidden()

  await page.getByRole('button', { name: 'Live tools' }).click()
  const share = claude.getByRole('button', { name: 'Share the chain with Claude, 2 steps' })
  await expect(share).toHaveText(/share chain · 2 scenes/i)
  await share.click()
  const sent = (): Promise<string[]> => page.evaluate(() => (window as unknown as { sent: string[] }).sent)
  await expect.poll(async () => (await sent()).length).toBe(1)
  const [withList] = await sent()
  expect(withList).toContain('name Chain\n')
  expect(withList).toContain("\n```\n\nMy EP-133's sounds (slot name), from the EP-133:\n")
  // Unticked: the card alone.
  await tick.click()
  await expect(tick).not.toBeChecked()
  await share.click()
  await expect.poll(async () => (await sent()).length).toBe(2)
  const plain = (await sent())[1]!
  expect(plain).not.toContain("My EP-133's sounds")
  expect(plain.endsWith('\n```\n')).toBe(true)
})

test("SCENES and SET CHAIN: a card's scenes under their titles, a row for each, and SET CHAIN off keeps the project's chain", async ({ page }) => {
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, SCENES)
  const sheet = page.getByRole('dialog', { name: 'Two' })
  await expect(sheet).toBeVisible()
  // Each scene's grids under its title, and a row saying the new scene it becomes.
  await expect(sheet.getByRole('heading', { name: 'Scene 1 \u00B7 One' })).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'Scene 2 \u00B7 Two' })).toBeVisible()
  await expect(sheet.getByRole('note', { name: /^Scene 1, One, becomes S02, patterns A \d+, B \d+, C \d+, D \d+$/ })).toBeVisible()
  await expect(sheet.getByRole('note', { name: /^Scene 2, Two, becomes S03, patterns / })).toBeVisible()
  // The chain on the new scenes, set by IMPORT unless SET CHAIN is off.
  await expect(sheet).toContainText('S02\u00D72 \u2192 S03')
  const setChain = sheet.getByRole('switch', { name: "Set the project's chain from the card, 2 steps" })
  await expect(setChain).toHaveAttribute('aria-checked', 'true')
  await expect(sheet).toContainText("Replaces this project's chain with the card's")
  await setChain.click()
  await expect(sheet.getByRole('switch', { name: "Leave the project's chain as it is, 2 steps" })).toHaveAttribute('aria-checked', 'false')
  await expect(sheet).not.toContainText("Replaces this project's chain with the card's")

  await sheet.getByRole('button', { name: 'Import' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'Imported to scenes S02\u2013S03. UNDO takes it back.' })).toBeVisible()
  // No chain was set: nothing for SHARE CHAIN.
  await page.getByRole('button', { name: 'Live tools' }).click()
  const claude = page.getByRole('dialog', { name: 'Live tools' }).getByRole('region', { name: 'Claude' })
  await expect(claude).toBeVisible()
  await expect(claude.getByRole('button', { name: /^Share the chain with Claude/ })).toHaveCount(0)
})

test("REPLACE: a card's scenes take the project's place from S01, the choice kept for the next card", async ({ page }) => {
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  const paste = (): Promise<void> =>
    page.evaluate((text) => {
      const data = new DataTransfer()
      data.setData('text/plain', text)
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
    }, SCENES)
  await paste()
  const sheet = page.getByRole('dialog', { name: 'Two' })
  await expect(sheet).toBeVisible()
  // Off to begin with: the card's scenes follow the project's one.
  await expect(sheet).toContainText('After S01')
  const replace = sheet.getByRole('switch', { name: "Add the card's scenes after the project's 1 scene" })
  await expect(replace).toHaveAttribute('aria-checked', 'false')
  await replace.click()
  // On: the rows, the chain and the line under the plate say where they go now.
  await expect(sheet.getByRole('switch', { name: "Replace the project's 1 scene with the card's" })).toHaveAttribute('aria-checked', 'true')
  await expect(sheet).toContainText('Replace S01')
  await expect(sheet.getByRole('note', { name: /^Scene 1, One, becomes S01, patterns / })).toBeVisible()
  await expect(sheet.getByRole('note', { name: /^Scene 2, Two, becomes S02, patterns / })).toBeVisible()
  await expect(sheet).toContainText('S01\u00D72 \u2192 S02')
  await expect(sheet).toContainText("The card's scenes take the place of this project's 1 scene, from S01.")

  await sheet.getByRole('button', { name: 'Import' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: 'Imported to scenes S01\u2013S02. Chain set. UNDO takes it back.' })).toBeVisible()
  // The next card's sheet opens with REPLACE still on, now over the project's two scenes.
  await paste()
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('switch', { name: "Replace the project's 2 scenes with the card's" })).toHaveAttribute('aria-checked', 'true')
  await expect(sheet).toContainText('Replace S01\u2013S02')
})

test('SOUNDS and SILENT PADS: a card\'s sound and one picked for a silent pad go on the pads with IMPORT', async ({ page }) => {
  const card = ['ARC BEAT 1', 'name Snare swap', '[A]', 'sound A2 2 snare', 'A2 | X... X... X... X... |', '[D]', 'D9 | X... .... X... .... |'].join('\n')
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, card)
  const sheet = page.getByRole('dialog', { name: 'Snare swap' })
  await expect(sheet).toBeVisible()
  const sounds = sheet.getByRole('group', { name: 'Sounds' })
  await expect(sounds.getByRole('checkbox', { name: /^A2: .*002 snare$/ })).toHaveAttribute('aria-checked', 'true')
  // PUT ON PADS off leaves them all as they are; on again, ticked again.
  const put = sounds.getByRole('switch', { name: 'Put 1 sound on the pads' })
  await put.click()
  await expect(sounds.getByRole('switch', { name: "Leave the pads' sounds as they are" })).toHaveAttribute('aria-checked', 'false')
  await expect(sounds.getByRole('checkbox')).toBeDisabled()
  await sounds.getByRole('switch').click()
  await expect(sounds.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')

  // D9 has no sound: PICK SOUND swaps the sheet for the sound list, and a pick comes back as a ticked SOUNDS row.
  const silent = sheet.getByRole('group', { name: 'Silent pads' })
  await expect(silent.getByRole('note', { name: 'D9: 2 notes, no sound, they will be silent' })).toBeVisible()
  await silent.getByRole('button', { name: 'Pick a sound for D9' }).click()
  const picker = page.getByRole('dialog', { name: 'Sound for D9' })
  await expect(picker).toBeVisible()
  // The key that opened it is gone: focus is on the picker's title, and back on the pad's key after.
  await expect(picker.getByRole('heading', { name: 'Sound for D9' })).toBeFocused()
  await picker.getByRole('button', { name: /^003/ }).click()
  await expect(sheet).toBeVisible()
  await expect(silent.getByRole('note', { name: /^D9: will get 003 / })).toBeVisible()
  await expect(silent.getByRole('button', { name: /^Pick another sound for D9, now 003 / })).toBeFocused()
  await expect(sounds.getByRole('checkbox', { name: /^D9: No sound becomes 003 / })).toHaveAttribute('aria-checked', 'true')
  await expect(sheet).toContainText(/Writes 2 pads in project \d+ on the EP-133/)

  await sheet.getByRole('button', { name: 'Import' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: /^Imported to scene S02 and 2 sounds\./ })).toBeVisible()
})

test('SILENT PADS suggests a sound by the row\'s name, marked SUGGESTED until another is picked', async ({ page }) => {
  const card = ['ARC BEAT 1', 'name Kick in', '[D]', 'D9 kick | X... .... X... .... |'].join('\n')
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, card)
  const sheet = page.getByRole('dialog', { name: 'Kick in' })
  await expect(sheet).toBeVisible()
  const silent = sheet.getByRole('group', { name: 'Silent pads' })
  // Picked to begin with, said so, and a ticked SOUNDS row like any pick.
  const suggested = silent.getByRole('note', { name: /^D9: will get .*, suggested$/ })
  await expect(suggested).toBeVisible()
  await expect(silent).toContainText('Suggested')
  await expect(sheet).toContainText("Arc suggested a sound for these pads from your library, by the card's names for them.")
  const sounds = sheet.getByRole('group', { name: 'Sounds' })
  await expect(sounds.getByRole('checkbox', { name: /^D9: No sound becomes / })).toHaveAttribute('aria-checked', 'true')
  // Unticked under SOUNDS, the pad is silent again; ticked, suggested again.
  await sounds.getByRole('checkbox', { name: /^D9: No sound becomes / }).click()
  await expect(silent.getByRole('note', { name: 'D9: 2 notes, no sound, they will be silent' })).toBeVisible()
  await sounds.getByRole('checkbox', { name: /^D9: No sound becomes / }).click()
  await expect(suggested).toBeVisible()
  // CHANGE picks another: no longer the suggestion.
  await silent.getByRole('button', { name: /^Pick another sound for D9, now / }).click()
  const picker = page.getByRole('dialog', { name: 'Sound for D9' })
  await picker.getByRole('button', { name: /^003/ }).click()
  await expect(silent.getByRole('note', { name: /^D9: will get 003 [^,]*$/ })).toBeVisible()
  await expect(silent).not.toContainText('Suggested')
  await expect(sheet).toContainText('A pad with no sound plays nothing.')

  await sheet.getByRole('button', { name: 'Import' }).click()
  await expect(sheet).toBeHidden()
})

test("FX and PAD SHAPING: the card's FX old to new with APPLY FX, its pad line ticked, applied by IMPORT", async ({ page }) => {
  const card = ['ARC BEAT 1', 'name Shaped', 'fx reverb 60 40', 'send A 40', '[A]', 'pad A7 pitch +2 level 90', 'A7 | X... X... X... X... |'].join('\n')
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, card)
  const sheet = page.getByRole('dialog', { name: 'Shaped' })
  await expect(sheet).toBeVisible()
  const fx = sheet.getByRole('group', { name: 'FX' })
  await expect(fx.getByRole('note', { name: /^Effect: OFF becomes REVERB/ })).toBeVisible()
  await expect(fx.getByRole('note', { name: /^Sends: A 0 .* becomes A 40%/ })).toBeVisible()
  await expect(sheet).toContainText("Replaces this project's FX on the phone")
  // APPLY FX off leaves the project's FX; on again for the import.
  await fx.getByRole('switch', { name: "Apply the card's FX to this project" }).click()
  await expect(fx.getByRole('switch', { name: "Leave this project's FX as they are" })).toHaveAttribute('aria-checked', 'false')
  await expect(sheet).not.toContainText("Replaces this project's FX on the phone")
  await fx.getByRole('switch').click()

  const shaping = sheet.getByRole('group', { name: 'Pad shaping' })
  const row = shaping.getByRole('checkbox', { name: /^A7: .* becomes .*Level 90/ })
  await expect(row).toHaveAttribute('aria-checked', 'true')
  await row.click()
  await expect(row).toHaveAttribute('aria-checked', 'false')
  await expect(sheet).not.toContainText("Writes the ticked pads' settings on the EP-133")
  await row.press('Space')
  await expect(row).toHaveAttribute('aria-checked', 'true')
  await expect(sheet).toContainText("Writes the ticked pads' settings on the EP-133")

  await sheet.getByRole('button', { name: 'Import' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: /^Imported to A · 02\. FX/ })).toBeVisible()
})
