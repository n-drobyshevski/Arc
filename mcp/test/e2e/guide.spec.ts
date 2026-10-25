// The guide view as a host shows it: the test host (host/host.ts, opened with
// ?tool=lookup_combo) reads ui://arc/guide.html from the server, puts it in a
// sandboxed iframe 360px wide, and sends it a call of lookup_combo through the
// ext-apps AppBridge. Checks the entries and their key caps in both host
// themes, Official guide opening through the host (ui/open-link), Show more
// like this and Make a beat, and an answer of nothing found, with no page
// errors.
import { expect, test, type FrameLocator, type Page } from '@playwright/test'
import { sections } from '../../../web/src/core/text/guideText'
import { GuideViewText } from '../../src/guideText'
import type {} from './host/host'

/** Sampling's 8th entry, SMP-8: "Resample the current pattern", drawn as [In sample mode] SHIFT + pad > PLAY. */
const SMP_8 = sections[1]!.entries[7]!

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

async function lookup(page: Page, args: Record<string, unknown>, theme = 'dark'): Promise<FrameLocator> {
  await page.goto(`/?tool=lookup_combo&theme=${theme}`)
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

for (const theme of ['dark', 'light']) {
  test(`draws each entry with its keys as caps (${theme} host)`, async ({ page }) => {
    const errors = watchErrors(page)
    const view = await lookup(page, { query: 'resample' }, theme)
    await expect(view.getByRole('heading', { level: 1 })).toHaveText(GuideViewText.heading('resample'))
    const entries = view.locator('.guide-entry')
    await expect(entries.locator('.guide-id')).toHaveText(['SMP-3', 'SMP-6', 'SMP-8', 'SMP-12'])

    const smp8 = entries.filter({ has: view.getByText('SMP-8', { exact: true }) })
    await expect(smp8.getByRole('heading', { level: 2 })).toHaveText(SMP_8.action)
    // The caps, read as the guide's words by screen readers.
    const combo = smp8.getByRole('img', { name: SMP_8.keys })
    await expect(combo).toBeVisible()
    await expect(combo.locator('.cap__text')).toHaveText(['SHIFT', 'PAD', 'PLAY'])
    await expect(combo.locator('.combo__note').first()).toHaveText('In sample mode')
    // The device's colours whatever the host's theme: a dark key's face and a light key's.
    await expect(combo.locator('.cap__key--dark .cap__face').first()).toHaveCSS('background-color', 'rgb(74, 75, 77)')
    await expect(combo.locator('.cap__key--light .cap__face').first()).toHaveCSS('background-color', 'rgb(218, 217, 213)')
    await expect(combo.locator('.cap__text').first()).toHaveCSS('font-family', /mono/i)

    // SMP-12, a how-to of several steps, has no caps: the guide's words instead.
    const smp12 = entries.filter({ has: view.getByText('SMP-12', { exact: true }) })
    await expect(smp12.locator('.cap')).toHaveCount(0)
    await expect(smp12.locator('.guide-keys-only')).toBeVisible()
    // Make a beat is for sequencer entries only.
    await expect(view.getByRole('button', { name: GuideViewText.BEAT })).toHaveCount(0)
    await expect(view.locator('.guide-foot')).toHaveText(/^Check against your device/)
    expect(errors).toEqual([])
  })
}

test('Official guide opens the entry’s section through the host', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await lookup(page, { query: 'resample' })
  await view.getByRole('button', { name: GuideViewText.officialAria('SMP-8') }).click()
  await expect.poll(async () => page.evaluate(async () => (await window.arcHost).links)).toEqual([SMP_8.source])
  await expect(view.getByText(GuideViewText.LINK_FAILED)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Show more like this and Make a beat send their requests', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await lookup(page, { query: 'copy pattern' })
  const entries = view.locator('.guide-entry')
  await expect(entries.locator('.guide-id')).toHaveText(['SEQ-7', 'SEQ-21'])
  const first = entries.first()
  const action = await first.getByRole('heading', { level: 2 }).textContent()
  await first.getByRole('button', { name: GuideViewText.MORE }).click()
  await expect(first.getByText(GuideViewText.SENT)).toBeVisible()
  expect(await sentText(page, 0)).toBe(GuideViewText.moreMessage({ id: 'SEQ-7', action: action! }))

  await first.getByRole('button', { name: GuideViewText.BEAT }).click()
  await expect.poll(() => sentText(page, 1)).toBe(GuideViewText.beatMessage({ id: 'SEQ-7', action: action! }))
  expect(await page.evaluate(async () => (await window.arcHost).messages.length)).toBe(2)
  expect(errors).toEqual([])
})

test('says a combo it can’t find isn’t in the official guide', async ({ page }) => {
  const errors = watchErrors(page)
  const view = await lookup(page, { query: 'xyzzy' })
  await expect(view.getByRole('status')).toContainText(GuideViewText.NOT_FOUND)
  await expect(view.getByRole('status')).toContainText('Sampling, Sequencer')
  await expect(view.locator('.guide-entry')).toHaveCount(0)
  expect(errors).toEqual([])
})
