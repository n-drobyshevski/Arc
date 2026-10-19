// End-to-end: a tap on KEYS' scale, key or octave word opens the KEYS sheet (Kotlin KeysSheet.kt): the scales with
// their notes as dots, the keys and the octaves. A pick applies at once and the sheet stays open; ✕, Escape and Back
// close it. On a phone on its side the scales take two columns and the keys and octaves sit side by side.
import { expect, test } from './fixtures'

const SHEET = 'Scale, key and octave'

test.describe('upright', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the scale word opens the sheet; a pick applies and it stays open; ✕ and Escape close it', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
    await expect(page.locator('.live-kgrid')).toBeVisible()

    const scale = page.getByRole('button', { name: /^Scale: / })
    await expect(scale).toHaveAttribute('aria-haspopup', 'dialog')
    await scale.click()
    const sheet = page.getByRole('dialog', { name: SHEET })
    await expect(sheet).toBeVisible()
    // Ten scales, the one picked checked, each saying how many notes; twelve dots a row.
    const scales = sheet.getByRole('radiogroup', { name: 'Scale' }).getByRole('radio')
    await expect(scales).toHaveCount(10)
    await expect(sheet.getByRole('radio', { checked: true, name: /notes$/ })).toHaveCount(1)
    await expect(sheet.locator('.scale-row').first().locator('circle')).toHaveCount(12)
    await expect(sheet.locator('.scale-row').first().locator('.scale-dots__root')).toHaveCount(1)

    // A scale: applied at once, the sheet still open.
    await sheet.getByRole('radio', { name: 'Dorian, 7 notes' }).click()
    await expect(sheet.getByRole('radio', { name: 'Dorian, 7 notes' })).toHaveAttribute('aria-checked', 'true')
    await expect(scale).toHaveAttribute('aria-label', /^Scale: Dorian\./)
    await expect(sheet).toBeVisible()
    // A key and an octave the same way.
    await expect(sheet.getByRole('radiogroup', { name: 'Key' }).getByRole('radio')).toHaveCount(12)
    await sheet.getByRole('radio', { name: 'Key RE', exact: true }).click()
    await expect(sheet.getByRole('radio', { name: 'Key RE', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(sheet.getByRole('radiogroup', { name: 'Octave' }).getByRole('radio')).toHaveCount(9)
    await sheet.getByRole('radio', { name: 'Octave 6' }).click()
    await expect(sheet.getByRole('radio', { name: 'Octave 6' })).toHaveAttribute('aria-checked', 'true')

    // ✕ closes it, and the words say what was picked.
    await sheet.getByRole('button', { name: 'Close scale, key and octave' }).click()
    await expect(sheet).toHaveCount(0)
    const octave = page.getByRole('button', { name: /^Octave \d/ })
    await expect(octave).toHaveAttribute('aria-label', /^Octave 6\./)

    // The octave word opens it too; Escape closes it.
    await octave.click()
    await expect(sheet).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  })
})

test.describe('on its side', () => {
  test.use({ viewport: { width: 852, height: 393 } })

  test('two columns of scales, the keys beside the octaves; the octave word shows its section; Back closes it', async ({ page }) => {
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]')).toHaveCount(12)
    await page.getByRole('button', { name: 'Pads. Tap for keys.' }).click()
    await page.getByRole('radiogroup', { name: 'Keys view' }).getByRole('radio', { name: 'Keys on the pads' }).click()
    const octave = page.locator('.live__side-end').getByRole('button', { name: /^Octave \d/ })
    await expect(octave).toBeVisible()
    await octave.click()
    const sheet = page.getByRole('dialog', { name: SHEET })
    await expect(sheet).toBeVisible()
    // The octave picked, in view.
    await expect(sheet.getByRole('radio', { name: 'Octave', checked: true })).toBeInViewport()
    // Column by column: Chromatic over Major on the left, the second half on the right.
    const first = (await sheet.getByRole('radio', { name: /^Chromatic, / }).boundingBox())!
    const second = (await sheet.getByRole('radio', { name: /^Major, / }).boundingBox())!
    const right = (await sheet.getByRole('radio', { name: /^Blues, / }).boundingBox())!
    expect(second.x).toBe(first.x)
    expect(second.y).toBeGreaterThan(first.y)
    expect(right.x).toBeGreaterThan(first.x + first.width)
    // The keys left of the octaves.
    const key = (await sheet.getByRole('radiogroup', { name: 'Key' }).boundingBox())!
    const oct = (await sheet.getByRole('radiogroup', { name: 'Octave' }).boundingBox())!
    expect(oct.x).toBeGreaterThan(key.x + key.width)
    await page.goBack()
    await expect(sheet).toHaveCount(0)
    await expect(octave).toBeVisible()
  })
})
