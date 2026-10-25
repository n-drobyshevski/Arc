// The beat view as a host shows it: the test host (host/host.ts) reads
// ui://arc/beat.html from the server, puts it in a sandboxed iframe 360px
// wide, and sends it a tool call of show_beat_card through the ext-apps
// AppBridge. Checks the grid, mute, Play, Ask Claude and the error list, with
// no page errors.
import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import { CARDS } from '../../../web/test/core/formats/beatCardFixtures'
import type {} from './host/host'

const HOUSE = CARDS.find((c) => c.heading === 'House')!.card

const HELD = `ARC BEAT 1
name Held bass
tempo 100

[A] bars 2 step 1/8
A7 kick  | X... X... | X... X..x |
A4 hat   | .x.x .x.x | .x.x .xxx |

[B] bars 1 step 1/16
B7 bass  | X--- ..x- X--. o... |`

const BROKEN = `ARC BEAT 1
tempo 300

[A] bars 1 step 1/16
A7 kick | X... X... X... |`

/** Page and console errors of the host and the view, but the 405 the host's client gets for its optional GET stream (the server is stateless). */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    if (m.location().url.endsWith('/mcp') && m.text().includes('405')) return
    errors.push(`console: ${m.text()}`)
  })
  return errors
}

async function show(page: Page, card: string): Promise<FrameLocator> {
  await page.goto('/')
  await expect(page.locator('#status')).toHaveText('ready')
  await page.evaluate(async (c) => {
    await (await window.arcHost).show(c)
  }, card)
  return page.frameLocator('#view')
}

test('draws a genre card: tabs, rows and cells', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, HOUSE)
  await expect(view.getByRole('heading', { name: 'House groove' })).toBeVisible()
  await expect(view.locator('.beat-meta')).toHaveText('124 BPM · swing 52')
  // Groups A and B only.
  await expect(view.getByRole('tab')).toHaveText([/^A/, /^B/])
  await expect(view.getByRole('tab', { selected: true })).toHaveText(/^A/)

  const rows = view.locator('.beat-rows > li')
  await expect(rows).toHaveCount(4)
  await expect(rows.locator('.beat-pad')).toHaveText(['A7', 'A6', 'A5', 'A4'])
  for (let i = 0; i < 4; i++) await expect(rows.nth(i).locator('.beat-cell')).toHaveCount(16)
  await expect(rows.nth(0).locator('.beat-cell.is-hit')).toHaveCount(4)
  await expect(rows.nth(3).locator('.beat-cell.is-hit')).toHaveCount(8)
  await expect(view.getByRole('img', { name: 'A7 kick: X...X...X...X...' })).toBeVisible()

  // B: the bass that only the notes list plays, reached with the keyboard.
  await view.getByRole('tab', { selected: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(view.getByRole('tab', { selected: true })).toHaveText(/^B/)
  await expect(rows).toHaveCount(1)
  await expect(rows.locator('.beat-cell.is-note')).toHaveCount(4)
  await expect(view.getByText(/4 notes from the notes list play too/)).toBeVisible()

  await expect(view.getByText("Preview only — arc can't import cards yet.", { exact: false })).toBeVisible()
  // The host's theme, and no sideways scroll at 360px.
  await expect(view.locator('html')).toHaveAttribute('data-theme', 'dark')
  const overflow = await view.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})

test('draws holds as one long cell and bar lines', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, HELD)
  const rows = view.locator('.beat-rows > li')
  // [A] 2 bars of 1/8: 16 steps a row, a bar line on step 8.
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).locator('.beat-cell')).toHaveCount(16)
  await expect(rows.nth(0).locator('.beat-cell[data-step="8"]')).toHaveClass(/at-bar/)
  await view.getByRole('tab', { name: /^B/ }).click()
  // X--- ..x- X--. o... : 3 held hits (4, 2 and 3 steps) and a single one: 16 - 3 - 1 - 2 = 10 cells.
  const bass = rows.nth(0)
  await expect(bass.locator('.beat-cell')).toHaveCount(10)
  await expect(bass.locator('.beat-cell.is-held')).toHaveCount(3)
  await expect(bass.locator('.beat-cell[data-step="0"]')).toHaveCSS('grid-column-end', 'span 4')
  expect(errors).toEqual([])
})

test('mutes, solos and plays', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, HOUSE)
  const kick = view.locator('.beat-rows > li[data-pad="A7"]')

  const mute = view.getByRole('button', { name: 'Mute A7 kick' })
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  await mute.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await expect(kick).toHaveClass(/is-silent/)
  await mute.press('Enter')
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  await expect(kick).not.toHaveClass(/is-silent/)

  await view.getByRole('button', { name: 'Solo A6 clap' }).click()
  await expect(kick).toHaveClass(/is-silent/)
  await expect(view.locator('.beat-rows > li[data-pad="A6"]')).not.toHaveClass(/is-silent/)

  const play = view.getByRole('button', { name: 'Play' })
  await play.click()
  const stop = view.getByRole('button', { name: 'Stop' })
  await expect(stop).toHaveAttribute('aria-pressed', 'true')
  // The playhead moves.
  await expect(view.locator('.beat-tick.is-now')).toHaveCount(1)
  const first = await view.locator('.beat-tick.is-now').getAttribute('class')
  await page.waitForTimeout(400)
  await view.getByLabel('Tempo').fill('180')
  await expect(view.getByText('180 BPM')).toBeVisible()
  await page.waitForTimeout(300)
  await stop.click()
  await expect(view.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(view.locator('.beat-tick.is-now')).toHaveCount(0)
  expect(first).toBeTruthy()
  await expect(view.getByText("This browser can't play sound here.")).toHaveCount(0)
  expect(errors).toEqual([])
})

test('asks Claude to change the card and copies it', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, HOUSE)
  await view.getByRole('button', { name: 'Mute A7 kick' }).click()
  await view.getByRole('button', { name: 'Ask Claude to change this' }).click()
  await view.getByLabel('What should change?').fill('busier hats')
  await view.getByRole('button', { name: 'Send' }).click()
  await expect(view.getByText('Sent to Claude.')).toBeVisible()
  const messages = await page.evaluate(async () => (await window.arcHost).messages)
  expect(messages).toHaveLength(1)
  const block = messages[0]!.content[0]!
  const text = block.type === 'text' ? block.text : ''
  expect(text).toContain('Please change the ARC BEAT card "House groove": busier hats')
  expect(text).toContain('A7 muted')

  await view.getByRole('button', { name: 'Copy card' }).click()
  // The sandbox may or may not let the clipboard through; either way the card can be copied.
  const copied = view.getByRole('button', { name: 'Copied' })
  const box = view.getByRole('textbox', { name: 'Card text' })
  await expect(copied.or(box)).toBeVisible()
  if (await box.isVisible()) await expect(box).toHaveValue(HOUSE)
  expect(errors).toEqual([])
})

test('lists a broken card’s errors by line', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, BROKEN)
  await expect(view.getByRole('alert')).toContainText("This card can't be read yet.")
  const list = view.locator('.beat-problems.is-error li')
  await expect(list).toHaveCount(2)
  await expect(list.nth(0)).toContainText('line 2')
  await expect(list.nth(1)).toContainText('line 5')
  expect(errors).toEqual([])
})
