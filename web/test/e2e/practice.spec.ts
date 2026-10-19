// PRACTICE end to end, on the simulated EP-133 of ?demo: a hit placed with STEP; the Claude page's PLAY tab's PRACTICE
// closes Live tools and opens the practice panel in the function keys' place, the pattern counted in at 75%: the pad
// ringed ahead of its hit, the hit let go by counted, ■ showing how it went and COPY copying it, WAIT lighting the pad
// waited for, the speed key starting it over, and ✕ ending it.
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 915 } })

test('PRACTICE: from the Claude page, the pads lit ahead of each hit, how it went, the keys, and ✕', async ({ page }) => {
  await page.addInitScript(() => {
    const copied: string[] = []
    ;(window as unknown as { copied: string[] }).copied = copied
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } })
  })
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  // A 7 on step 1, placed with STEP.
  await page.getByRole('button', { name: 'Step editing' }).click()
  const step = page.getByRole('region', { name: 'Step editing' })
  const rec = step.getByRole('switch', { name: 'Record' })
  await rec.focus()
  await page.keyboard.press('Enter')
  const pad = page.locator('[data-pad="9"]')
  await pad.click()
  await rec.focus()
  await page.keyboard.press('Enter')
  await step.getByRole('button', { name: 'Close step editing' }).click()

  await page.getByRole('button', { name: 'Live tools' }).click()
  const tools = page.getByRole('dialog', { name: 'Live tools' })
  const claude = tools.getByRole('region', { name: 'Claude' })
  await claude.getByRole('tab', { name: 'Task: Play' }).click()
  await claude.getByRole('button', { name: "Practise playing it on Live's pads" }).click()
  await expect(tools).toBeHidden()
  const panel = page.getByRole('region', { name: 'Practice panel' })
  await expect(panel).toBeVisible()
  await expect(panel.locator('.practice-panel__place')).toHaveText('PRACTICE A · 01')
  await expect(page.getByRole('button', { name: 'Effects' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Speed, 75 percent, 90 BPM' })).toBeVisible()

  // Counting in, the pad is ringed with the beats to its hit; let go by, the hit is counted.
  await expect(pad).toHaveClass(/is-cue/, { timeout: 5000 })
  await expect(pad).toHaveAccessibleName(/, (play next|in \d beats?)$/)
  const status = panel.locator('.practice-panel__status')
  await expect(status).toHaveText(/^\d+\/\d+ ON TIME$/, { timeout: 10000 })

  // ■: the lane gives way to how it went, and COPY copies it for Claude.
  await panel.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await expect(panel.locator('.practice-result__percent')).toHaveText(/% ON TIME$/)
  await panel.getByRole('button', { name: 'Copy how it went, to paste to Claude' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { copied: string[] }).copied[0] ?? ''))
    .toMatch(/^Use the arc-beats skill\. I practised A · 01 in Arc's PRACTICE at 90 BPM \(75% of its tempo\)\./)

  // WAIT: the beat stands still, the pad waited for lit; played, the step goes round.
  const wait = panel.getByRole('switch', { name: 'Wait for each hit' })
  await wait.click()
  await expect(wait).toHaveAttribute('aria-checked', 'true')
  await expect(status).toHaveText('WAIT 1/1')
  await expect(pad).toHaveClass(/is-cue-now/)
  await pad.click()
  await expect(pad).toHaveClass(/is-cue-now/)
  await wait.click()

  // The speed steps 50, 75, 100%, starting it over.
  await panel.getByRole('button', { name: 'Speed, 75 percent, 90 BPM' }).click()
  await expect(panel.getByRole('button', { name: 'Speed, 100 percent, 120 BPM' })).toBeVisible()

  // ✕ ends it: the function keys come back, the pad unlit.
  await panel.getByRole('button', { name: 'End practice' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Effects' })).toBeVisible()
  await expect(pad).not.toHaveClass(/is-cue/)
})
