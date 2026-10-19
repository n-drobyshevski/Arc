// BEAT CARDS end to end, on the simulated EP-133 of ?demo: Live tools' CLAUDE section
// (its shares dimmed with no notes, PASTE BEAT), a beat card pasted on Live opening its
// sheet (the grid, where it goes, the tempo chip), IMPORT placing it with a toast, and
// PASTE BEAT reading the clipboard. A card of scenes imported sets a chain: SHARE CHAIN
// shares it, followed by the sound list while "With my sound list" is ticked. A card's
// SOUNDS and SILENT PADS: its sound ticked, a sound picked for a silent pad with PICK
// SOUND, both put on the pads by IMPORT.
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
  const chip = sheet.getByRole('switch')
  await expect(chip).toHaveAttribute('aria-checked', 'false')
  await chip.click()
  await expect(chip).toHaveAttribute('aria-checked', 'true')
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
