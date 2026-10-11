// BEAT CARDS end to end, on the simulated EP-133 of ?demo: Live tools' CLAUDE section
// (its shares dimmed with no notes, PASTE BEAT), a beat card pasted on Live opening its
// sheet (the grid, where it goes, the tempo chip), IMPORT placing it with a toast, and
// PASTE BEAT reading the clipboard.
import { expect, test } from './fixtures'

test.use({ viewport: { width: 412, height: 915 } })

const CARD = ['ARC BEAT 1', 'name Four on the floor', 'tempo 124', '[A]', 'A7 | X... X... X... X... |'].join('\n')

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
