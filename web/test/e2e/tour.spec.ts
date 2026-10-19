// End-to-end: "Try arc", the first-run tour, in the built app. One whole run in
// ?demo (the simulated EP-133 connects by itself and the demo presses a pad
// for the Pad step), the Connect variant when the cable is pulled, Settings →
// Help, a browser without Web MIDI (Restore, Needs MIDI, Try the demo, then
// the offline steps), and the path without the EP-133 (More tools, EP-133
// shortcuts, Backups: each done on the real control, the tour stepping aside
// while it is open), plus Try the pads from it in the demo.
// Screenshots are attached to the report for a look next to the Android
// TourScreenshots (no pixel diff).
import type { Page, TestInfo } from '@playwright/test'
import { demo, expect, notAutomated, openSettings, test } from './fixtures'

const tourOf = (page: Page) => page.getByRole('dialog', { name: 'Try arc' })
/** The step card on screen (the overlay also keeps an unseen copy it measures, hidden from screen readers). */
const cardOf = (page: Page) => page.locator('.coach__card.is-placed')

/** Taps [locator]'s middle with the mouse, after checking the veil's hole lets it through there. */
async function tapThroughHole(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  const box = await locator.boundingBox()
  if (box === null) throw new Error('the control has no box')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const hit = await locator.evaluate((el, [px, py]) => {
    const top = document.elementFromPoint(px!, py!)
    return top !== null && (top === el || el.contains(top))
  }, [x, y])
  expect(hit, 'the control is reachable through the hole').toBe(true)
  await page.mouse.click(x, y)
}

async function shot(page: Page, testInfo: TestInfo, what: string): Promise<void> {
  // Let the overlay's fade and the card's placement settle; there is no pixel comparison.
  await page.waitForTimeout(300)
  const vp = page.viewportSize()
  await testInfo.attach(`tour-${vp?.width}x${vp?.height}-${what}.png`, {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  })
}

for (const size of [
  { width: 393, height: 852 },
  { width: 360, height: 780 },
  // The desktop layout (from 1024 wide: the nav rail, the desk) and a phone on its side.
  { width: 1280, height: 800 },
  { width: 852, height: 393 },
]) {
  test.describe(`${size.width}x${size.height}`, () => {
    test.use({ viewport: size })

    test('the whole tour in the demo: connect, a pad lights, a pad sounds here, a backup, done', async ({ page }, testInfo) => {
      await notAutomated(page)
      await page.goto('/?demo')
      const tour = tourOf(page)
      const card = cardOf(page)

      await test.step('Welcome → Start', async () => {
        await expect(tour).toBeVisible()
        await expect(card.getByText('for the EP-133 K.O. II')).toBeVisible()
        // The demo itself has no "Try the demo".
        await expect(tour.getByRole('button', { name: 'Try the demo' })).toHaveCount(0)
        await shot(page, testInfo, '1-welcome')
        await tour.getByRole('button', { name: 'Start' }).click()
      })

      await test.step('Connect: every row ticked → Next', async () => {
        await expect(card.getByText('Step 1 of 4')).toBeVisible()
        await expect(tour.getByRole('listitem', { name: 'MIDI allowed: done' })).toBeVisible()
        await expect(tour.getByRole('listitem', { name: 'EP-133 plugged in: done' })).toBeVisible()
        await expect(tour.getByRole('listitem', { name: 'Connected: done' })).toBeVisible()
        // The spotlight: a ringed hole around the connection key.
        await expect(page.locator('.coach__hole')).toBeVisible()
        await shot(page, testInfo, '2-connect')
        await tour.getByRole('button', { name: 'Next' }).click()
      })

      await test.step('Pad: the demo presses a pad by itself', async () => {
        await expect(tour.getByRole('heading', { name: 'Play on the EP-133' })).toBeVisible()
        await expect(card.getByText('This is the demo: arc presses a pad for you.')).toBeVisible()
        // Live is forced onto one group, the pads.
        await expect(page.locator('[data-pad]')).toHaveCount(12)
        await shot(page, testInfo, '3-pad')
      })

      await test.step('Hear: hold "kick" through the hole', async () => {
        await expect(tour.getByRole('heading', { name: 'Hear it here' })).toBeVisible({ timeout: 20_000 })
        await shot(page, testInfo, '4-hear')
        const pad = page.locator('[data-pad]', { hasText: 'kick' }).first()
        await expect(pad).toBeVisible()
        const box = await pad.boundingBox()
        if (box === null) throw new Error('the pad has no box')
        const x = box.x + box.width / 2
        const y = box.y + box.height / 2
        // Touches pass through the hole to the pad (and only to the pads).
        expect(await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest('[data-pad]')?.textContent ?? null, [x, y])).toContain('kick')
        await page.mouse.move(x, y)
        // As in the smoke test, a press while the device is busy reading plays nothing: press again then.
        for (let attempt = 0; attempt < 4 && (await tour.getByRole('heading', { name: 'Hear it here' }).count()) > 0; attempt++) {
          await page.mouse.down()
          await page.waitForTimeout(700)
          await page.mouse.up()
          await page.waitForTimeout(300)
        }
        await expect(tour.getByRole('heading', { name: 'Back up your EP-133' })).toBeVisible()
      })

      await test.step('Back up: on Backups, the key ringed; the progress sheet, then the toast', async () => {
        await expect(card.getByText('Step 4 of 4')).toBeVisible()
        // The step shows on Backups, its spotlight on the Back up key (the big one before the first backup).
        await expect(page).toHaveURL(/#\/backups$/)
        await expect(page.locator('.coach__hole')).toBeVisible()
        const key = page.locator('[data-coach="backups.backup"]')
        const [hole, box] = [await page.locator('.coach__hole').boundingBox(), await key.boundingBox()]
        if (hole === null || box === null) throw new Error('no hole or no Back up key')
        expect(hole.x <= box.x + 1 && hole.y <= box.y + 1 && hole.x + hole.width >= box.x + box.width - 1 && hole.y + hole.height >= box.y + box.height - 1).toBe(true)
        await expect(card.getByText('arc saves every sound and project on the EP-133 in this browser. Nothing on it is changed.')).toBeVisible()
        await shot(page, testInfo, '5-backup')
        await tour.getByRole('button', { name: 'Back up device' }).click()
        const progress = page.getByRole('dialog', { name: 'Backing up' })
        await expect(progress).toBeVisible()
        await expect(progress).toBeHidden({ timeout: 60_000 })
        await expect(page.getByRole('status').filter({ hasText: 'Saved 12 sounds and 3 projects.' })).toBeVisible()
      })

      await test.step('Done, back on Live: the three tags, then Done closes it', async () => {
        await expect(tour.getByRole('heading', { name: "That's the basics" })).toBeVisible()
        await expect(page).toHaveURL(/#\/live$/)
        await expect(card.getByText('Settings has Try arc again for the steps you skipped.')).toHaveCount(0)
        // The desk docks Live tools in a column: no strip to tag there.
        const tags = size.width >= 1024 ? ['top.help', 'edge.guide'] : ['top.help', 'edge.guide', 'side.more']
        for (const id of tags) await expect(page.locator(`[data-coach-tag="${id}"]`)).toBeVisible()
        await expect(page.locator('[data-coach-tag]')).toHaveCount(tags.length)
        await shot(page, testInfo, '6-done')
        await tour.getByRole('button', { name: 'Done', exact: true }).click()
        await expect(tour).toBeHidden()
        await expect(page.getByRole('dialog', { name: "What's what" })).toBeHidden()
      })

      await test.step('a reload of the demo shows the tour again (its settings live in memory)', async () => {
        await page.reload()
        await expect(tourOf(page)).toBeVisible()
        await expect(tourOf(page).getByRole('button', { name: 'Start' })).toBeVisible()
      })
    })
  })
}

test('the cable pulled during Pad turns the card into Connect; Back pauses; Settings → Help', async ({ page }) => {
  await notAutomated(page)
  await page.goto('/?demo')
  const tour = tourOf(page)
  const card = cardOf(page)
  await tour.getByRole('button', { name: 'Start' }).click()
  // Unplugged before the demo's press (800 ms after the Pad card shows).
  await tour.getByRole('button', { name: 'Next' }).click()
  await demo(page, (d) => d.unplug())
  await expect(card.getByText('This step needs the EP-133 connected.')).toBeVisible()
  await expect(tour.getByRole('listitem', { name: 'Connected: not yet' })).toBeVisible()
  await expect(tour.getByRole('heading', { name: 'Play on the EP-133' })).toBeVisible()
  await demo(page, (d) => d.plug())
  // Plugged back in: auto-connect (or, when it was still busy dropping the old session, the card's
  // Connect key), and the compact Pad card is back.
  const connectKey = tour.getByRole('button', { name: 'Connect', exact: true })
  await expect(card.getByText('This step needs the EP-133 connected.')).toBeHidden({ timeout: 3_000 }).catch(async () => {
    await connectKey.click()
  })
  await expect(card.getByText('This step needs the EP-133 connected.')).toBeHidden({ timeout: 20_000 })
  await expect(tour.getByRole('heading', { name: 'Play on the EP-133' })).toBeVisible()

  // Escape (Back) pauses the tour; nothing is lost.
  await page.keyboard.press('Escape')
  await expect(tour).toBeHidden()
  await expect(page).toHaveURL(/#\/live$/)

  // Settings → Help → Try arc again starts over on Live.
  await openSettings(page)
  await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible()
  await expect(page.getByText('A few short steps on the real screen: connect, play a pad, back up.')).toBeVisible()
  await page.getByRole('button', { name: 'Try arc again' }).click()
  await expect(tour).toBeVisible()
  await expect(tour.getByRole('button', { name: 'Start' })).toBeVisible()
  await tour.getByRole('button', { name: 'Not now' }).last().click()
  await expect(tour).toBeHidden()

  // Settings → Help → What's what: Show opens the guide overlay.
  await openSettings(page)
  await page.getByRole('button', { name: "What's what: Show" }).click()
  const coach = page.getByRole('dialog', { name: "What's what" })
  await expect(coach).toBeVisible()
  await coach.getByRole('button', { name: 'Tap anywhere to close' }).click()
  await expect(coach).toBeHidden()
})

test('without Web MIDI: Welcome → Restore → First time here → Needs MIDI → Try the demo', async ({ page, context }) => {
  await notAutomated(page)
  // A phone: on the desk Live tools are docked and the More tools step passes by itself (the desk test below).
  await page.setViewportSize({ width: 393, height: 852 })
  await page.addInitScript(() => {
    delete (Navigator.prototype as { requestMIDIAccess?: unknown }).requestMIDIAccess
    delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess
  })
  await page.goto('/')
  const tour = tourOf(page)
  const card = cardOf(page)
  await expect(tour).toBeVisible()
  await expect(tour.getByRole('button', { name: 'Try the demo' })).toBeVisible()
  await tour.getByRole('button', { name: 'Start' }).click()
  await expect(tour.getByRole('heading', { name: 'Used arc before?' })).toBeVisible()
  await expect(tour.getByRole('button', { name: 'Restore from a folder' })).toBeVisible()
  await tour.getByRole('button', { name: 'First time here' }).click()
  await expect(tour.getByRole('heading', { name: 'Needs MIDI' })).toBeVisible()
  await expect(card.getByText('Open arc in Chrome on Android or on a computer to connect your EP-133.', { exact: false })).toBeVisible()
  const opened = context.waitForEvent('page')
  await tour.getByRole('button', { name: 'Try the demo' }).click()
  const demoPage = await opened
  await demoPage.waitForLoadState()
  expect(new URL(demoPage.url()).searchParams.has('demo')).toBe(true)
  await demoPage.close()
  // Next on Needs MIDI: the offline steps, then Done (nothing that needs the EP-133 could be done, so no Later note).
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour.getByRole('heading', { name: 'More tools' })).toBeVisible()
  for (const head of ['More tools', 'EP-133 shortcuts', 'Backups']) {
    await expect(tour.getByRole('heading', { name: head, exact: true })).toBeVisible()
    await tour.getByRole('button', { name: 'Skip' }).click()
  }
  await expect(tour.getByRole('heading', { name: "That's the basics" })).toBeVisible()
  await expect(card.getByText('Settings has Try arc again for the steps you skipped.')).toHaveCount(0)
  // Not the chosen offline run: no offline line, and no Connect (there is no MIDI).
  await expect(card.getByText('Settings has Try arc again for when the EP-133 is here.')).toHaveCount(0)
  await expect(tour.getByRole('button', { name: 'Connect and try the pads' })).toHaveCount(0)
  await tour.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(tour).toBeHidden()
  // Finished: a reload shows neither the tour nor the guide.
  await page.reload()
  await expect(page.getByRole('banner')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(tour).toBeHidden()
  await expect(page.getByRole('dialog', { name: "What's what" })).toBeHidden()
})

test.describe('without the EP-133', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('Welcome → Without the EP-133 → Live tools → the guide → Backups → Done, each on the real control', async ({ page }, testInfo) => {
    await notAutomated(page)
    await page.goto('/')
    const tour = tourOf(page)
    const card = cardOf(page)

    await test.step('Welcome: the second key', async () => {
      await expect(tour).toBeVisible()
      await expect(tour.getByRole('button', { name: 'Without the EP-133' })).toBeVisible()
      await shot(page, testInfo, '7-offline-welcome')
      await tour.getByRole('button', { name: 'Without the EP-133' }).click()
      // An empty library in a browser that can pick a folder is asked about a restore first.
      const restore = tour.getByRole('heading', { name: 'Used arc before?' })
      await expect(restore.or(tour.getByRole('heading', { name: 'More tools' }))).toBeVisible()
      if (await restore.isVisible()) await tour.getByRole('button', { name: 'First time here' }).click()
    })

    await test.step('More tools: tap the strip through the hole; the tour steps aside until it is closed', async () => {
      await expect(tour.getByRole('heading', { name: 'More tools' })).toBeVisible()
      await expect(card.getByText('Step 1 of 3')).toBeVisible()
      await expect(card.locator('.tour-card__dot')).toHaveCount(3)
      await expect(page.locator('.coach__hole')).toBeVisible()
      // Nothing is connected: no Try the pads.
      await expect(tour.getByRole('button', { name: 'Try the pads' })).toHaveCount(0)
      await shot(page, testInfo, '8-offline-tools')
      await tapThroughHole(page, page.getByRole('button', { name: 'Live tools' }))
      const tools = page.getByRole('dialog', { name: 'Live tools' })
      await expect(tools).toBeVisible()
      await expect(tour).toBeHidden()
      await tools.getByRole('button', { name: 'Close' }).click()
      await expect(tools).toBeHidden()
    })

    await test.step('EP-133 shortcuts: Open it opens the guide; closing it brings the next card', async () => {
      await expect(tour.getByRole('heading', { name: 'EP-133 shortcuts' })).toBeVisible()
      await expect(card.getByText('Step 2 of 3')).toBeVisible()
      await shot(page, testInfo, '9-offline-guide')
      // The GUIDE tab is spotlit, untagged (a side tag would cover it), and reachable through the hole.
      await expect(page.locator('[data-coach-tag]')).toHaveCount(0)
      const tab = page.getByRole('button', { name: 'EP-133 shortcuts' })
      const box = await tab.boundingBox()
      if (box === null) throw new Error('the GUIDE tab has no box')
      expect(await tab.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x!, y!)), [box.x + box.width / 2, box.y + box.height / 2])).toBe(true)
      await tour.getByRole('button', { name: 'Open it' }).click()
      const guide = page.getByRole('region', { name: 'Shortcut guide' })
      await expect(guide).toBeVisible()
      await expect(tour).toBeHidden()
      await guide.getByRole('button', { name: 'Close' }).click()
      await expect(guide).toBeHidden()
    })

    await test.step('Backups: tap the tag through the hole and pick Backups', async () => {
      await expect(tour.getByRole('heading', { name: 'Backups', exact: true })).toBeVisible()
      await expect(card.getByText('Step 3 of 3')).toBeVisible()
      await shot(page, testInfo, '10-offline-sections')
      await tapThroughHole(page, page.getByRole('banner').getByRole('button', { name: /, Sections$/ }))
      const sections = page.getByRole('navigation', { name: 'Sections' })
      await expect(sections).toBeVisible()
      await expect(tour).toBeHidden()
      await sections.getByRole('button', { name: 'Backups', exact: true }).click()
      await expect(page).toHaveURL(/#\/backups$/)
    })

    await test.step('Done: the offline line, Connect and try the pads, Done', async () => {
      await expect(tour.getByRole('heading', { name: "That's the basics" })).toBeVisible()
      await expect(card.getByText('Settings has Try arc again for when the EP-133 is here.')).toBeVisible()
      await expect(card.getByText('Settings has Try arc again for the steps you skipped.')).toHaveCount(0)
      await expect(tour.getByRole('button', { name: 'Connect and try the pads' })).toBeVisible()
      await shot(page, testInfo, '11-offline-done')
      await tour.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(tour).toBeHidden()
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arc.settings') ?? '{}').tourSteps)).toContain('tools,guide,sections')
    })
  })

  test.describe('on the desk', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('Live tools are docked, so the offline path starts at the guide and Done names Live tools, not a strip', async ({ page }) => {
      await notAutomated(page)
      await page.goto('/')
      const tour = tourOf(page)
      const card = cardOf(page)
      await expect(tour).toBeVisible()
      await tour.getByRole('button', { name: 'Without the EP-133' }).click()
      const restore = tour.getByRole('heading', { name: 'Used arc before?' })
      await expect(restore.or(tour.getByRole('heading', { name: 'EP-133 shortcuts' }))).toBeVisible()
      if (await restore.isVisible()) await tour.getByRole('button', { name: 'First time here' }).click()
      // No strip to tap: the docked tools count as open, and the run goes on to the guide.
      await expect(tour.getByRole('heading', { name: 'EP-133 shortcuts' })).toBeVisible()
      await expect(card.getByText('Step 2 of 3')).toBeVisible()
      await tour.getByRole('button', { name: 'Skip' }).click()
      await expect(tour.getByRole('heading', { name: 'Backups', exact: true })).toBeVisible()
      await tour.getByRole('button', { name: 'Skip' }).click()
      await expect(tour.getByRole('heading', { name: "That's the basics" })).toBeVisible()
      await expect(card.getByText("? names every control. GUIDE has the EP-133's own shortcuts, and Live tools has the rest.")).toBeVisible()
      await expect(card.getByText(/strip/)).toHaveCount(0)
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arc.settings') ?? '{}').tourSteps)).toContain('tools,~guide,~sections')
    })
  })

  test('in the demo: Without the EP-133 → the connected demo offers Try the pads → Connect ticked → Pad', async ({ page }, testInfo) => {
    await notAutomated(page)
    await page.goto('/?demo')
    const tour = tourOf(page)
    const card = cardOf(page)
    await tour.getByRole('button', { name: 'Without the EP-133' }).click()
    await expect(tour.getByRole('heading', { name: 'More tools' })).toBeVisible()
    await expect(card.getByText('Your EP-133 is connected.')).toBeVisible()
    await shot(page, testInfo, '12-offline-tools-connected')
    await tour.getByRole('button', { name: 'Try the pads' }).click()
    await expect(card.getByText('Step 1 of 4')).toBeVisible()
    await expect(tour.getByRole('listitem', { name: 'Connected: done' })).toBeVisible()
    await tour.getByRole('button', { name: 'Next' }).click()
    await expect(tour.getByRole('heading', { name: 'Play on the EP-133' })).toBeVisible()
  })
})
