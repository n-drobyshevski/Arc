// End-to-end: "Try arc", the first-run tour, in the built app. One whole run in
// ?demo (the simulated EP-133 connects by itself and the demo presses a pad
// for the Pad step), the Connect variant when the cable is pulled, Settings →
// Help, and a browser without Web MIDI (Restore, Needs MIDI, Try the demo).
// Screenshots are attached to the report for a look next to the Android
// TourScreenshots (no pixel diff).
import type { Page, TestInfo } from '@playwright/test'
import { demo, expect, notAutomated, test } from './fixtures'

const tourOf = (page: Page) => page.getByRole('dialog', { name: 'Try arc' })
/** The step card on screen (the overlay also keeps an unseen copy it measures, hidden from screen readers). */
const cardOf = (page: Page) => page.locator('.coach__card.is-placed')

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

      await test.step('Back up: the progress sheet, then the toast', async () => {
        await expect(card.getByText('Step 4 of 4')).toBeVisible()
        await expect(card.getByText('arc saves every sound and project on the EP-133 in this browser. Nothing on it is changed.')).toBeVisible()
        await shot(page, testInfo, '5-backup')
        await tour.getByRole('button', { name: 'Back up device' }).click()
        const progress = page.getByRole('dialog', { name: 'Backing up' })
        await expect(progress).toBeVisible()
        await expect(progress).toBeHidden({ timeout: 60_000 })
        await expect(page.getByRole('status').filter({ hasText: 'Saved 12 sounds and 3 projects.' })).toBeVisible()
      })

      await test.step('Done: the three tags, then Done closes it', async () => {
        await expect(tour.getByRole('heading', { name: "That's the basics" })).toBeVisible()
        await expect(card.getByText('Settings has Try arc again for the steps you skipped.')).toHaveCount(0)
        for (const id of ['top.help', 'edge.guide', 'side.more']) await expect(page.locator(`[data-coach-tag="${id}"]`)).toBeVisible()
        await expect(page.locator('[data-coach-tag]')).toHaveCount(3)
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
  await page.getByRole('banner').getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible()
  await expect(page.getByText('A few short steps on the real screen: connect, play a pad, back up.')).toBeVisible()
  await page.getByRole('button', { name: 'Try arc again' }).click()
  await expect(tour).toBeVisible()
  await expect(tour.getByRole('button', { name: 'Start' })).toBeVisible()
  await tour.getByRole('button', { name: 'Not now' }).last().click()
  await expect(tour).toBeHidden()

  // Settings → Help → What's what: Show opens the guide overlay.
  await page.getByRole('banner').getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: "What's what: Show" }).click()
  const coach = page.getByRole('dialog', { name: "What's what" })
  await expect(coach).toBeVisible()
  await coach.getByRole('button', { name: 'Tap anywhere to close' }).click()
  await expect(coach).toBeHidden()
})

test('without Web MIDI: Welcome → Restore → First time here → Needs MIDI → Try the demo', async ({ page, context }) => {
  await notAutomated(page)
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
  // Next on Needs MIDI: Done (nothing that needs the EP-133 could be done, so no Later note).
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour.getByRole('heading', { name: "That's the basics" })).toBeVisible()
  await expect(card.getByText('Settings has Try arc again for the steps you skipped.')).toHaveCount(0)
  await tour.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(tour).toBeHidden()
  // Finished: a reload shows neither the tour nor the guide.
  await page.reload()
  await expect(page.getByRole('banner')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(tour).toBeHidden()
  await expect(page.getByRole('dialog', { name: "What's what" })).toBeHidden()
})
