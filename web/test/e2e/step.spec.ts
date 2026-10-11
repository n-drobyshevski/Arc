// STEP end to end, on the simulated EP-133 of ?demo: the STEP chip on the stopped
// line opens the panel in the function keys' place; its RECORD (a screen reader's
// click latches it) and a pad put a note on the cursor's step, outlining the pad
// and dotting the strip; − / + move the cursor; CORRECT latches; ✕ closes it.
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 915 } })

test('STEP: a note placed on a step, the cursor moved, and the panel closed', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  await page.getByRole('button', { name: 'Step editing' }).click()
  const panel = page.getByRole('region', { name: 'Step editing' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('STEP 1.1.1')
  // The function keys give way to the panel.
  await expect(page.getByRole('button', { name: 'Effects' })).toHaveCount(0)

  const rec = panel.getByRole('switch', { name: 'Record' })
  await rec.focus()
  await page.keyboard.press('Enter')
  await expect(rec).toHaveAttribute('aria-checked', 'true')
  const pad = page.locator('[data-pad="9"]')
  await pad.click()
  await expect(pad).toHaveClass(/is-step-lit/)
  await expect(panel.locator('.step-panel__status')).toHaveText('+ A 7')
  await rec.focus()
  await page.keyboard.press('Enter')
  await expect(rec).toHaveAttribute('aria-checked', 'false')
  await expect(panel.getByRole('button', { name: /^Step 1\.1\.1, has notes/ })).toBeVisible()
  await expect(panel.getByRole('slider', { name: 'Velocity' })).toHaveAttribute('aria-valuetext', '127')

  // + moves on: the pad is no longer on the cursor's step; − comes back.
  await panel.getByRole('button', { name: 'Next step' }).click()
  await expect(panel.locator('.step-panel__status')).toHaveText('STEP 1.1.2')
  await expect(pad).not.toHaveClass(/is-step-lit/)
  await expect(panel.getByRole('slider', { name: 'Velocity' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Previous step' }).click()
  await expect(pad).toHaveClass(/is-step-lit/)

  const correct = panel.getByRole('switch', { name: 'Correct' })
  await correct.click()
  await expect(correct).toHaveAttribute('aria-checked', 'true')
  await correct.click()

  await panel.getByRole('button', { name: 'Close step editing' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Effects' })).toBeVisible()
})
