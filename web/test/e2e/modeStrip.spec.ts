// KEYS / PADS printed on every plate (Android's ModeStrip): one group and KEYS' grid on a phone
// on its side and on the desk carry the strip in the plate's right margin, clear of the pads, with
// RPT (ARP) and LATCH in its lower half; a tap switches the mode. The piano keeps its mode row.
import { expect, test } from './fixtures'

for (const [name, width, height] of [
  ['a phone on its side', 852, 393],
  ['the desk', 1280, 800],
] as const) {
  test(`KEYS / PADS on the plate: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/?demo')
    await expect(page.locator('.live-strip').first()).toContainText('Project 1')
    const strip = page.locator('.mode-strip')
    await expect(strip).toHaveCount(1)
    await expect(strip.getByRole('switch', { name: 'Note repeat' })).toBeVisible()
    await expect(strip.getByRole('switch', { name: 'Latch' })).toBeVisible()
    // Right of the pads, inside the plate.
    const stripBox = (await strip.boundingBox())!
    const nine = (await page.locator('[data-pad="9"]').boundingBox())!
    expect(stripBox.x).toBeGreaterThanOrEqual(nine.x + nine.width)

    // A pad tapped (KEYS plays its sound), then the strip: KEYS, on the piano (its row, no strip).
    await page.locator('[data-pad="9"]').click()
    await strip.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
    await expect(strip).toHaveCount(0)
    await page.getByRole('radiogroup', { name: 'Keys view' }).getByRole('radio', { name: 'Keys on the pads' }).click()
    // KEYS' grid: the strip on its plate, RPT reading ARP; the scale and the octave kept.
    await expect(strip.getByRole('button', { name: 'Keys. Tap for pads.' })).toBeVisible()
    await expect(strip.getByRole('switch', { name: 'Arpeggiator' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Scale/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Octave/ })).toBeVisible()

    await strip.getByRole('button', { name: 'Keys. Tap for pads.' }).click()
    await expect(strip.getByRole('button', { name: 'Pads. Tap for keys.' })).toBeVisible()
    await expect(page.locator('[data-pad="9"]')).toBeVisible()
  })
}
