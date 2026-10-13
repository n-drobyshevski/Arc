// Live's last Android details: a pad picked for − / + in STEP shows NUDGE in its name's place;
// EDIT's line gives way to the punch-ins held; a panel opened on the all-groups page scrolled down
// brings it back to its top; on a short window the toast sits in the top bar's middle, a tap
// unfolding it.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

async function live(page: Page): Promise<void> {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 } })

  test('a pad picked in STEP shows NUDGE in its name place', async ({ page }) => {
    await live(page)
    await page.getByRole('button', { name: 'Step editing' }).first().click()
    const panel = page.getByRole('region', { name: 'Step editing' })
    const rec = panel.getByRole('switch', { name: 'Record' })
    await rec.focus()
    await page.keyboard.press('Enter')
    await expect(rec).toHaveAttribute('aria-checked', 'true')
    const pad = page.locator('[data-pad="9"]')
    await pad.click()
    await expect(pad).toHaveClass(/is-step-lit/)
    await rec.focus()
    await page.keyboard.press('Enter')
    await expect(rec).toHaveAttribute('aria-checked', 'false')
    const b = (await pad.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await expect(pad).toHaveClass(/is-step-picked/)
    await page.mouse.up()
    await expect(pad.locator('.live-pad__nudge')).toHaveText('NUDGE')
    await expect(pad.locator('.live-pad__name')).toHaveCount(0)
  })

  test("EDIT's line gives way to the punch-ins held", async ({ page }) => {
    await live(page)
    await page.getByRole('switch', { name: 'Sound' }).click()
    await expect(page.locator('.live-strip--edit')).toBeVisible()
    await page.getByRole('button', { name: 'Effects' }).click({ button: 'right' })
    const lpf = page.locator('[data-punch="6"]')
    const b = (await lpf.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + 4)
    await page.mouse.down()
    await expect(page.locator('.live-strip__punch')).toHaveText('PUNCH · LPF')
    await expect(page.locator('.live-strip--edit')).toHaveCount(0)
    await page.mouse.up()
    await expect(page.locator('.live-strip--edit')).toBeVisible()
  })
})

test.describe('all groups on a phone', () => {
  test.use({ viewport: { width: 412, height: 700 } })

  test('a panel opened with the page scrolled down brings it back to its top', async ({ page }) => {
    await live(page)
    await page.getByRole('button', { name: 'Live tools' }).click()
    await page.getByRole('radio', { name: 'All groups' }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-pad]')).toHaveCount(48)
    const scroller = await page.locator('.live__all').evaluateHandle((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const y = getComputedStyle(p).overflowY
        if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p
      }
      return document.scrollingElement
    })
    await scroller.evaluate((el) => (el as HTMLElement).scrollTo({ top: 400 }))
    expect(await scroller.evaluate((el) => (el as HTMLElement).scrollTop)).toBeGreaterThan(100)
    // Opened without scrolling to its key first.
    await page.getByRole('button', { name: 'Step editing' }).first().dispatchEvent('click')
    await expect(page.getByRole('region', { name: 'Step editing' })).toBeVisible()
    await expect.poll(() => scroller.evaluate((el) => (el as HTMLElement).scrollTop)).toBe(0)
  })
})

for (const [width, height] of [
  [852, 393],
  [600, 400],
] as const) {
  test.describe(`a short window, ${width}×${height}`, () => {
    test.use({ viewport: { width, height } })

    test("the toast sits in the top bar's middle, and a tap unfolds it", async ({ page }) => {
      await page.goto('/?demo#/backups')
      const toast = page.locator('.toast')
      await expect(toast).toContainText('ready to work offline')
      const t = (await toast.boundingBox())!
      const bar = (await page.locator('.top-bar__row').boundingBox())!
      expect(t.y).toBeLessThan(bar.y + bar.height)
      const tag = (await page.locator('.top-bar__row > *').first().boundingBox())!
      expect(t.x).toBeGreaterThanOrEqual(tag.x + tag.width - 1)
      await toast.click()
      await expect(toast).toHaveClass(/is-unfolded/)
    })
  })
}
