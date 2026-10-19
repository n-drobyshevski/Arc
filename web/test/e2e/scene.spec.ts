// SCENES end to end, on the simulated EP-133 of ?demo: the S01 chip on the stopped
// line opens the panel in the function keys' place; a group's + picks its next
// pattern (stopped, at once); COMMIT copies the scene to S02 and − comes back to it; the
// grid, over the pads, picks a pattern by number (Escape closes it before the panel); the
// group keys carry each group's number once the scene is worth saying; the CLIP row's modes
// are radios; ✕ closes it.
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 915 } })

test('SCENES: a pattern picked, the scene committed, the grid, and the panel closed', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  await page.getByRole('button', { name: 'Scenes, scene 1 of 1' }).click()
  const panel = page.getByRole('region', { name: 'Scenes and patterns' })
  await expect(panel).toBeVisible()
  await expect(page.getByRole('button', { name: 'Effects' })).toHaveCount(0)
  // The chip gives way to the panel's own S01.
  await expect(page.getByRole('button', { name: /^Scenes, scene/ })).toHaveCount(0)

  const groupA = panel.getByRole('group', { name: /^Group A, pattern 1/ })
  await expect(groupA).toBeVisible()
  await panel.getByRole('button', { name: /^Group A.*next pattern/i }).click()
  await expect(panel.getByRole('group', { name: /^Group A, pattern 2/ })).toBeVisible()

  await panel.getByRole('button', { name: /^Commit/i }).click()
  await expect(panel).toContainText('S02')
  await panel.getByRole('button', { name: /^Previous scene/i }).click()
  await expect(panel).toContainText('S01')
  // S01 keeps what it played when it was copied.
  await expect(panel.getByRole('group', { name: /^Group A, pattern 2/ })).toBeVisible()

  // The group keys under the pads carry the numbers now that the scene is worth saying.
  await expect(page.getByRole('tab', { name: /^Group A, pattern 2$/ })).toContainText('02')

  // The grid, over the pads: Escape closes it and leaves the panel; then pattern 5 for group B.
  const pick = panel.getByRole('button', { name: /^Group B, pattern 1.*Pick a pattern/ })
  await pick.click()
  const grid = page.getByRole('group', { name: /pattern grid/i })
  await expect(grid).toBeVisible()
  await expect(page.locator('.live-group .scene-grid-over')).toHaveCount(1)
  await expect(panel.locator('.scene-grid')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(grid).toHaveCount(0)
  await expect(panel).toBeVisible()
  await pick.click()
  await grid.getByRole('button', { name: /^Pattern 5\b/ }).click()
  await expect(grid).toHaveCount(0)
  await expect(panel.getByRole('group', { name: /^Group B, pattern 5/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /^Group B, pattern 5$/ })).toContainText('05')

  const bar = panel.getByRole('radio', { name: /bar/i })
  await bar.click()
  await expect(bar).toHaveAttribute('aria-checked', 'true')

  await panel.getByRole('button', { name: 'Close scenes and patterns' }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Effects' })).toBeVisible()
})
