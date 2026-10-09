// End-to-end: while Live's sound plays late the top bar has an amber Bluetooth
// key (a Bluetooth glyph and a clock) right before the connection key, in
// Chromium with the simulated EP-133 of ?demo. The output's latency is made long
// (140 ms) before the app loads; once a press wakes the output, LiveAudio.late
// reaches the bar through ArcController.liveLate. The display lines no longer
// carry it: their words stay the hit or "Press a pad on the EP-133.". A tap on
// the key says why in the toast, a long press names it, the guide overlay tags
// it, and it is on Live only.
import type { Page } from '@playwright/test'
import { coachHides, demo, expect, test } from './fixtures'

const SENTENCE = 'Bluetooth plays late: wired or the speaker is quicker'
const WAITING = 'Press a pad on the EP-133.'

/** Live on the demo device, its output [ms] late (baseLatency 0), woken by a press. */
async function lateLive(page: Page, ms = 140): Promise<void> {
  await page.addInitScript((seconds) => {
    for (const [name, value] of [
      ['baseLatency', 0],
      ['outputLatency', seconds],
    ] as const) {
      Object.defineProperty(AudioContext.prototype, name, { configurable: true, get: () => value })
    }
  }, ms / 1000)
  await page.goto('/?demo#/live')
  const pads = page.locator('[data-pad]')
  await expect(pads.first()).toBeVisible()
  await pads.first().click()
}

const bar = (page: Page) => page.getByRole('banner')
/** A Bluetooth or clock glyph anywhere on Live's display lines (the key is the bar's alone). */
const onLines = (page: Page) =>
  page.locator('.live-strip svg[data-icon="BLUETOOTH"], .live-display svg[data-icon="BLUETOOTH"], .live-strip svg[data-icon="CLOCK"], .live-display svg[data-icon="CLOCK"]')
const key = (page: Page) => bar(page).getByRole('button', { name: SENTENCE })

test.describe('on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('the key is in the bar before the connection key: amber, dark ink, Bluetooth and a clock', async ({ page }) => {
    await lateLive(page)
    await expect(key(page)).toBeVisible()
    await expect(key(page)).toHaveAttribute('title', 'Bluetooth delay')
    await expect(key(page).locator('svg[data-icon="BLUETOOTH"]')).toHaveCount(1)
    await expect(key(page).locator('svg[data-icon="CLOCK"]')).toHaveCount(1)
    const [k, connection] = await Promise.all([
      key(page).boundingBox(),
      bar(page).getByRole('button', { name: /^EP-133 connected/ }).boundingBox(),
    ])
    // A square key of the bar's size, 8 before the connection key.
    expect(k!.width).toBe(44)
    expect(k!.height).toBe(44)
    expect(connection!.x - (k!.x + k!.width)).toBeGreaterThanOrEqual(4)
    expect(connection!.x - (k!.x + k!.width)).toBeLessThanOrEqual(8)
    expect(k!.x).toBeLessThan(connection!.x)
    const look = await key(page).evaluate((el) => {
      const root = getComputedStyle(document.documentElement)
      return { face: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color, warn: root.getPropertyValue('--warn').trim() }
    })
    expect(look.face).toBe('rgb(232, 165, 62)')
    expect(look.warn.toLowerCase()).toBe('#e8a53e')
    // Dark on the amber: the tag ink, as on the phone (the same in light and dark).
    expect(look.ink).toBe('rgb(30, 31, 33)')
    // Both glyphs at 20 px side by side with no gap, as the phone draws them.
    const [bt, clock] = await Promise.all([
      key(page).locator('svg[data-icon="BLUETOOTH"]').boundingBox(),
      key(page).locator('svg[data-icon="CLOCK"]').boundingBox(),
    ])
    expect(bt!.width).toBe(20)
    expect(clock!.width).toBe(20)
    expect(clock!.x - (bt!.x + bt!.width)).toBeCloseTo(0, 0)
    // The bar has nothing else new: the tag, this key, the connection key, ? (and the screen readers' Disconnect).
    await expect(bar(page).getByRole('button')).toHaveCount(5)
  })

  test('the lines no longer have a chip: the hit shows, and the words are the same', async ({ page }) => {
    await lateLive(page)
    await expect(onLines(page)).toHaveCount(0)
    await expect(page.locator('.live-strip__line')).toHaveText(WAITING)
    await expect(page.locator('.live-strip__line')).not.toHaveText(SENTENCE)
    await demo(page, (d) => d.clock('start'))
    await demo(page, (d) => d.noteOn(37, 127))
    const strip = page.locator('.live-strip').first()
    await expect(strip.getByRole('img', { name: 'Playing' })).toBeVisible()
    await expect(strip.getByText(/ BPM$/)).not.toHaveClass(/sr-only/)
    await expect(strip.locator('.live-strip__line')).toHaveText(/^A .+ · 127$/)
    // KEYS keeps its word on the line, too.
    await page.keyboard.press('KeyM')
    await expect(strip.getByText('KEYS', { exact: true })).not.toHaveClass(/sr-only/)
    await page.keyboard.press('KeyM')
    // And the all-groups display has no chip beside its tempo.
    await page.getByRole('button', { name: 'Live tools' }).click()
    await page.getByRole('radio', { name: 'All groups' }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.live-display')).toBeVisible()
    await expect(onLines(page)).toHaveCount(0)
    await expect(key(page)).toBeVisible()
  })

  test('a tap says the full sentence in the toast', async ({ page }) => {
    await lateLive(page)
    await key(page).click()
    await expect(page.getByRole('status').filter({ hasText: SENTENCE })).toBeVisible()
  })

  test('a long press names it', async ({ page }) => {
    await lateLive(page)
    const box = (await key(page).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect(page.locator('.icon-block__tip')).toHaveText('Bluetooth delay', { timeout: 2000 })
    await page.mouse.up()
    // The click that ends a long press says nothing more.
    await expect(page.getByRole('status').filter({ hasText: SENTENCE })).toHaveCount(0)
  })

  test('it is on Live alone', async ({ page }) => {
    await lateLive(page)
    await expect(key(page)).toBeVisible()
    await page.goto('/?demo#/backups')
    await expect(bar(page).getByRole('button', { name: /^EP-133 connected/ })).toBeVisible()
    await expect(key(page)).toHaveCount(0)
    await page.goto('/?demo#/live')
    await expect(page.locator('[data-pad]').first()).toBeVisible()
  })

  test('the guide overlay tags it, and every tag stays in view and clear', async ({ page }) => {
    await lateLive(page)
    await page.getByRole('banner').getByRole('button', { name: "What's what" }).click()
    const coach = page.getByRole('dialog', { name: "What's what" })
    await expect(coach.locator('[data-coach-tag="top.bluetooth"]')).toHaveText('BLUETOOTH DELAY')
    await expect(coach.locator('[data-coach-tag="top.connection"]')).toBeVisible()
    expect(await coachHides(page)).toEqual([])
    // A 360 phone is one key tighter than the tags like.
    await page.setViewportSize({ width: 360, height: 780 })
    await expect(coach.locator('[data-coach-tag="top.bluetooth"]')).toBeVisible()
    await expect.poll(() => coachHides(page)).toEqual([])
  })

  test('the bar still fits at 320 wide, the keys whole', async ({ page }) => {
    await lateLive(page)
    await page.setViewportSize({ width: 320, height: 640 })
    const boxes = await Promise.all(
      [key(page), bar(page).getByRole('button', { name: /^EP-133 connected/ }), bar(page).getByRole('button', { name: "What's what" })].map((l) => l.boundingBox()),
    )
    for (const b of boxes) {
      expect(b!.width).toBe(44)
      expect(b!.x + b!.width).toBeLessThanOrEqual(320)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  })

  test('without a late output there is no key', async ({ page }) => {
    await page.goto('/?demo#/live')
    const pads = page.locator('[data-pad]')
    await expect(pads.first()).toBeVisible()
    await pads.first().click()
    await expect(bar(page).getByRole('button', { name: /^EP-133 connected/ })).toBeVisible()
    await expect(key(page)).toHaveCount(0)
  })
})

test.describe('on the desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the key is in the bar before the connection key, and the theme switch stays last', async ({ page }) => {
    await lateLive(page)
    await expect(key(page)).toBeVisible()
    const xs = await Promise.all(
      [key(page), bar(page).getByRole('button', { name: /^EP-133 connected/ }), bar(page).getByRole('button', { name: "What's what" })].map(
        async (l) => (await l.boundingBox())!.x,
      ),
    )
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect(new Set(xs).size).toBe(3)
    await expect(onLines(page)).toHaveCount(0)
    await expect(page.locator('.live-strip__line')).toHaveText(WAITING)
  })
})
