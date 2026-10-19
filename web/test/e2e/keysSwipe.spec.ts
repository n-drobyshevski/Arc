// End-to-end: a short swipe on KEYS' scale or octave word steps it (Kotlin PickWord's swipe, 4e6b9d7): right the
// next, left the one before, without opening the list; on a phone on its side the turned words step up and down,
// as they read. The arrow keys right and left do the same on the closed word (TalkBack's Next and Previous).
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'

/** A mouse drag from the word's middle by [dx], [dy], in small moves. */
async function drag(page: Page, word: Locator, dx: number, dy: number): Promise<void> {
  const b = (await word.boundingBox())!
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}

test.describe('upright', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('a swipe along the scale or octave word steps it, the list stays shut; the arrow keys too', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
    await expect(page.locator('.live-kgrid')).toBeVisible()

    const octave = page.getByRole('button', { name: /^Octave \d/ })
    await expect(octave).toHaveAttribute('aria-description', 'Next: right arrow. Previous: left arrow')
    const n = Number((await octave.getAttribute('aria-label'))!.match(/\d/)![0])
    // Right: the octave up; left: back down. No list opens.
    await drag(page, octave, 60, 0)
    await expect(octave).toHaveAttribute('aria-label', new RegExp(`^Octave ${n + 1}\\.`))
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await drag(page, octave, -60, 0)
    await expect(octave).toHaveAttribute('aria-label', new RegExp(`^Octave ${n}\\.`))
    // Past the slop but short of the swipe: nothing steps, and the list stays shut.
    await drag(page, octave, 20, 0)
    await page.waitForTimeout(100)
    await expect(octave).toHaveAttribute('aria-label', new RegExp(`^Octave ${n}\\.`))
    await expect(page.getByRole('listbox')).toHaveCount(0)
    // A tap still opens the list.
    await octave.click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)

    // The scale steps the same way.
    const scale = page.getByRole('button', { name: /^Scale: / })
    const before = (await scale.getAttribute('aria-label'))!
    await drag(page, scale, 60, 0)
    await expect(scale).not.toHaveAttribute('aria-label', before)
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await drag(page, scale, -60, 0)
    await expect(scale).toHaveAttribute('aria-label', before)

    // The arrow keys on the closed word.
    await octave.focus()
    await page.keyboard.press('ArrowRight')
    await expect(octave).toHaveAttribute('aria-label', new RegExp(`^Octave ${n + 1}\\.`))
    await page.keyboard.press('ArrowLeft')
    await expect(octave).toHaveAttribute('aria-label', new RegExp(`^Octave ${n}\\.`))
    await expect(page.getByRole('listbox')).toHaveCount(0)
  })
})

test.describe('on its side', () => {
  test.use({ viewport: { width: 852, height: 393 } })

  test('the turned octave word steps up and down, as it reads', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
    await page.getByRole('radiogroup', { name: 'Keys view' }).getByRole('radio', { name: 'Keys on the pads' }).click()
    const octave = page.locator('.live__side-end').getByRole('button', { name: /^Octave \d/ })
    await expect(octave).toBeVisible()
    const n = Number((await octave.getAttribute('aria-label'))!.match(/\d/)![0])
    await drag(page, octave, 0, -60)
    await expect(octave).toHaveAttribute('aria-label', new RegExp(`^Octave ${n + 1}\\.`))
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await drag(page, octave, 0, 60)
    await expect(octave).toHaveAttribute('aria-label', new RegExp(`^Octave ${n}\\.`))
    await expect(page.getByRole('listbox')).toHaveCount(0)
  })
})
