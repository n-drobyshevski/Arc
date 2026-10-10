// TAKE and takes end to end, on the simulated EP-133 of ?demo: TAKE in Live
// tools arms a take, a pad played starts it, the display's badge stops it, the
// take is listed with its actions, and the device's PLAY starts an armed take.
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
  await badge.click()
  await expect(page.getByRole('status').filter({ hasText: /^Take saved \(\d+:\d\d\)\. It's in Live tools\.$/ })).toBeVisible()
  await expect(badge).toHaveCount(0)

  tools = await openTools(page)
  const takes = tools.getByRole('region', { name: 'Takes' })
  await expect(takes.getByRole('listitem')).toHaveCount(1)
  await takes.locator('.take__fold').click()
  await expect(takes.getByRole('button', { name: 'Save WAV' })).toBeVisible()
  // A desktop browser can't share a file: no Share, and the note says Save WAV.
  await expect(takes.getByRole('button', { name: 'Share WAV' })).toHaveCount(0)
  await expect(takes.getByRole('button', { name: 'To EP-133' })).toBeVisible()
  await takes.getByRole('button', { name: 'Delete' }).click()
  await expect(takes.getByText('Delete this take?')).toBeVisible()
  await takes.getByRole('button', { name: 'Delete' }).click()
  await expect(takes.getByRole('listitem')).toHaveCount(0)
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
