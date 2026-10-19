// STEP on every view of Live, as Android's: on a phone on its side KEYS' grid and the piano take the panel in a
// column left of the keys (the keys narrowing beside it, nothing over them); with all four groups a pad pressed in
// another group takes the panel there, the group edited named by its caption in orange.
import { expect, test } from './fixtures'

test.describe('on its side', () => {
  test.use({ viewport: { width: 852, height: 393 } })

  test("KEYS' grid and the piano take the panel in a column left of the keys", async ({ page }) => {
    await page.goto('/?demo')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    // KEYS plays the pad tapped last: one first.
    await page.locator('[data-pad="9"]').click()
    await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
    const panel = page.getByRole('region', { name: 'Step editing' })
    const leftOf = async (keys: string): Promise<void> => {
      await expect(panel).toBeVisible()
      const p = (await panel.boundingBox())!
      const k = (await page.locator(keys).first().boundingBox())!
      expect(p.x + p.width).toBeLessThanOrEqual(k.x)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }

    // The piano.
    await expect(page.locator('.piano__key[data-note]').first()).toBeVisible()
    await page.getByRole('button', { name: 'Step editing' }).first().click()
    await leftOf('.piano')
    // RECORD held, a key places its note, outlined.
    const key = page.locator('.piano__key[data-note]').nth(5)
    const rec = panel.getByRole('switch', { name: 'Record' })
    await rec.focus()
    await page.keyboard.press('Enter')
    await key.click()
    await expect(key).toHaveClass(/is-step-lit/)
    await page.keyboard.press('Enter')

    // KEYS' grid: the same column, the keys beside it.
    await page.getByRole('radiogroup', { name: 'Keys view' }).getByRole('radio', { name: 'Keys on the pads' }).click()
    await leftOf('.live-kgrid')
    const narrow = (await page.locator('.live-kgrid').boundingBox())!
    // ✕ folds it: the keys as before, no column.
    await panel.getByRole('button', { name: 'Close step editing' }).click()
    await expect(panel).toHaveCount(0)
    await expect(page.locator('.live__side-panel')).toHaveCount(0)
    const wide = (await page.locator('.live-kgrid').boundingBox())!
    expect(wide.width).toBeGreaterThanOrEqual(narrow.width)
  })
})

test.describe('with all four groups', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('a pad pressed in another group takes the panel there, its caption orange', async ({ page }) => {
    await page.goto('/?demo')
    await expect(page.locator('.live-strip')).toContainText('Project 1')
    await page.getByRole('button', { name: 'Live tools' }).click()
    await page.getByRole('radio', { name: 'All groups' }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.live-display')).toBeVisible()

    await page.getByRole('button', { name: 'Step editing' }).first().click()
    const panel = page.getByRole('region', { name: 'Step editing' })
    await expect(panel).toBeVisible()
    const caption = (g: number) => page.locator(`.live-group__caption[data-group="${g}"]`)
    await expect(caption(0)).toHaveClass(/is-step-edited/)
    await expect(caption(0)).toHaveAttribute('aria-description', 'Editing in step')

    // A pad of group C: the panel goes there.
    await page.locator('.live-group').nth(2).locator('[data-pad]').first().click()
    await expect(caption(2)).toHaveClass(/is-step-edited/)
    await expect(caption(2)).toHaveAttribute('aria-description', 'Editing in step')
    await expect(caption(0)).not.toHaveClass(/is-step-edited/)
    await expect(caption(0)).not.toHaveAttribute('aria-description', /./)
  })
})
