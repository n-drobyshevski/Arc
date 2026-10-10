// End-to-end: the computer keyboard on a desktop (web only: live/liveKeyboard.ts,
// appKeys.ts). Live's pads and controls in PADS and KEYS, the Keyboard keys
// sheet on ?, Esc for screens and EDIT, and Settings → Computer keyboard.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const downPads = (page: Page): Promise<string[]> =>
  page.evaluate(() => [...document.querySelectorAll('[data-pad][data-down]')].map((e) => e.getAttribute('aria-label') ?? ''))

test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })

test.beforeEach(async ({ page }) => {
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
})

test('PADS: pad keys hold pads, A–D pick the group, V the view, E EDIT and Esc', async ({ page }) => {
  // Hold 5 (the number row) and the pad goes down; let go and it comes up.
  await page.keyboard.down('Digit5')
  await expect.poll(() => downPads(page)).toEqual(['A 5'])
  // The number pad's 5 on the same pad: one key up doesn't let it go.
  await page.keyboard.down('Numpad5')
  await page.keyboard.up('Digit5')
  await page.waitForTimeout(120)
  expect(await downPads(page)).toEqual(['A 5'])
  await page.keyboard.up('Numpad5')
  await expect.poll(() => downPads(page)).toEqual([])

  // B picks group B, and screen readers hear it.
  await page.keyboard.press('KeyB')
  await expect(page.getByRole('tab', { name: 'Group B' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.live > .sr-only[aria-live]')).toHaveText('Group B')
  // V: all groups, the pad keys' group marked.
  await page.keyboard.press('KeyV')
  await expect(page.locator('[data-pad]')).toHaveCount(48)
  await expect(page.locator('.live-group__caption[data-target]')).toHaveText('Group B')
  await page.keyboard.press('KeyV')
  await expect(page.locator('[data-pad]')).toHaveCount(12)

  // E: EDIT on; a pad key opens that pad's sound; Esc closes the sheet, then leaves EDIT.
  const tab = page.locator('.live-edit-tab')
  await page.keyboard.press('KeyE')
  await expect(tab).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Digit7')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('B 7')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(tab).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(tab).toHaveAttribute('aria-pressed', 'false')

  // / opens the Sounds tab's search; typing there plays nothing and switches nothing.
  await page.keyboard.press('Slash')
  const find = page.locator('.snd__input')
  await expect(find).toBeFocused()
  await page.keyboard.type('e5ab')
  await expect(find).toHaveValue('e5ab')
  expect(await downPads(page)).toEqual([])
  await expect(tab).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('tab', { name: 'Group B' })).toHaveAttribute('aria-selected', 'true')
})

test('KEYS: M switches, the piano keeps its letters, the grid plays the pad keys, [ ] and Shift step key and scale', async ({ page }) => {
  await page.keyboard.press('KeyM')
  // A wide window: the piano. Its letters play as before.
  const piano = page.locator('.live-piano__keys')
  await expect(piano).toBeVisible()
  // A plays a piano key while held, as before.
  await page.keyboard.down('KeyA')
  await expect(piano.locator('[data-note][data-down]')).toHaveCount(1)
  await page.keyboard.up('KeyA')
  await expect(piano.locator('[data-note][data-down]')).toHaveCount(0)
  const keyWord = page.getByRole('button', { name: /^Key: / })
  const before = await keyWord.getAttribute('aria-label')
  await page.keyboard.press('BracketRight')
  await expect(keyWord).not.toHaveAttribute('aria-label', before ?? '')
  const scaleWord = page.getByRole('button', { name: /^Scale: / })
  const scaleBefore = await scaleWord.getAttribute('aria-label')
  await page.keyboard.press('Shift+BracketRight')
  await expect(scaleWord).not.toHaveAttribute('aria-label', scaleBefore ?? '')
  // AZERTY: ] 's place is a dead key there; it still steps the key, through the app's own listener.
  const keyNow = await keyWord.getAttribute('aria-label')
  await page.evaluate(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Dead', code: 'BracketRight', bubbles: true, cancelable: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Dead', code: 'BracketRight', bubbles: true }))
  })
  await expect(keyWord).not.toHaveAttribute('aria-label', keyNow ?? '')
  // V: the grid. The pad keys play its keys; Z X step the octave there.
  await page.keyboard.press('KeyV')
  await expect(page.locator('.live-kgrid')).toBeVisible()
  await page.keyboard.down('Digit7')
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.live-kgrid [data-key][data-down]')].map((e) => e.getAttribute('data-key')))).toEqual(['9'])
  await page.keyboard.up('Digit7')
  const octave = page.getByRole('button', { name: /^Octave \d/ })
  const octBefore = await octave.getAttribute('aria-label')
  await page.keyboard.press('KeyX')
  await expect(octave).not.toHaveAttribute('aria-label', octBefore ?? '')
  // Two keys on one grid key across an octave change: each holds its own note, the key stays down until both are up.
  const key3 = page.locator('.live-kgrid [data-key="3"]')
  await page.keyboard.down('Digit1')
  await page.keyboard.press('KeyZ')
  await page.keyboard.down('Numpad1')
  await page.keyboard.up('Digit1')
  await page.waitForTimeout(120)
  // (The demo has no KEYS sound picked, so nothing rings here: each key is a finger of
  // its own in the grid's NoteTouches, and lets go of only the note it pressed.)
  await expect(key3).toHaveAttribute('data-down', '')
  await page.keyboard.up('Numpad1')
  await expect(key3).not.toHaveAttribute('data-down')
  // Back to the piano and to PADS.
  await page.keyboard.press('KeyV')
  await expect(piano).toBeVisible()
  await page.keyboard.press('KeyM')
  await expect(page.locator('[data-pad]')).toHaveCount(12)
})

test('? lists the keys, Esc closes screens but never leaves a section, and the Settings switch silences single keys', async ({ page }) => {
  await page.keyboard.press('Shift+Slash')
  const sheet = page.getByRole('dialog', { name: 'Keyboard keys' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Live, pads')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // Esc closes Settings; on Device it stays on Device.
  await page.getByRole('navigation').getByRole('button', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/#\/settings$/)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/#\/live$/)
  await page.getByRole('navigation').getByRole('button', { name: 'Device' }).click()
  await expect(page).toHaveURL(/#\/device$/)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/#\/device$/)

  // Settings → Computer keyboard off: ? and the pads do nothing; Esc still closes Settings.
  await page.getByRole('navigation').getByRole('button', { name: 'Settings' }).click()
  const row = page.getByRole('switch', { name: 'Computer keyboard' })
  await row.click()
  await expect(row).toHaveAttribute('aria-checked', 'false')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Shift+Slash')
  await expect(page.getByRole('dialog', { name: 'Keyboard keys' })).toHaveCount(0)
  // Back to the section it was opened from.
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/#\/device$/)
  await page.getByRole('navigation').getByRole('button', { name: 'Live' }).click()
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  await page.keyboard.down('Digit5')
  await page.waitForTimeout(120)
  expect(await downPads(page)).toEqual([])
  await page.keyboard.up('Digit5')
  // No key hints for keys that don't work.
  await expect(page.locator('[data-pad][aria-keyshortcuts]')).toHaveCount(0)
  // The piano's letters are single keys too.
  await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
  const piano = page.locator('.live-piano__keys')
  await expect(piano).toBeVisible()
  // No letters on the keys either.
  await expect(piano.locator('.piano__hint')).toHaveCount(0)
  await page.keyboard.down('KeyA')
  await page.waitForTimeout(120)
  await expect(piano.locator('[data-note][data-down]')).toHaveCount(0)
  await page.keyboard.up('KeyA')
})

test('Ctrl+Z runs a new pad sound\'s UNDO', async ({ page }) => {
  await page.keyboard.press('KeyE')
  const sheet = page.getByRole('dialog')
  // EDIT needs the device's project read: try until the pad's sheet opens.
  await expect(async () => {
    await page.keyboard.press('Digit7')
    await expect(sheet).toBeVisible({ timeout: 1000 })
  }).toPass()
  // The first row is the pad's own sound: pick another.
  await sheet.locator('button.snd__pick').nth(1).click()
  const undo = page.getByRole('button', { name: 'Undo' })
  await expect(undo).toBeVisible()
  // Once the sheet has gone (until then the key is the sheet's).
  await expect(sheet).toBeHidden()
  await page.keyboard.press('Control+z')
  await expect(undo).toHaveCount(0)
  await expect(page.locator('.toast')).toContainText('Pad A 7: back to')
})

test('with NumLock off the number pad still plays pads, also with a group key focused', async ({ page }) => {
  await page.getByRole('tab', { name: 'Group B' }).click()
  await expect(page.getByRole('tab', { name: 'Group B' })).toBeFocused()
  // NumLock off: Numpad4 sends ArrowLeft, which would move the group tabs.
  const send = (type: string): Promise<void> =>
    page.evaluate((t) => {
      document.activeElement?.dispatchEvent(new KeyboardEvent(t, { key: 'ArrowLeft', code: 'Numpad4', bubbles: true, cancelable: true }))
    }, type)
  await send('keydown')
  await expect.poll(() => downPads(page)).toEqual(['B 4'])
  await expect(page.getByRole('tab', { name: 'Group B' })).toHaveAttribute('aria-selected', 'true')
  await send('keyup')
  await expect.poll(() => downPads(page)).toEqual([])
})

test('in the all-groups view only the group the keys play says its keys', async ({ page }) => {
  await page.keyboard.press('KeyC')
  await page.keyboard.press('KeyV')
  await expect(page.locator('[data-pad]')).toHaveCount(48)
  const hinted = page.locator('[data-pad][aria-keyshortcuts]')
  await expect(hinted).toHaveCount(12)
  await expect(hinted.first()).toHaveAttribute('aria-label', /^C /)
})

test('a pad held while the window loses focus is let go', async ({ page }) => {
  await page.keyboard.down('Digit8')
  await expect.poll(() => downPads(page)).toEqual(['A 8'])
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect.poll(() => downPads(page)).toEqual([])
  await page.keyboard.up('Digit8')
})

test('NumLock-off number pad arrows still move a control where Live takes no such key', async ({ page }) => {
  const send = (key: string, code: string): Promise<void> =>
    page.evaluate(
      ([k, c]) => {
        for (const t of ['keydown', 'keyup']) {
          document.activeElement?.dispatchEvent(new KeyboardEvent(t, { key: k, code: c, bubbles: true, cancelable: true }))
        }
      },
      [key, code],
    )
  // In KEYS on the piano the number pad plays nothing: the grid / piano switch keeps its arrows.
  await page.keyboard.press('KeyM')
  await expect(page.locator('.live-piano__keys')).toBeVisible()
  await page.getByRole('radio', { name: 'Keys on a piano' }).focus()
  await send('ArrowLeft', 'Numpad4')
  await expect(page.locator('.live-kgrid')).toBeVisible()
  // Over Live (the tools panel), its controls keep their arrows too: the key moves on the small piano.
  await page.getByRole('button', { name: 'Live tools' }).click()
  const panel = page.getByRole('dialog', { name: 'Live tools' })
  await expect(panel).toBeVisible()
  const checked = panel.locator('.mini-piano [role="radio"][aria-checked="true"]')
  const before = await checked.getAttribute('aria-label')
  await checked.focus()
  await send('ArrowRight', 'Numpad6')
  await expect(checked).not.toHaveAttribute('aria-label', before ?? '')
})
