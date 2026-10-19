// End-to-end: holding KEYS' scale or octave word fans its choices out beside the thumb (Kotlin PickWord's quick
// and QuickPickFan, 74faa6d): a small move toward one lights it and letting go picks it; letting go in the dead
// zone keeps the choice. The octaves run high to low, so straight up is the highest. No list opens.
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/** Presses the word's middle with the mouse and holds it still past the hold; returns the press point. */
async function hold(page: Page, word: Locator): Promise<{ x: number; y: number }> {
  const b = (await word.boundingBox())!
  const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await expect(page.locator('.quick-fan')).toBeVisible()
  return at
}

test.describe('upright', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('a hold on the octave or scale word fans its choices out; a move toward one picks it', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
    await expect(page.locator('.live-kgrid')).toBeVisible()
    // The offline toast at the window's foot would take the press from the words under it.
    await expect(page.locator('.toast')).toContainText('ready to work offline')
    await expect(page.locator('.toast')).toHaveCount(0)

    const octave = page.getByRole('button', { name: /^Octave \d/ })
    await expect(octave).toHaveAttribute('aria-label', /Hold to pick from the list\.$/)
    const n = Number((await octave.getAttribute('aria-label'))!.match(/\d/)![0])

    // Held: nine octaves, high to low, the one picked now ringed; nothing lit yet.
    const at = await hold(page, octave)
    const chips = page.locator('.quick-fan__chip')
    await expect(chips).toHaveCount(9)
    await expect(chips.first()).toHaveText('Oct 8')
    await expect(chips.last()).toHaveText('Oct 0')
    await expect(page.locator('.quick-fan__chip.is-current')).toHaveText(`Oct ${n}`)
    await expect(page.locator('.quick-fan__chip.is-lit')).toHaveCount(0)
    // Straight up: the top row, the highest octave, lit; let go, picked.
    await page.mouse.move(at.x, at.y - 50, { steps: 4 })
    await expect(page.locator('.quick-fan__chip.is-lit')).toHaveText('Oct 8')
    await page.mouse.up()
    await expect(page.locator('.quick-fan')).toHaveCount(0)
    await expect(octave).toHaveAttribute('aria-label', /^Octave 8\./)
    await expect(page.getByRole('listbox')).toHaveCount(0)

    // Let go in the dead zone: kept, and no list.
    await hold(page, octave)
    await page.mouse.up()
    await expect(page.locator('.quick-fan')).toHaveCount(0)
    await expect(octave).toHaveAttribute('aria-label', /^Octave 8\./)
    await expect(page.getByRole('listbox')).toHaveCount(0)

    // The scale: toward a chip from where the finger went down, a little way, lights that one.
    const scale = page.getByRole('button', { name: /^Scale: / })
    const press = await hold(page, scale)
    const target = page.locator('.quick-fan__chip', { hasText: /^Dorian$/ })
    const box = (await target.boundingBox())!
    // Its near end on the arc (the fan opens toward the window's middle).
    const end = { x: box.x > press.x ? box.x : box.x + box.width, y: box.y + box.height / 2 }
    const len = Math.hypot(end.x - press.x, end.y - press.y)
    await page.mouse.move(press.x + ((end.x - press.x) / len) * 30, press.y + ((end.y - press.y) / len) * 30, { steps: 4 })
    await expect(page.locator('.quick-fan__chip.is-lit')).toHaveText('Dorian')
    await page.mouse.up()
    await expect(scale).toHaveAttribute('aria-label', /^Scale: Dorian\./)
    await expect(page.getByRole('listbox')).toHaveCount(0)

    // A tap still opens the list.
    await octave.click()
    await expect(page.getByRole('listbox')).toBeVisible()
  })
})

test.describe('on its side', () => {
  test.use({ viewport: { width: 852, height: 393 } })

  test('the turned octave word fans its choices out upright, toward the middle', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
    await page.getByRole('radiogroup', { name: 'Keys view' }).getByRole('radio', { name: 'Keys on the pads' }).click()
    const octave = page.locator('.live__side-end').getByRole('button', { name: /^Octave \d/ })
    await expect(octave).toBeVisible()
    const at = await hold(page, octave)
    const chips = page.locator('.quick-fan__chip')
    await expect(chips).toHaveCount(9)
    // At the window's right: leftward, every chip inside the window, high to low.
    for (const chip of await chips.all()) {
      const b = (await chip.boundingBox())!
      expect(b.x + b.width).toBeLessThan(at.x)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.y + b.height).toBeLessThanOrEqual(393)
    }
    await page.mouse.move(at.x, at.y + 50, { steps: 4 })
    await expect(page.locator('.quick-fan__chip.is-lit')).toHaveText('Oct 0')
    await page.mouse.up()
    await expect(octave).toHaveAttribute('aria-label', /^Octave 0\./)
    await expect(page.getByRole('listbox')).toHaveCount(0)
  })
})
