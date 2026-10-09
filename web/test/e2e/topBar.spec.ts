// End-to-end: the slim top bar. On a phone (the narrow layout) the bar keeps the
// section tag, the connection key and ?; Back up is the orange block first in the
// Backups caption row, and Settings is the first row of Live's tools and the last
// entry of the section list. The desktop layout keeps Settings on its nav rail
// (and no Settings entry or row), and gets Back up in the caption row too.
import type { Page } from '@playwright/test'
import { expect, openSettings, test } from './fixtures'

const settingsScreen = (page: Page) => page.locator('.app__screen[data-view="settings"]')

test.describe('on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('the bar has the tag, the connection key and ? only', async ({ page }) => {
    await page.goto('/?demo#/backups')
    const bar = page.getByRole('banner')
    await expect(bar.getByRole('button', { name: 'Backups, Sections' })).toBeVisible()
    await expect(bar.getByRole('button', { name: /^EP-133 connected/ })).toBeVisible()
    await expect(bar.getByRole('button', { name: "What's what" })).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Back up', exact: true })).toHaveCount(0)
    await expect(bar.getByRole('button', { name: 'Settings' })).toHaveCount(0)
    await expect(bar.getByRole('button')).toHaveCount(3)
  })

  test('Back up is first in the Backups caption row once there are backups; the big key until then', async ({ page }) => {
    await page.goto('/?demo#/backups')
    const big = page.getByRole('button', { name: 'Back up device' })
    await expect(big).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Back up', exact: true })).toHaveCount(0)
    await big.click()
    const progress = page.getByRole('dialog', { name: 'Backing up' })
    await expect(progress).toBeVisible()
    await expect(progress).toBeHidden({ timeout: 60_000 })
    await expect(big).toHaveCount(0)
    const tools = page.locator('.main-screen__head').getByRole('button')
    await expect(tools).toHaveCount(3)
    await expect(tools.nth(0)).toHaveAccessibleName('Back up')
    await expect(tools.nth(1)).toHaveAccessibleName('Search sounds')
    await expect(tools.nth(2)).toHaveAccessibleName('Import a .pak')
    // It backs up again.
    await tools.nth(0).click()
    await expect(progress).toBeVisible()
    await expect(progress).toBeHidden({ timeout: 60_000 })
    await expect(page.getByRole('region', { name: 'Backups' }).getByRole('listitem')).toHaveCount(2)
    // The guide overlay tags it, orange, in the bar's place.
    await page.getByRole('banner').getByRole('button', { name: "What's what" }).click()
    const coach = page.getByRole('dialog', { name: "What's what" })
    await expect(coach.locator('[data-coach-tag="backups.backup"]')).toHaveText('BACK UP')
    await expect(coach.locator('[data-coach-tag="top.backup"]')).toHaveCount(0)
  })

  test('Settings is the first row of Live tools; it closes them and Back returns to Live', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('button', { name: 'Live tools' }).click()
    const panel = page.getByRole('dialog', { name: 'Live tools' })
    await expect(panel).toBeVisible()
    // The first row card of the panel, before the view switch.
    await expect(panel.locator('.row-card').first().getByRole('button', { name: 'Settings' })).toBeVisible()
    await panel.getByRole('button', { name: 'Settings' }).click()
    await expect(settingsScreen(page)).toBeVisible()
    await expect(page).toHaveURL(/#\/settings$/)
    await page.goBack()
    await expect(page).toHaveURL(/#\/live$/)
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await expect(page.getByRole('dialog', { name: 'Live tools' })).toBeHidden()
  })

  test('Settings ends the section list, set apart, and opens in its place', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('banner').getByRole('button', { name: 'Live, Sections' }).click()
    const list = page.getByRole('navigation', { name: 'Sections' })
    const items = list.getByRole('button')
    await expect(items).toHaveCount(4)
    await expect(items.last()).toHaveAccessibleName('Settings')
    // A wider gap than between the sections, and the gear before the word.
    const boxes = await items.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))
    const gap = (i: number): number => boxes[i + 1]!.top - boxes[i]!.bottom
    expect(gap(2)).toBeGreaterThan(gap(1) + 4)
    await expect(items.last().locator('svg[data-icon="GEAR"]')).toHaveCount(1)
    await items.last().click()
    await expect(settingsScreen(page)).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/#\/live$/)
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('button').first()).toBeHidden()
  })

  test('the guide overlay tags the Settings row with the tools open', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('button', { name: 'Live tools' }).click()
    await expect(page.getByRole('dialog', { name: 'Live tools' })).toBeVisible()
    await page.getByRole('banner').getByRole('button', { name: "What's what" }).click()
    const coach = page.getByRole('dialog', { name: "What's what" })
    await expect(coach.locator('[data-coach-tag="tools.settings"]')).toHaveText('SETTINGS')
  })

  test('openSettings works from every section', async ({ page }) => {
    for (const hash of ['#/backups', '#/device']) {
      await page.goto(`/?demo${hash}`)
      await openSettings(page)
    }
  })
})

test.describe('on the desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('Settings stays on the nav rail; the list and the tools have no Settings entry', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    const bar = page.getByRole('banner')
    await expect(bar.getByRole('button', { name: 'Back up', exact: true })).toHaveCount(0)
    await expect(bar.getByRole('button', { name: 'Settings' })).toHaveCount(0)
    await bar.getByRole('button', { name: 'Live, Sections' }).click()
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('button')).toHaveCount(3)
    await page.keyboard.press('Escape')
    await expect(page.locator('.live__side-tools, .side-zone').getByRole('button', { name: 'Settings' })).toHaveCount(0)
    await openSettings(page)
  })
})
