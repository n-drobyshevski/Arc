// The beat view as a host shows it: the test host (host/host.ts) reads
// ui://arc/beat.html from the server, puts it in a sandboxed iframe 360px
// wide, and sends it a tool call of show_beat_card through the ext-apps
// AppBridge. Checks the grid, mute, Play, Ask Claude, the error list, a
// card's effect lines and pad shaping with the FX switch, and a card of
// scenes played as its chain and scene by scene, with no page errors.
import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import { CARDS } from '../../../web/test/core/formats/beatCardFixtures'
import type {} from './host/host'

const HOUSE = CARDS.find((c) => c.heading === 'House')!.card
const ARRANGEMENT = CARDS.find((c) => c.heading === 'Breakcore arrangement')!.card

const HELD = `ARC BEAT 1
name Held bass
tempo 100

[A] bars 2 step 1/8
A7 kick  | X... X... | X... X..x |
A4 hat   | .x.x .x.x | .x.x .xxx |

[B] bars 1 step 1/16
B7 bass  | X--- ..x- X--. o... |`

const FX = `ARC BEAT 1
name FX test
tempo 120
fx reverb 60 40
send A 20 B 40
comp 40 60
sidechain A7 B

[A] bars 1 step 1/16
A7 kick | X... X... X... X... |
A4 hat  | .x.x .x.x .x.x .x.x |
pad A4 pitch -7 level 80

[B] bars 1 step 1/16
B7 bass | X-.. ..x. X-.. ..x. |`

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

/** The text of the host's [n]th ui/message. */
async function sentText(page: Page, n: number): Promise<string> {
  const messages = await page.evaluate(async () => (await window.arcHost).messages)
  const block = messages[n]?.content[0]
  return block?.type === 'text' ? block.text : ''
}

test('Regenerate, Improve and a quick change send their requests', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, HOUSE)
  await view.getByRole('button', { name: 'Mute A7 kick' }).click()
  await view.getByRole('button', { name: 'Regenerate' }).click()
  await expect(view.getByText('Sent to Claude.')).toBeVisible()
  const regen = await sentText(page, 0)
  expect(regen).toContain('Please write a new take on the ARC BEAT card "House groove"')
  expect(regen).toContain('A7 muted')
  expect(regen).toContain('show_beat_card')

  await view.getByRole('button', { name: 'Improve' }).click()
  await expect.poll(() => sentText(page, 1)).toContain('Please improve the ARC BEAT card "House groove"')
  await expect(view.getByRole('button', { name: 'Fix errors' })).toHaveCount(0)

  await view.getByRole('button', { name: 'Ask Claude to change this' }).click()
  await view.getByRole('button', { name: 'Ask Claude: busier hats' }).click()
  await expect.poll(() => sentText(page, 2)).toContain('Please change the ARC BEAT card "House groove": busier hats')
  expect(await page.evaluate(async () => (await window.arcHost).messages.length)).toBe(3)
  expect(errors).toEqual([])
})

test('a broken card offers Fix errors with its lines', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, BROKEN)
  await expect(view.getByRole('button', { name: 'Improve' })).toHaveCount(0)
  await view.getByRole('button', { name: 'Fix errors' }).click()
  await expect(view.getByText('Sent to Claude.')).toBeVisible()
  const text = await sentText(page, 0)
  expect(text).toContain('Please fix the ARC BEAT card: line 2:')
  expect(text).toContain('line 5:')
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

test('plays a card’s FX and pad shaping, with the FX switch on and off', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, FX)
  await expect(view.getByRole('heading', { name: 'FX test' })).toBeVisible()
  // The effect and pad lines play now: no warnings.
  await expect(view.locator('.beat-problems')).toHaveCount(0)
  await expect(view.locator('.beat-fx-text')).toHaveText('reverb 60/40 · sends A 20 B 40 · comp 40/60 · sidechain A7 → B')
  const badge = view.locator('.beat-rows > li[data-pad="A4"] .beat-shape')
  await expect(badge).toHaveText('−7 st · 80%')
  await expect(view.getByRole('img', { name: 'A4 shaping: pitch −7 semitones, level 80' })).toBeVisible()
  await expect(view.locator('.beat-rows > li[data-pad="A7"] .beat-shape')).toHaveCount(0)
  await expect(view.getByText("FX are an approximation of arc's, made in the browser.", { exact: false })).toBeVisible()

  const fx = view.getByRole('button', { name: 'FX', exact: true })
  await expect(fx).toHaveAttribute('aria-pressed', 'true')
  await view.getByRole('button', { name: 'Play' }).click()
  await expect(view.locator('.beat-tick.is-now')).toHaveCount(1)
  await page.waitForTimeout(500)
  // Off and on again while playing: a crossfade.
  await fx.click()
  await expect(fx).toHaveAttribute('aria-pressed', 'false')
  await page.waitForTimeout(300)
  await fx.click()
  await expect(fx).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(300)
  await view.getByRole('button', { name: 'Stop' }).click()
  await expect(view.locator('.beat-tick.is-now')).toHaveCount(0)

  // Dry from the start.
  await fx.click()
  await expect(fx).toHaveAttribute('aria-pressed', 'false')
  await view.getByRole('button', { name: 'Play' }).click()
  await expect(view.locator('.beat-tick.is-now')).toHaveCount(1)
  await page.waitForTimeout(500)
  await view.getByRole('button', { name: 'Stop' }).click()
  await expect(view.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(view.getByText("This browser can't play sound here.")).toHaveCount(0)

  // What was heard goes with a request.
  await view.getByRole('button', { name: 'Regenerate' }).click()
  await expect.poll(() => sentText(page, 0)).toContain('the FX off')

  const overflow = await view.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})

test('a card without effect lines has no FX switch', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, HELD)
  await expect(view.getByRole('heading', { name: 'Held bass' })).toBeVisible()
  await expect(view.locator('.beat-fx')).toHaveCount(0)
  await expect(view.locator('.beat-shape')).toHaveCount(0)
  await expect(view.getByText('FX are an approximation', { exact: false })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('plays a card of scenes: the chain, a scene picked by hand, and back', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, ARRANGEMENT)
  await expect(view.getByRole('heading', { name: 'Breakcore track' })).toBeVisible()
  // Every scene and the chain play now: no warnings, no "only the first scene" note.
  await expect(view.locator('.beat-problems')).toHaveCount(0)
  await expect(view.getByText('only the first', { exact: false })).toHaveCount(0)

  const chips = view.getByRole('group', { name: 'Scenes' }).getByRole('button')
  await expect(chips).toHaveCount(5)
  for (const [i, name] of ['Scene 1: Intro', 'Scene 2: Drop', 'Scene 3: Breakdown', 'Scene 4: Build', 'Scene 5: Drop 2'].entries()) {
    await expect(chips.nth(i)).toHaveAccessibleName(name)
  }
  const chain = view.getByRole('button', { name: 'Chain', exact: true })
  const scene = view.getByRole('button', { name: 'Scene', exact: true })
  const where = view.locator('.beat-where')
  // The card has a chain line: Chain, from the first scene.
  await expect(chain).toHaveAttribute('aria-pressed', 'true')
  await expect(scene).toHaveAttribute('aria-pressed', 'false')
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await expect(where).toHaveText('Chain 1x2 2x2 3 4 5x2')
  await expect(view.locator('[aria-current]')).toHaveCount(0)

  // 240 BPM: a bar a second, so Intro's two passes of 2 bars last 4 s.
  await view.getByLabel('Tempo').fill('240')
  await view.getByRole('button', { name: 'Play' }).click()
  await expect(chips.nth(0)).toHaveAttribute('aria-current', 'true')
  await expect(where).toHaveText(/^Intro · pass [12]\/2 · step 1\/5$/)
  await expect(view.locator('.beat-tick.is-now')).toHaveCount(1)
  // The chain moves on to Drop, and the grid follows it.
  await expect(chips.nth(1)).toHaveAttribute('aria-current', 'true')
  await expect(chips.nth(0)).not.toHaveAttribute('aria-current', 'true')
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(where).toHaveText(/^Drop · pass [12]\/2 · step 2\/5$/)
  await expect(view.locator('.beat-rows > li[data-pad="A8"]')).toHaveCount(1)

  // Picking Build switches to Scene; Build is heard from the next bar line.
  await chips.nth(3).click()
  await expect(scene).toHaveAttribute('aria-pressed', 'true')
  await expect(chain).toHaveAttribute('aria-pressed', 'false')
  await expect(chips.nth(3)).toHaveAttribute('aria-pressed', 'true')
  await expect(chips.nth(3)).toHaveAttribute('aria-current', 'true')
  await expect(where).toHaveText('Build · on loop')
  await expect(view.locator('[aria-current]')).toHaveCount(1)
  // Build leaves B out: it plays Breakdown's bass.
  const b = view.getByRole('tab', { name: /^B/ })
  await expect(b).toContainText('from scene 3')
  await b.click()
  await expect(view.getByText('This scene leaves B out: it plays the pattern of scene 3 (Breakdown).')).toBeVisible()
  await expect(view.locator('.beat-tick.is-now')).toHaveCount(1)

  // The chips work from the keyboard.
  await chips.nth(4).focus()
  await page.keyboard.press('Enter')
  await expect(chips.nth(4)).toHaveAttribute('aria-pressed', 'true')
  await expect(chips.nth(4)).toHaveAttribute('aria-current', 'true')
  await expect(where).toHaveText('Drop 2 · on loop')

  // What was heard goes with a request.
  await view.getByRole('button', { name: 'Regenerate' }).click()
  await expect.poll(() => sentText(page, 0)).toContain('scene 5 (Drop 2) on loop')

  // Back to the chain: it goes on from Drop 2's step, then loops to Intro.
  await chain.click()
  await expect(chain).toHaveAttribute('aria-pressed', 'true')
  await expect(where).toHaveText(/^Drop 2 · pass [12]\/2 · step 5\/5$/)
  await expect(chips.nth(0)).toHaveAttribute('aria-current', 'true')

  await view.getByRole('button', { name: 'Stop' }).click()
  await expect(view.getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(view.locator('[aria-current]')).toHaveCount(0)
  await expect(view.locator('.beat-tick.is-now')).toHaveCount(0)
  await expect(view.getByText("This browser can't play sound here.")).toHaveCount(0)

  const overflow = await view.locator('html').evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})

test('a card without scenes has no scene strip', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await show(page, HOUSE)
  await expect(view.getByRole('heading', { name: 'House groove' })).toBeVisible()
  await expect(view.locator('.beat-scenes')).toHaveCount(0)
  await expect(view.getByRole('button', { name: 'Chain', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
