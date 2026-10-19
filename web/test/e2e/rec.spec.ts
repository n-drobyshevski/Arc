// TAKE and takes end to end, on the simulated EP-133 of ?demo: TAKE in Live
// tools arms a take, a pad played starts it, the display's badge stops it, the
// take is numbered on the glass and the keys under it act on it (TRIM keeps a
// part of it, DUP copies it), and the device's PLAY starts an armed take.
import type { Page } from '@playwright/test'
import { demo, expect, test } from './fixtures'

// The phone layout: Live tools open over the page.
test.use({ viewport: { width: 412, height: 843 } })

async function openTools(page: Page) {
  await page.getByRole('button', { name: 'Live tools' }).click()
  const panel = page.getByRole('dialog', { name: 'Live tools' })
  await expect(panel).toBeVisible()
  return panel
}

async function closeTools(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Live tools' })).toHaveCount(0)
}

test('TAKE records a pad into a take that Live tools lists', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page).toHaveURL(/#\/live$/)
  // The mirror is listening once the device is read (its project shows).
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  // The device names pad A "." (001 kick) as it plays it.
  await demo(page, (d) => {
    d.noteOn(36, 127)
    d.pushPadActive(1, 0, 1)
  })
  await demo(page, (d) => d.noteOff(36))
  const pad = page.locator('[data-pad]', { hasText: 'kick' }).first()
  await expect(pad).toBeVisible()

  let tools = await openTools(page)
  const key = tools.getByRole('region', { name: 'Takes' }).getByRole('button', { name: /^Take/ })
  await expect(key).toHaveAccessibleName(/^Take\. /)
  await key.click()
  await expect(key).toHaveAccessibleName(/^Take, waiting/)
  await closeTools(page)

  // The display shows the armed take.
  const badge = page.locator('.take-badge')
  await expect(badge).toHaveAccessibleName(/^Take, waiting/)

  const box = await pad.boundingBox()
  if (box === null) throw new Error('the pad has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  // As on Android, a press that needs the device while it is busy reading plays nothing: press again then.
  for (let i = 0; i < 3; i++) {
    await page.mouse.down()
    await page.waitForTimeout(400)
    await page.mouse.up()
    if (/^Recording/.test((await badge.getAttribute('aria-label')) ?? '')) break
  }
  await expect(badge).toHaveAccessibleName(/^Recording a take, \d+:\d\d\. Tap to stop\.$/)
  await expect(badge).toContainText(/^TAKE \d+:\d\d$/)
  // A second hit a moment later: the take holds both, long enough to trim.
  await page.waitForTimeout(500)
  await page.mouse.down()
  await page.waitForTimeout(200)
  await page.mouse.up()
  await badge.click()
  await expect(page.getByRole('status').filter({ hasText: /^Take saved \(\d+:\d\d\)\. It's in Live tools\.$/ })).toBeVisible()
  await expect(badge).toHaveCount(0)

  tools = await openTools(page)
  const takes = tools.getByRole('region', { name: 'Takes' })
  // The glass: the takes numbered, T01 the oldest, the newest lit; the keys act on it.
  const glass = takes.getByRole('radiogroup', { name: 'Takes' })
  await expect(glass.getByRole('radio')).toHaveCount(1)
  await expect(glass.getByRole('radio', { name: /^T01, \d+:\d\d, / })).toHaveAttribute('aria-checked', 'true')
  await expect(takes).toContainText('Takes · 1')
  await expect(takes.getByRole('button', { name: 'Save WAV, T01' })).toBeEnabled()
  // A desktop browser can't share a file: no SHARE, and the note says Save WAV.
  await expect(takes.getByRole('button', { name: 'Share WAV, T01' })).toHaveCount(0)
  await expect(takes.getByRole('button', { name: 'To EP-133, T01' })).toBeEnabled()
  await expect(takes.getByRole('button', { name: 'Play, T01' })).toBeEnabled()
  // TRIM: the glass shows the wave; the start handle steps later with the arrow keys, DONE keeps the part.
  await takes.getByRole('button', { name: 'Trim, T01' }).click()
  await expect(takes).toContainText('✂ TRIM')
  const startHandle = takes.getByRole('slider', { name: 'Start' })
  await expect(startHandle).toHaveAttribute('aria-valuetext', '0:00.0')
  await startHandle.focus()
  await page.keyboard.press('ArrowRight')
  await expect(startHandle).not.toHaveAttribute('aria-valuetext', '0:00.0')
  await expect(takes.getByRole('button', { name: 'Reset' })).toBeEnabled()
  await takes.getByRole('button', { name: 'Done' }).click()
  await expect(glass.getByRole('radio', { name: /^T01, \d+:\d\d trimmed, / })).toBeVisible()
  await expect(takes).toContainText(/✂ T01 is trimmed to \d+:\d\d: SHARE, SAVE and EP send that part/)
  // DUP: a copy, its trim with it, lit as the newest.
  await takes.getByRole('button', { name: 'Duplicate, T01' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'T02, a copy of T01' })).toBeVisible()
  await expect(glass.getByRole('radio')).toHaveCount(2)
  await expect(glass.getByRole('radio', { name: /^T02, \d+:\d\d trimmed, / })).toHaveAttribute('aria-checked', 'true')
  await takes.getByRole('button', { name: 'Delete, T02' }).click()
  await takes.locator('.deck-key').filter({ hasText: 'DEL' }).click()
  await expect(glass.getByRole('radio')).toHaveCount(1)
  // DEL asks again on the glass; DEL again deletes.
  await takes.getByRole('button', { name: 'Delete, T01' }).click()
  await expect(takes.getByRole('button', { name: 'Delete T01? Press DEL again' })).toHaveCount(2)
  await takes.locator('.deck-key').filter({ hasText: 'DEL' }).click()
  await expect(glass).toHaveCount(0)
  await expect(takes).toContainText('No takes yet')
  // Nothing to light: the keys but TAKE are dimmed.
  await expect(takes.locator('.deck-key').filter({ hasText: 'DEL' })).toBeDisabled()
})

test("an armed take starts with the EP-133's PLAY and ends with its STOP", async ({ page }) => {
  await page.goto('/?demo')
  await expect(page).toHaveURL(/#\/live$/)
  // The mirror is listening once the device is read (its project shows).
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  const tools = await openTools(page)
  await tools.getByRole('region', { name: 'Takes' }).getByRole('button', { name: /^Take\. / }).click()
  await closeTools(page)
  const badge = page.locator('.take-badge')
  await expect(badge).toHaveAccessibleName(/^Take, waiting/)
  await demo(page, (d) => d.clock('start'))
  await expect(badge).toHaveAccessibleName(/^Recording/)
  await demo(page, (d) => d.clock('stop'))
  // Nothing was played in the browser: the take is silent, so nothing is kept.
  await expect(badge).toHaveCount(0)
})
