// The groove gallery as a host shows it: the test host (host/host.ts, opened
// with ?tool=browse_grooves) reads ui://arc/grooves.html from the server, puts
// it in a sandboxed iframe 360px wide, and sends it a call of browse_grooves
// through the ext-apps AppBridge. Checks the 36 tiles and their thumbnails in
// both host themes, the notes under About the card, the family chips and the
// search box, Play and Stop with one tile playing at a time, Make one like
// this and Show in preview, and a gallery the model searched or limited, with
// no page errors.
import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import { GROOVES } from '../../src/grooves'
import { GroovesViewText } from '../../src/groovesText'
import type {} from './host/host'

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

async function browse(page: Page, args: Record<string, unknown> = {}, theme = 'dark'): Promise<FrameLocator> {
  await page.goto(`/?tool=browse_grooves&theme=${theme}`)
  await expect(page.locator('#status')).toHaveText('ready')
  await page.evaluate(async (a) => {
    await (await window.arcHost).call(a)
  }, args)
  return page.frameLocator('#view')
}

/** The text of the host's [n]th ui/message. */
async function sentText(page: Page, n: number): Promise<string> {
  const messages = await page.evaluate(async () => (await window.arcHost).messages)
  const block = messages[n]?.content[0]
  return block?.type === 'text' ? block.text : ''
}

const tile = (view: FrameLocator, name: string) => view.getByRole('listitem', { name, exact: true })

for (const theme of ['dark', 'light']) {
  test(`draws a tile for each of the 36 grooves (${theme} host)`, async ({ page }) => {
    const errors = watchErrors(page)
    const view = await browse(page, {}, theme)
    await expect(view.getByRole('heading', { level: 1 })).toHaveText(GroovesViewText.TITLE)
    const tiles = view.locator('.groove')
    await expect(tiles).toHaveCount(36)
    await expect(tiles.locator('.groove-name')).toHaveText(GROOVES.map((g) => g.name))
    await expect(view.getByRole('status').first()).toHaveText('36 grooves')

    const house = tile(view, 'House')
    await expect(house.locator('.groove-meta')).toHaveText('House and club · 120-128 BPM · swing 50-54')
    await expect(house.locator('.groove-feel')).toContainText('four on the floor, a clap on 2 and 4')
    // The first pattern's rows (A7, A6, A5, A4), hits shaded by velocity.
    const thumb = house.getByRole('img', { name: 'Group A pattern, 1 bar' })
    await expect(thumb).toBeVisible()
    await expect(thumb.locator('.groove-thumb-lane')).toHaveCount(4)
    // Kick 4, clap 2, open hat 4, closed hat 8.
    await expect(thumb.locator('.groove-thumb-hits rect')).toHaveCount(18)
    await expect(house.locator('.groove-badge')).toHaveCount(0)
    await expect(view.locator('.groove-badge')).toHaveCount(7)
    await expect(tile(view, 'One drop').locator('.groove-badge')).toHaveText('EP-40')
    // The feel's code spans are drawn as code.
    await expect(tile(view, 'Trap').locator('.groove-feel code')).toHaveText('notes')

    // A recipe's note, folded under About the card; a groove without one has none.
    const notes = GROOVES.filter((g) => g.note !== null)
    await expect(view.locator('.groove-about')).toHaveCount(notes.length)
    await expect(tile(view, 'Techno').locator('.groove-about')).toHaveCount(0)
    const about = house.locator('.groove-about')
    await expect(about.locator('p')).toBeHidden()
    await about.getByText(GroovesViewText.ABOUT).click()
    await expect(about.locator('p')).toBeVisible()
    await expect(about.locator('p')).toContainText('line makes the kick (A7) duck the bass group')
    await expect(about.locator('p code').first()).toHaveText('sidechain')
    expect(errors).toEqual([])
  })
}

test('the family chips and the search box narrow the tiles', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await browse(page)
  const chips = view.getByRole('group', { name: GroovesViewText.FAMILIES }).getByRole('button')
  await expect(chips).toHaveText([
    'All',
    'Techno',
    'House and club',
    'Hip-hop and trap',
    'Drum and bass and breaks',
    'Latin and African',
    'Pop and rock',
    'Reggae and dub (EP-40)',
  ])
  const all = view.getByRole('button', { name: 'All', exact: true })
  await expect(all).toHaveAttribute('aria-pressed', 'true')

  const techno = view.getByRole('button', { name: 'Techno', exact: true })
  await techno.click()
  await expect(techno).toHaveAttribute('aria-pressed', 'true')
  await expect(all).toHaveAttribute('aria-pressed', 'false')
  await expect(view.locator('.groove')).toHaveCount(12)
  await expect(view.locator('.groove-family')).toHaveText(new Array(12).fill('Techno'))
  await expect(view.getByText('12 of 36 grooves')).toBeVisible()

  // The search keeps to the family: every word in the name, family or feel.
  const search = view.getByRole('searchbox', { name: GroovesViewText.SEARCH })
  await search.fill('acid')
  await expect(view.locator('.groove-name')).toHaveText(['Acid techno'])
  await view.getByRole('button', { name: 'Hip-hop and trap' }).click()
  await expect(view.locator('.groove')).toHaveCount(0)
  await expect(view.getByText(GroovesViewText.NONE)).toBeVisible()
  await search.fill('808 stutter')
  await expect(view.locator('.groove-name')).toHaveText(['Trap'])

  // From the keyboard: All is a button like the rest.
  await search.fill('')
  await all.focus()
  await page.keyboard.press('Enter')
  await expect(view.locator('.groove')).toHaveCount(36)
  expect(errors).toEqual([])
})

test('Play and Stop a tile, one tile playing at a time', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await browse(page)
  const house = tile(view, 'House')
  const techno = tile(view, 'Techno')

  await house.getByRole('button', { name: 'Play House' }).click()
  const stopHouse = house.getByRole('button', { name: 'Stop House' })
  await expect(stopHouse).toHaveAttribute('aria-pressed', 'true')
  await expect(house).toHaveClass(/is-playing/)
  await page.waitForTimeout(300)
  await stopHouse.click()
  await expect(house.getByRole('button', { name: 'Play House' })).toHaveAttribute('aria-pressed', 'false')
  await expect(house).not.toHaveClass(/is-playing/)

  // Starting another stops the first.
  await house.getByRole('button', { name: 'Play House' }).click()
  await expect(house.getByRole('button', { name: 'Stop House' })).toBeVisible()
  await techno.getByRole('button', { name: 'Play Techno' }).click()
  await expect(techno.getByRole('button', { name: 'Stop Techno' })).toHaveAttribute('aria-pressed', 'true')
  await expect(house.getByRole('button', { name: 'Play House' })).toHaveAttribute('aria-pressed', 'false')
  await expect(view.locator('.groove.is-playing')).toHaveCount(1)
  await expect(view.locator('.groove-play[aria-pressed="true"]')).toHaveCount(1)

  // A card of scenes and FX plays too (its chain, through the beat view's player).
  const arrangement = tile(view, 'Breakcore arrangement')
  await arrangement.getByRole('button', { name: 'Play Breakcore arrangement' }).click()
  await expect(arrangement.getByRole('button', { name: 'Stop Breakcore arrangement' })).toBeVisible()
  await expect(view.locator('.groove.is-playing')).toHaveCount(1)
  await page.waitForTimeout(300)
  await arrangement.getByRole('button', { name: 'Stop Breakcore arrangement' }).click()
  await expect(view.locator('.groove.is-playing')).toHaveCount(0)
  await expect(view.getByText(GroovesViewText.NO_AUDIO)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Make one like this and Show in preview send their requests with the card', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await browse(page)
  const garage = GROOVES.find((g) => g.id === 'uk-garage')!
  const t = tile(view, 'UK garage')
  await t.getByRole('button', { name: GroovesViewText.LIKE }).click()
  await expect(t.getByText(GroovesViewText.SENT)).toBeVisible()
  const like = await sentText(page, 0)
  expect(like).toBe(GroovesViewText.likeMessage(garage))
  expect(like).toContain('"UK garage"')

  await t.getByRole('button', { name: GroovesViewText.PREVIEW }).click()
  await expect.poll(() => sentText(page, 1)).toBe(GroovesViewText.previewMessage(garage))
  expect(await page.evaluate(async () => (await window.arcHost).messages.length)).toBe(2)

  // Copy card: the sandbox may or may not let the clipboard through; either way the card can be copied.
  await t.getByRole('button', { name: GroovesViewText.COPY }).click()
  await expect(
    t.getByRole('button', { name: GroovesViewText.COPIED }).or(t.getByLabel(GroovesViewText.cardText('UK garage'))),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test('shows a gallery the model searched', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await browse(page, { query: 'dub' })
  await expect(view.getByRole('heading', { level: 1 })).toHaveText(GroovesViewText.heading('dub'))
  const names = await view.locator('.groove-name').allTextContents()
  expect(names).toContain('Dub techno')
  expect(names).toContain('Dub')
  // Chips only for the families the result has.
  await expect(view.getByRole('button', { name: 'Hip-hop and trap' })).toHaveCount(0)
  await expect(view.getByRole('button', { name: 'Techno', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('says how many more grooves match when the model asked for fewer', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await browse(page, { query: 'techno', limit: 3 })
  await expect(view.locator('.groove')).toHaveCount(3)
  await expect(view.getByRole('status').first()).toHaveText(`3 grooves · ${GroovesViewText.more(9)}`)
  // Narrowing in place still counts the tiles the model sent.
  await view.getByRole('searchbox', { name: GroovesViewText.SEARCH }).fill('detroit')
  await expect(view.getByRole('status').first()).toHaveText(`1 of 3 grooves · ${GroovesViewText.more(9)}`)
  expect(errors).toEqual([])
})

test('a gallery that is everything that matched says nothing more', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await browse(page, { family: 'Techno' })
  await expect(view.getByRole('status').first()).toHaveText('12 grooves')
  await expect(view.locator('.grooves-more')).toHaveCount(0)
  expect(errors).toEqual([])
})
