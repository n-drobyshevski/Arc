// TEMPO and ERASE end to end, on the simulated EP-133 of ?demo: TEMPO's key
// over the pads turns the click on and off and, held, opens the tempo sheet
// (− TAP +, the click, TIMING's page); ERASE in the pattern sheet takes the
// pads, a tap erasing a pad's notes.
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 843 } })

test('TEMPO: the click, and the tempo sheet', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  const click = page.getByRole('switch', { name: 'Click' }).first()
  await expect(click).toHaveAttribute('aria-checked', 'false')
  await click.click()
  await expect(click).toHaveAttribute('aria-checked', 'true')
  await click.click()
  await expect(click).toHaveAttribute('aria-checked', 'false')

  // Held (here a right-click), the tempo sheet.
  await click.click({ button: 'right' })
  const sheet = page.getByRole('dialog', { name: 'Tempo' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('status')).toHaveText('120 BPM')
  await sheet.getByRole('button', { name: 'Faster' }).click()
  await expect(sheet.getByRole('status')).toHaveText('121 BPM')
  await sheet.getByRole('switch', { name: 'Click' }).click()
  await expect(click).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.fn-key__label')).toHaveText('121 BPM')
  // TIMING's page: the interval and free time.
  await sheet.getByRole('radio', { name: 'Timing' }).click()
  await sheet.getByRole('radio', { name: /Interval 1\/8$/ }).click()
  await expect(sheet.getByRole('radio', { name: /Interval 1\/8$/ })).toHaveAttribute('aria-checked', 'true')
  await sheet.getByRole('radio', { name: 'Free time' }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toBeHidden()
  // (?demo keeps its settings in memory: the tempo kept over a reload is pattern.test.ts's.)
})

test('ERASE: a tap on a pad erases its notes', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  const record = page.getByRole('button', { name: /^Record, / })
  await record.click()
  const pad = page.locator('[data-pad]').nth(4)
  const box = await pad.boundingBox()
  if (box === null) throw new Error('the pad has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(100)
  await page.mouse.up()
  await expect(record).toHaveAccessibleName('Record, recording')
  await page.getByRole('button', { name: /^Play/ }).first().click()
  await expect(record).toHaveAccessibleName('Record, off')

  // ERASE from the pattern sheet: the sheet makes way, the pad with notes has its dot.
  await record.click({ button: 'right' })
  await page.getByRole('dialog', { name: 'Pattern' }).getByRole('button', { name: 'Erase' }).click()
  await expect(page.getByRole('dialog', { name: 'Pattern' })).toBeHidden()
  await expect(page.locator('.pattern-words')).toContainText('Tap a pad to erase its notes')
  await expect(page.locator('.live-pad.is-erase-dot')).toHaveCount(1)
  await page.locator('.live-pad.is-erase-dot').click()
  await expect(page.getByRole('status').filter({ hasText: /notes erased\.$/ })).toBeVisible()
  await expect(page.locator('.live-pad.is-erase-dot')).toHaveCount(0)
  // ERASE off from the line.
  await page.getByRole('button', { name: 'Erase', pressed: true }).click()
  await expect(page.locator('.pattern-words')).toHaveCount(0)
})
