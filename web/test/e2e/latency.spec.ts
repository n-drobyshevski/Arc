// End-to-end: the debug screen's latency test, in Chromium with the
// simulated EP-133 of ?demo. A pad pressed in Live (its pointerdown's
// timeStamp the press time) shows on its engine's row once the output
// reports it heard; the latencyHint choice is kept in localStorage and Live
// opens at it; Reset clears the rows' times. The output's latency is fixed
// before the app loads, so the row's estimate is known. Open, the panel takes
// the log's place (on a phone too, where it scrolls down to Reset).
import type { Page } from '@playwright/test'
import { LatencyText } from '../../src/core/text/latencyText'
import { demo, expect, test } from './fixtures'

/** liveAudio.ts's CHOICE_KEY (that module loads the worklet through Vite, so it isn't imported here). */
const CHOICE_KEY = 'arc.liveLatencyChoice'

/**
 * Pad A "." in Live, named by the device (a note-on with its pad push) and
 * pressed until its voice rings: the demo's samples are short, so a
 * MutationObserver counts each time a ring comes on, and a press that needed
 * the device while it was busy reading (as on Android, it plays nothing) is
 * made again. Then once more, from memory: a press that had to load its
 * sample isn't timed. That press waits for the first ring to go out: a pad
 * pressed again while it still sounds keeps its ring on, so a new ring only
 * shows once the first one is gone.
 */
async function pressPad(page: Page): Promise<void> {
  const pad = page.locator('[data-pad]', { hasText: 'kick' }).first()
  // Until Live's first read of the device is done, the push names nothing: sent again until it does.
  await expect(async () => {
    await demo(page, (d) => {
      d.noteOn(36, 127)
      d.pushPadActive(1, 0, 1)
    })
    await demo(page, (d) => d.noteOff(36))
    await expect(pad).toBeVisible({ timeout: 1_000 })
  }).toPass()
  // One observer a page (this runs again after Live comes back), counting a pad's ring going from off to on.
  await page.evaluate(() => {
    const w = window as unknown as { __arcRings?: number }
    if (w.__arcRings !== undefined) return
    w.__arcRings = 0
    const ringing = (cls: string | null): boolean => /(^|\s)is-playing(\s|$)/.test(cls ?? '')
    new MutationObserver((records) => {
      records.forEach((r, i) => {
        const el = r.target as Element
        if (!el.matches('[data-pad]')) return
        // The class after this change: the next change's old one, or the class now.
        const next = records.slice(i + 1).find((n) => n.target === el)
        if (!ringing(r.oldValue) && ringing(next ? next.oldValue : el.className)) w.__arcRings = (w.__arcRings ?? 0) + 1
      })
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true })
  })
  const rings = (): Promise<number> => page.evaluate(() => (window as unknown as { __arcRings: number }).__arcRings)
  const start = await rings()
  for (let attempt = 0; attempt < 3 && (await rings()) === start; attempt++) {
    await pad.click()
    await expect.poll(rings, { timeout: 5_000 }).toBeGreaterThan(start).catch(() => undefined)
  }
  expect(await rings()).toBeGreaterThan(start)
  await expect(pad).not.toHaveClass(/(^|\s)is-playing(\s|$)/)
  const before = await rings()
  await pad.click()
  await expect.poll(rings, { timeout: 5_000 }).toBeGreaterThan(before)
}

/** The rate Chromium's outputs run at here (Live's context takes the device's own). */
function deviceRate(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ctx = new AudioContext()
    const rate = ctx.sampleRate
    void ctx.close()
    return rate
  })
}

/** From Live to the debug screen, through Settings. */
async function openDebug(page: Page): Promise<void> {
  await page.getByRole('banner').getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Debug log' }).click()
  await expect(page.locator('[data-screen="debug"]')).toBeVisible()
}

test('the latency test shows each engine tried, and its choice reopens Live at the other latencyHint', async ({ page }) => {
  await page.addInitScript(() => {
    for (const [name, value] of [
      ['baseLatency', 0.005],
      ['outputLatency', 0.02],
    ] as const) {
      Object.defineProperty(AudioContext.prototype, name, { configurable: true, get: () => value })
    }
  })
  await page.goto('/?demo#/live')
  await pressPad(page)
  await openDebug(page)

  // Folded under its title above the log; open, how to run it and the choice, in the log's place.
  const panel = page.locator('.debug__latency')
  await expect(page.getByRole('log')).toBeVisible()
  await panel.getByRole('button', { name: LatencyText.TITLE }).click()
  await expect(panel.getByText(LatencyText.HOW_TO)).toBeVisible()
  await expect(page.getByRole('log')).toHaveCount(0)
  const choice = panel.getByRole('radiogroup', { name: LatencyText.ENGINE })
  await expect(choice.getByRole('radio', { name: LatencyText.hint('ZERO') })).toBeChecked()
  await expect(choice.getByText(LatencyText.hintNote('ZERO'))).toBeVisible()

  // The press in Live is on the row of the engine it played through.
  const rate = await deviceRate(page)
  const zero = LatencyText.webEngine('ZERO', rate)
  const rows = panel.locator('.debug__engine')
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator('.debug__engine-name')).toHaveText(zero)
  await expect(rows.first()).toContainText(LatencyText.IN_USE)
  await expect(rows.first().locator('.debug__stats')).toContainText(/ · [1-4] press(es)?$/)
  await expect(rows.first()).toContainText(LatencyText.webEstimate(5, 20))

  // The other choice: kept, and Live opens at it (the old output let go).
  await choice.getByRole('radio', { name: LatencyText.hint('INTERACTIVE') }).click()
  await expect(choice.getByRole('radio', { name: LatencyText.hint('INTERACTIVE') })).toBeChecked()
  expect(await page.evaluate((k) => localStorage.getItem(k), CHOICE_KEY)).toBe('INTERACTIVE')
  await expect(rows.first()).not.toContainText(LatencyText.IN_USE)
  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL(/#\/live$/)
  await pressPad(page)
  await openDebug(page)
  // The disclosure opens as it was left.
  await expect(panel.getByText(LatencyText.HOW_TO)).toBeVisible()
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1).locator('.debug__engine-name')).toHaveText(LatencyText.webEngine('INTERACTIVE', rate))
  await expect(rows.nth(1)).toContainText(LatencyText.IN_USE)
  await expect(rows.nth(1).locator('.debug__stats')).toContainText(/ · [1-4] press(es)?$/)

  // Reset clears the times; the engines tried keep their rows.
  await panel.getByRole('button', { name: LatencyText.RESET }).click()
  await expect(rows).toHaveCount(2)
  await expect(panel.locator('.debug__stats')).toHaveCount(0)
  await expect(rows.first()).toContainText(LatencyText.NO_PRESSES)
  await expect(rows.nth(1)).toContainText(LatencyText.NO_PRESSES)
  await expect(panel.getByRole('button', { name: LatencyText.RESET })).toBeDisabled()

  // Folded, the log is back.
  await panel.getByRole('button', { name: LatencyText.TITLE }).click()
  await expect(page.getByRole('log')).toBeVisible()
})

test('on a phone the open latency test has the screen to itself and scrolls down to Reset', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/?demo#/live')
  await pressPad(page)
  await openDebug(page)
  const panel = page.locator('.debug__latency')
  await panel.getByRole('button', { name: LatencyText.TITLE }).click()
  await expect(page.getByRole('log')).toHaveCount(0)
  await expect(panel.locator('.debug__engine')).toHaveCount(1)
  // The panel scrolls inside the screen: Reset comes into view, inside the window.
  const reset = panel.getByRole('button', { name: LatencyText.RESET })
  await reset.scrollIntoViewIfNeeded()
  await expect(reset).toBeInViewport({ ratio: 1 })
  await expect(reset).toBeEnabled()
  const box = await panel.boundingBox()
  expect(box && box.y + box.height).toBeLessThanOrEqual(852)
})
