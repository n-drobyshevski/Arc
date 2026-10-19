// End-to-end: Live offline with pad changes made in arc only, in ?demo. Live
// reads the demo EP-133 (copying its pads' sounds), the cable is pulled, and
// the factory pack is got (teenage engineering's site stood in for at /te/ by
// a small pack: slot 1 named like the demo device's slot 1, slot 100 a sound
// the device doesn't have). The Sounds tab then offers both lists; sounds
// dragged onto pads change them in arc only, and plugging the EP-133 back in
// asks whether to write them.
import type { Page } from '@playwright/test'
import { encodeWav } from '../../src/core/formats/wav'
import { writeZip } from '../../src/core/formats/zip'
import { pad, tarFile } from '../helpers/bytes'
import { tone } from '../helpers/demoData'
import { demo, expect, test } from './fixtures'

async function factoryPak(): Promise<Buffer> {
  const wav = encodeWav(tone(4000, 220), 1, 46875)
  const json = (o: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(o))
  const zip = await writeZip(
    [
      { path: 'meta.json', data: json({ pak_type: 'factory', device_name: 'EP-133', generated_at: '2023-11-24T00:00:00.000Z' }), compress: false },
      { path: 'sounds/001 kick.wav', data: wav, compress: false },
      { path: 'sounds/100 nt snare.wav', data: wav, compress: false },
      { path: 'projects/P01.tar', data: tarFile([['pads/a/p01', pad(100)], ['pads/a/p10', pad(1)]]), compress: false },
    ],
    { date: 0, offsetMin: 0 },
  )
  return Buffer.from(zip)
}

/** How many of the demo device's sounds arc has copied (Live's background copy). */
function copies(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('arc-demo')
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('padSounds')) return resolve(0)
          const keys = db.transaction('padSounds').objectStore('padSounds').getAllKeys()
          keys.onsuccess = () => resolve(keys.result.filter((k) => /^s\d+\.wav$/.test(String(k))).length)
          keys.onerror = () => resolve(0)
        }
        open.onerror = () => resolve(0)
      }),
  )
}

// Pads counted from the top, none learned: offline group A's '5' is p05 (clap) and '8' is p02 (empty).
const A5 = '[data-pad="7"]'
const A8 = '[data-pad="10"]'

test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })

test.beforeEach(async ({ page }) => {
  const pak = await factoryPak()
  await page.route('**/te/apps/ep-sample-tool**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('.pak')) return route.fulfill({ body: pak, contentType: 'binary/octet-stream' })
    if (path.endsWith('.js')) return route.fulfill({ body: 'x="/apps/ep-sample-tool/assets/ep-133-factory-content-E2e.pak"', contentType: 'text/javascript' })
    return route.fulfill({ body: '<script type="module" src="/apps/ep-sample-tool/assets/index-E2e.js"></script>', contentType: 'text/html' })
  })
  // Read with the project's pads copied, then unplugged: Live shows the last read.
  await page.goto('/?demo#/live')
  await page.waitForFunction(() => '__arcDemo' in window)
  await expect.poll(() => copies(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(5)
  await demo(page, (d) => d.unplug())
  await expect(page.locator('.live-strip')).toContainText('Offline')
  await page.getByRole('button', { name: 'Get', exact: true }).click()
  await expect(page.getByText('Factory sounds saved: 2 sounds.', { exact: false })).toBeVisible()
})

/** Drags [name] from the Sounds tab's list onto the pad [target]. */
async function dragOnto(page: Page, name: string, target: string): Promise<void> {
  const row = page.locator('.snd__row').filter({ hasText: name })
  await row.dragTo(page.locator(target))
}

test('the Sounds tab offline: both lists, dimmed rows, a factory preview, pads changed in arc, then written on connect', async ({ page }) => {
  await page.getByRole('tab', { name: 'Sounds' }).click()
  const sources = page.getByRole('radiogroup', { name: 'Sounds from' })
  await expect(sources).toBeVisible()
  await expect(sources.getByRole('radio', { name: 'Device' })).toHaveAttribute('aria-checked', 'true')
  // The device sounds arc has no copy of need the EP-133; the pads' sounds were copied.
  const off = page.locator('.snd__row.is-off')
  await expect(off).toHaveCount(7)
  await expect(off.first()).toContainText('Needs the EP-133')
  await expect(off.first().locator('.snd__play')).toBeDisabled()
  await expect(page.locator('.snd__row').filter({ hasText: 'clap' })).not.toHaveClass(/is-off/)
  await expect(page.getByText('Offline: drag a sound onto a pad', { exact: false })).toBeVisible()

  // The factory pack: a preview plays, its key marked.
  await sources.getByRole('radio', { name: 'Factory' }).click()
  await expect(page.locator('.snd__row')).toHaveCount(2)
  const snare = page.locator('.snd__row').filter({ hasText: 'nt snare' })
  await snare.locator('.snd__play').click()
  await expect(snare).toHaveClass(/is-playing/)
  await snare.locator('.snd__play').click()

  // Onto the pads, in arc only: kick (the device has it in slot 1) and nt snare (it doesn't).
  await expect(page.locator(A5)).toContainText('clap')
  await dragOnto(page, 'kick', A5)
  await expect(page.locator(A5)).toContainText('kick')
  await dragOnto(page, 'nt snare', A8)
  await expect(page.locator(A8)).toContainText('nt snare')
  await expect(page.getByText('Pad A 8: nt snare, in arc until you connect')).toBeVisible()

  await page.getByRole('tab', { name: 'Tools' }).click()
  await expect(page.getByText('Offline pad changes')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset pads' })).toBeVisible()

  // Back in: asked once; Write puts on the one that still fits.
  await demo(page, (d) => d.plug())
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Put 2 offline pad changes on the EP-133?')
  await dialog.getByRole('button', { name: 'Write' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('1 pad put on the EP-133. 1 skipped', { exact: false })).toBeVisible()
  await expect(page.getByText('Offline pad changes')).toHaveCount(0)
  // Unplugged again, the read kept shows what the EP-133 has now: kick on '5', nothing on '8'.
  await demo(page, (d) => d.unplug())
  await expect(page.locator('.live-strip')).toContainText('Offline')
  await expect(page.locator(A5)).toContainText('kick')
  await expect(page.locator(A8)).not.toContainText('nt snare')
})

test('Reset pads puts the read back; Discard on connect keeps the EP-133 as it is', async ({ page }) => {
  await page.getByRole('tab', { name: 'Sounds' }).click()
  await page.getByRole('radiogroup', { name: 'Sounds from' }).getByRole('radio', { name: 'Factory' }).click()
  await dragOnto(page, 'kick', A5)
  await expect(page.locator(A5)).toContainText('kick')

  await page.getByRole('tab', { name: 'Tools' }).click()
  await page.getByRole('button', { name: 'Reset pads' }).click()
  await expect(page.getByText("Pads back to the EP-133's sounds.")).toBeVisible()
  await expect(page.locator(A5)).toContainText('clap')
  await expect(page.getByText('Offline pad changes')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Sounds' }).click()
  await page.getByRole('radiogroup', { name: 'Sounds from' }).getByRole('radio', { name: 'Factory' }).click()
  await dragOnto(page, 'kick', A5)
  await expect(page.locator(A5)).toContainText('kick')
  await demo(page, (d) => d.plug())
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Put 1 offline pad change on the EP-133?')
  await dialog.getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByText('Offline pad changes discarded.')).toBeVisible()
  // Unplugged again: the pad shows the EP-133's sound, the change gone.
  await demo(page, (d) => d.unplug())
  await expect(page.locator('.live-strip')).toContainText('Offline')
  await expect(page.locator(A5)).toContainText('clap')
})
