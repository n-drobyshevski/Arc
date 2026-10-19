// PATTERN end to end, on the simulated EP-133 of ?demo: RECORD arms, a pad
// played starts the recording on its press, the counter runs, PLAY stops, the
// pattern sheet shows the group with notes, the patterns are kept over a
// reload, and the drawn EP-133's RECORD and PLAY drive it on the desk.
import { demo, expect, test } from './fixtures'

test.describe('on a phone', () => {
  test.use({ viewport: { width: 412, height: 843 } })

  test('RECORD, a pad, the counter, PLAY to stop; the sheet; kept over a reload', async ({ page }) => {
    await page.goto('/?demo')
    await expect(page).toHaveURL(/#\/live$/)
    await expect(page.locator('.live-strip')).toContainText('Project 1')
    // The device names pad A "." (001 kick) as it plays it.
    await demo(page, (d) => {
      d.noteOn(36, 127)
      d.pushPadActive(1, 0, 1)
    })
    await demo(page, (d) => d.noteOff(36))
    const pad = page.locator('[data-pad]', { hasText: 'kick' }).first()
    await expect(pad).toBeVisible()

    const record = page.getByRole('button', { name: /^Record, / })
    const play = page.getByRole('button', { name: /^Play/ }).first()
    await expect(record).toHaveAccessibleName('Record, off')
    await record.click()
    await expect(record).toHaveAccessibleName('Record, armed')
    await expect(page.locator('.pattern-words')).toContainText('Play a pad or PLAY')

    // The pad starts the recording on its press: bar 1 there.
    const box = await pad.boundingBox()
    if (box === null) throw new Error('the pad has no box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(150)
    await page.mouse.up()
    await expect(record).toHaveAccessibleName('Record, recording')
    await expect(page.locator('.pattern-words__num')).toHaveText(/^\d\.\d \/ 1 · 1\/16$/)
    await expect(play).toHaveAccessibleName(/^Play, bar 1 of 1$/)

    // PLAY stops it, the notes kept.
    await play.click()
    await expect(record).toHaveAccessibleName('Record, off')
    await expect(page.locator('.pattern-words')).toHaveCount(0)

    // Held, RECORD opens the pattern sheet: group A has notes.
    await record.click({ button: 'right' })
    const sheet = page.getByRole('dialog', { name: 'Pattern' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('radio', { name: 'Group A, 1 bar, has notes' })).toBeVisible()
    await sheet.getByRole('button', { name: /Double the length/ }).click()
    await expect(sheet.getByRole('radio', { name: 'Group A, 2 bars, has notes' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()

    // Played back: the counter runs over the two bars.
    await play.click()
    await expect(page.locator('.pattern-words__num')).toHaveText(/^\d\.\d \/ 2$/)
    await play.click()

    await page.reload()
    await expect(page.locator('.live-strip')).toContainText('Project 1')
    await page.getByRole('button', { name: /^Record, / }).click({ button: 'right' })
    await expect(page.getByRole('dialog', { name: 'Pattern' }).getByRole('radio', { name: 'Group A, 2 bars, has notes' })).toBeVisible()
  })

  test('armed, PLAY counts a bar in, then records', async ({ page }) => {
    await page.goto('/?demo')
    await expect(page.locator('.live-strip')).toContainText('Project 1')
    const record = page.getByRole('button', { name: /^Record, / })
    await record.click()
    await page.getByRole('button', { name: /^Play/ }).first().click()
    await expect(page.locator('.pattern-words__count')).toHaveText(/^[1-4]$/)
    await expect(record).toHaveAccessibleName('Record, armed')
    // 120 BPM: a bar's count-in is 2 s.
    await expect(record).toHaveAccessibleName('Record, recording', { timeout: 5000 })
    await page.getByRole('button', { name: /^Play/ }).first().click()
    await expect(record).toHaveAccessibleName('Record, off')
  })
})

test('the drawn EP-133 records and plays the pattern', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/?demo')
  await page.getByRole('radio', { name: 'Device' }).click()
  const ep = page.getByRole('group', { name: 'EP-133 K.O. II' })
  await expect(ep).toBeVisible()
  // The project read first: another project stops the transport (its patterns are its own).
  await expect(page.locator('.ep-plate__status')).toHaveText(/project 1/i)
  await ep.getByRole('button', { name: 'Record, off' }).click()
  await expect(ep.getByRole('button', { name: 'Record, armed' })).toBeVisible()
  await expect(page.locator('.ep-plate__status')).toContainText('Play a pad or PLAY')
  await ep.getByRole('button', { name: /^Play/ }).click()
  await expect(ep.getByRole('button', { name: 'Record, recording' })).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.ep-plate__status')).toHaveText(/\d\.\d \/ 1 · 1\/16/)
  await ep.getByRole('button', { name: /^Play/ }).click()
  await expect(ep.getByRole('button', { name: 'Record, off' })).toBeVisible()
})
