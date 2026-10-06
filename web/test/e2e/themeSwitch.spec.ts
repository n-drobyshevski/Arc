// End-to-end: the desktop top bar's theme switch (web only,
// src/ui/components/ThemeSwitch.tsx). From 1024px wide the top bar has a
// System / Light / Dark radio group in the settings key's place, the same
// setting as Settings → Theme; below that the gear is still there.
import type { Page } from '@playwright/test'
import { expect, openSettings, test } from './fixtures'

const theme = (page: Page): Promise<{ resolved: string | null; setting: string | null }> =>
  page.evaluate(() => ({
    resolved: document.documentElement.getAttribute('data-theme'),
    setting: document.documentElement.getAttribute('data-theme-setting'),
  }))

test.describe('on the desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })

  test('the theme switch replaces the gear and follows Settings → Theme', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    const bar = page.getByRole('banner')
    const group = bar.getByRole('radiogroup', { name: 'Theme' })
    await expect(group).toBeVisible()
    await expect(group.getByRole('radio')).toHaveCount(3)
    await expect(bar.getByRole('button', { name: 'Settings' })).toHaveCount(0)
    await expect(group.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(await theme(page)).toEqual({ resolved: 'light', setting: 'SYSTEM' })

    // Dark: the page goes dark at once, and Settings agrees.
    await group.getByRole('radio', { name: 'Dark' }).click()
    await expect(group.getByRole('radio', { name: 'Dark' })).toBeChecked()
    await expect(group.getByRole('radio', { name: 'System' })).not.toBeChecked()
    await expect.poll(() => theme(page)).toEqual({ resolved: 'dark', setting: 'DARK' })
    await openSettings(page)
    const row = page.getByRole('radiogroup', { name: 'Theme' })
    await expect(row.getByRole('radio', { name: 'Dark' })).toBeChecked()

    // Light in Settings: the switch shows it back on Live.
    await row.getByRole('radio', { name: 'Light' }).click()
    await expect.poll(() => theme(page)).toEqual({ resolved: 'light', setting: 'LIGHT' })
    await page.goBack()
    await expect(group.getByRole('radio', { name: 'Light' })).toBeChecked()

    // One tab stop; the arrow keys move the choice.
    await group.getByRole('radio', { name: 'Light' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(group.getByRole('radio', { name: 'Dark' })).toBeChecked()
    await expect(group.getByRole('radio', { name: 'Dark' })).toBeFocused()
    await expect.poll(() => theme(page)).toEqual({ resolved: 'dark', setting: 'DARK' })
    await expect(group.locator('[tabindex="0"]')).toHaveCount(1)

    // The guide overlay points at the switch, and at no settings key in the top bar.
    await bar.getByRole('button', { name: "What's what" }).click()
    const coach = page.getByRole('dialog', { name: "What's what" })
    await expect(coach.locator('[data-coach-tag="top.theme"]')).toHaveText('LIGHT OR DARK')
    await expect(coach.locator('[data-coach-tag="top.settings"]')).toHaveCount(0)
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('the gear is still there, and no theme switch', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    const bar = page.getByRole('banner')
    await expect(bar.getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
    await expect(bar.getByRole('radiogroup', { name: 'Theme' })).toHaveCount(0)
    await openSettings(page)
  })
})
