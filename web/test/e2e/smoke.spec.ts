// End-to-end smoke test: the built app in Chromium, with the simulated EP-133
// of ?demo (src/dev/demo.ts) standing in for the device. One pass through the
// main flows, a browser without Web MIDI, and screenshots for a manual look
// next to the Android reference PNGs (attached to the report; no pixel diff).
import { demo, expect, importPak, notAutomated, SAMPLE_PAK, selectTab, test } from './fixtures'

test('back up, look inside, restore, browse the device, live pads, import, no MIDI', async ({ page, context }) => {
  await notAutomated(page)

  await test.step('1. load: the app opens on Live, the first-run guide overlay is dismissed, the top bar renders', async () => {
    await page.goto('/?demo')
    await expect(page).toHaveURL(/#\/live$/)
    const bar = page.getByRole('banner')
    await expect(bar.getByRole('button', { name: 'Live, Sections' })).toBeVisible()
    const coach = page.getByRole('dialog', { name: "What's what" })
    await expect(coach).toBeVisible()
    await coach.getByRole('button', { name: 'Tap anywhere to close' }).click()
    await expect(coach).toBeHidden()
    await selectTab(page, 'Backups')
    await expect(page).toHaveURL(/#\/backups$/)
    await expect(bar.getByRole('button', { name: 'Settings' })).toBeVisible()
  })

  await test.step('2. auto-connect: the device panel shows the EP-133 and its 12 sounds', async () => {
    const panel = page.locator('.device-panel')
    await expect(panel.locator('.device-panel__title')).toHaveText('EP-133')
    await expect(panel.locator('.device-panel__sub')).toHaveText('OS 2.0.5')
    await expect(panel.locator('.device-panel__stat').first()).toHaveText(/^12\s*sounds$/)
    await expect(page.getByRole('banner').getByRole('button', { name: /^EP-133 connected/ })).toBeVisible()
  })

  const rows = page.getByRole('region', { name: 'Backups' }).getByRole('listitem')

  await test.step('3. back up: the progress sheet runs and a backup row appears', async () => {
    await expect(page.getByText('No backups yet.')).toBeVisible()
    await page.getByRole('button', { name: 'Back up device' }).click()
    const progress = page.getByRole('dialog', { name: 'Backing up' })
    await expect(progress).toBeVisible()
    await expect(progress.getByRole('progressbar')).toBeVisible()
    await expect(progress).toBeHidden({ timeout: 60_000 })
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('12 sounds, 3 projects')
    await expect(page.getByRole('status').filter({ hasText: 'Saved 12 sounds and 3 projects.' })).toBeVisible()
  })

  await test.step('4. detail -> Contents lists 12 sounds -> Back', async () => {
    await rows.first().getByRole('button').click()
    const detail = page.getByRole('dialog', { name: /^Backup / })
    await expect(detail).toBeVisible()
    await detail.getByRole('button', { name: 'Contents', exact: true }).click()
    await expect(page).toHaveURL(/#\/contents\//)
    const sounds = page.getByRole('region', { name: 'Sounds' })
    await expect(sounds.getByRole('button', { name: /^Play / })).toHaveCount(12)
    await expect(sounds.getByRole('button', { name: /^001 kick/ })).toBeVisible()
    await expect(sounds.getByRole('button', { name: /^111 riser/ })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/#\/backups$/)
    await expect(page.getByRole('region', { name: 'Sounds' })).toBeHidden()
    await expect(rows).toHaveCount(1)
  })

  await test.step('5. restore everything: progress completes, the device dropped nothing', async () => {
    const before = await demo(page, (d) => d.mock.log.length)
    await rows.first().getByRole('button').click()
    await page.getByRole('dialog', { name: /^Backup / }).getByRole('button', { name: 'Restore to device' }).click()
    const sheet = page.getByRole('dialog', { name: 'Restore to device' })
    await expect(sheet.getByRole('radio', { name: 'Everything in this backup' })).toBeChecked()
    await sheet.getByRole('button', { name: 'Restore 12 sounds and 3 projects' }).click()
    const progress = page.getByRole('dialog', { name: 'Restoring' })
    await expect(progress).toBeVisible()
    await expect(progress).toBeHidden({ timeout: 60_000 })
    await expect(page.getByRole('status').filter({ hasText: 'Restored 12 sounds and 3 projects.' })).toBeVisible()
    const after = await demo(page, (d) => ({ dropped: d.mock.dropped, sounds: d.mock.sounds.size, handled: d.mock.log.length }))
    expect(after.dropped).toBe(0)
    expect(after.sounds).toBe(12)
    expect(after.handled).toBeGreaterThan(before)
  })

  await test.step('6. Device tab: the sounds are grouped, 001–099 first', async () => {
    await selectTab(page, 'Device')
    await expect(page).toHaveURL(/#\/device$/)
    const group = page.getByRole('region', { name: '001–099' })
    await expect(group).toBeVisible()
    await expect(group.getByRole('listitem')).toHaveCount(8)
    await expect(page.getByRole('region', { name: '100–199' }).getByRole('listitem')).toHaveCount(4)
  })

  await test.step('7. Back from Device lands on Live: a note-on from the device lights a pad', async () => {
    await page.goBack()
    await expect(page).toHaveURL(/#\/live$/)
    await expect(page.getByRole('banner').getByRole('button', { name: 'Live, Sections' })).toBeVisible()
    const pads = page.locator('[data-pad]')
    await expect(pads).toHaveCount(12) // one group (A) by default on the web
    const litPads = (): Promise<number> =>
      pads.evaluateAll((els) => els.filter((el) => Number((el as HTMLElement).style.getPropertyValue('--glow')) > 0.5).length)
    expect(await litPads()).toBe(0)
    await demo(page, (d) => d.noteOn(36, 127))
    await expect.poll(litPads).toBe(1)
    await demo(page, (d) => d.noteOff(36))
    await expect.poll(litPads).toBe(0)
  })

  await test.step('7b. Live tab: a pad the device named plays in the browser while held', async () => {
    // A note-on with the device's pad push at the same moment links pad A "." to its sound (001 kick).
    await demo(page, (d) => {
      d.noteOn(36, 127)
      d.pushPadActive(1, 0, 1)
    })
    await demo(page, (d) => d.noteOff(36))
    const pad = page.locator('[data-pad]', { hasText: 'kick' }).first()
    await expect(pad).toBeVisible()
    // Held, the pad is ringed while its sample sounds. The demo's samples are short, so the ring
    // can come and go between two polls: a MutationObserver counts every time it is drawn.
    await page.evaluate(() => {
      const w = window as unknown as { __arcRings: number }
      w.__arcRings = 0
      new MutationObserver(() => {
        if (document.querySelector('[data-pad].is-playing')) w.__arcRings++
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] })
    })
    const rings = (): Promise<number> => page.evaluate(() => (window as unknown as { __arcRings: number }).__arcRings)
    const box = await pad.boundingBox()
    if (box === null) throw new Error('the pad has no box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    // As on Android, a press that needs the device while it is busy reading plays nothing: press again then.
    for (let attempt = 0; attempt < 3 && (await rings()) === 0; attempt++) {
      await page.mouse.down()
      await expect.poll(rings, { timeout: 5_000 }).toBeGreaterThan(0).catch(() => undefined)
      await page.mouse.up()
    }
    expect(await rings()).toBeGreaterThan(0)
    await expect(page.locator('[data-pad].is-playing')).toHaveCount(0)
  })

  await test.step('8. import sample.pak: a second row', async () => {
    await selectTab(page, 'Backups')
    await importPak(page, SAMPLE_PAK)
    await expect(rows).toHaveCount(2)
  })

  await test.step('9. a browser without Web MIDI: the no-MIDI panel, and the real library, untouched by the demo', async () => {
    const plain = await context.newPage()
    await plain.addInitScript(() => {
      delete (Navigator.prototype as { requestMIDIAccess?: unknown }).requestMIDIAccess
      delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess
    })
    await plain.goto('/#/backups')
    expect(await plain.evaluate(() => 'requestMIDIAccess' in navigator)).toBe(false)
    await expect(plain.locator('.device-panel__title')).toHaveText('No MIDI in this browser')
    const bar = plain.getByRole('banner')
    await expect(bar.getByRole('button', { name: 'Back up', exact: true })).toBeDisabled()
    await expect(bar.getByRole('button', { name: 'Connect the EP-133' })).toBeDisabled()
    // Same browser profile, but the backups saved above were the demo's: ?demo keeps its own
    // library ("arc-demo") and settings, so the real library is still empty...
    await expect(plain.getByText('No backups yet.')).toBeVisible()
    const plainRows = plain.getByRole('region', { name: 'Backups' }).getByRole('listitem')
    await expect(plainRows).toHaveCount(0)
    // ...and works without MIDI: an import makes its one row, which opens.
    await importPak(plain, SAMPLE_PAK)
    await expect(plainRows).toHaveCount(1)
    await plainRows.first().getByRole('button').click()
    await expect(plain.getByRole('dialog', { name: /./ }).getByRole('button', { name: 'Contents', exact: true })).toBeVisible()
    await plain.close()
  })
})

const SIZES = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 840, height: 1200 },
] as const
const SCHEMES = ['light', 'dark'] as const

for (const size of SIZES) {
  for (const scheme of SCHEMES) {
    test.describe(`${size.width}x${size.height} ${scheme}`, () => {
      test.use({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, colorScheme: scheme })

      test('screenshots', async ({ page }, testInfo) => {
        const shot = async (what: string): Promise<void> => {
          // Let sheet and toast transitions settle; there is no pixel comparison, so this only has to look right.
          await page.waitForTimeout(400)
          await testInfo.attach(`${size.name}-${size.width}x${size.height}-${scheme}-${what}.png`, {
            body: await page.screenshot({ animations: 'disabled' }),
            contentType: 'image/png',
          })
        }
        await page.goto('/?demo#/backups')
        await expect(page.locator('.device-panel__stat').first()).toHaveText(/^12\s*sounds$/)
        await importPak(page, SAMPLE_PAK)
        await expect(page.getByRole('region', { name: 'Backups' }).getByRole('listitem')).toHaveCount(1)
        await shot('backups')
        await selectTab(page, 'Device')
        await expect(page.getByRole('region', { name: '001–099' })).toBeVisible()
        await shot('device')
        await selectTab(page, 'Live')
        await expect(page.locator('[data-pad]')).toHaveCount(12)
        await demo(page, (d) => d.noteOn(36, 127))
        await shot('live')
        await demo(page, (d) => d.noteOff(36))
      })
    })
  }
}
