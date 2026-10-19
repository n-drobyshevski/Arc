// The trim and the sample review sheets on a short window (a phone on its side), as Android's short
// layouts (TrimSheet.kt, SampleReviewSheet.kt): two columns, the waveform on the left and the keys
// on the right; upright they keep one column.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/** Half a second of a 440 Hz tone, 16-bit mono at 44.1 kHz. */
function toneWav(): Buffer {
  const rate = 44100
  const n = rate / 2
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), i * 2)
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(rate, 24)
  head.writeUInt32LE(rate * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!

async function openTrim(page: Page): Promise<void> {
  await page.goto('/?demo#/device')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add samples' }).click()
  await (await chooser).setFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: toneWav() })
  await page.getByRole('button', { name: 'Trim', exact: true }).click()
  await expect(page.locator('.trim-sheet__keys')).toBeAttached()
  await expect(page.locator('.waveform').first()).toBeVisible()
}

test.describe('a phone on its side', () => {
  test.use({ viewport: { width: 852, height: 393 } })

  test('the trim sheet: the waveform left, 72 high, the keys right', async ({ page }) => {
    await openTrim(page)
    const wave = await box(page, '.trim-sheet__main .waveform')
    const keys = await box(page, '.trim-sheet__keys')
    expect(keys.x).toBeGreaterThanOrEqual(wave.x + wave.width)
    expect(Math.round(wave.height)).toBe(72)
  })

  test('the review sheet: the take left, the switches, slot and keys right', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    })
    await page.goto('/?demo')
    await expect(page.locator('[data-pad]').first()).toBeVisible()
    await page.getByRole('button', { name: 'Sample' }).click()
    await expect(page.getByRole('region', { name: 'Sample' })).toBeVisible()
    const pad = page.locator('[data-pad="9"]')
    const b = (await pad.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(1200)
    await page.mouse.up()
    const review = page.getByRole('dialog', { name: 'New sample' })
    await expect(review).toBeVisible()
    const main = await box(page, '.sample-review__main')
    const side = await box(page, '.sample-review__side')
    expect(side.x).toBeGreaterThanOrEqual(main.x + main.width)
  })
})

test.describe('an upright phone', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('the trim sheet keeps one column', async ({ page }) => {
    await openTrim(page)
    const wave = await box(page, '.trim-sheet .waveform, .waveform')
    const done = await box(page, '.trim-sheet__keys .key')
    expect(done.y).toBeGreaterThan(wave.y + wave.height)
  })
})
