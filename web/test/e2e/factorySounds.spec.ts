// End-to-end: the factory sounds (FactorySounds) in ?demo with the EP-133
// unplugged before Live has read it. teenage engineering's site is stood in
// for at arc's /te/ path (vercel.json's rewrite in production) by a small
// factory pack: Get in Live tools downloads it, Live shows its project 1, and
// a pad plays from it. The EP-1320 Medieval's kit comes from a backup of one,
// imported here and copied with Use as factory sounds; Live then switches
// between the two kits. The EP-40 Riddim's is served beside the EP-133's
// (zipped in a folder, with macOS's __MACOSX entries, as teenage engineering
// zips it) and got from Settings; with three kits Live's switch has three.
import { encodeWav } from '../../src/core/formats/wav'
import { writeZip } from '../../src/core/formats/zip'
import { pad, tarFile } from '../helpers/bytes'
import { tone } from '../helpers/demoData'
import type { Page } from '@playwright/test'
import { demo, expect, importPak, selectTab, test } from './fixtures'

/**
 * A small pack made on [meta]'s device: [names] in slots 1 and 100, on
 * project 1's a/p10 and a/p01; under [folder] with resource forks beside it
 * when given.
 */
async function pak(meta: Record<string, string>, names: [string, string] = ['micro kick', 'nt snare'], folder = ''): Promise<Buffer> {
  const wav = encodeWav(tone(4000, 220), 1, 46875)
  const json = (o: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(o))
  const fork = new Uint8Array([0, 5, 22, 7, 0, 2, 0, 0])
  const zip = await writeZip(
    [
      { path: `${folder}meta.json`, data: json({ ...meta, generated_at: '2023-11-24T00:00:00.000Z' }), compress: false },
      { path: `${folder}sounds/001 ${names[0]}.wav`, data: wav, compress: false },
      { path: `${folder}sounds/100 ${names[1]}.wav`, data: wav, compress: false },
      { path: `${folder}projects/P01.tar`, data: tarFile([['pads/a/p01', pad(100)], ['pads/a/p10', pad(1)]]), compress: false },
      ...(folder === ''
        ? []
        : [
            { path: `__MACOSX/${folder}._meta.json`, data: fork, compress: false },
            { path: `__MACOSX/${folder}sounds/._001 ${names[0]}.wav`, data: fork, compress: false },
          ]),
    ],
    { date: 0, offsetMin: 0 },
  )
  return Buffer.from(zip)
}

const factoryPak = (): Promise<Buffer> => pak({ pak_type: 'factory', device_name: 'EP-133' })

/** The EP-40's pack, as teenage engineering zips it. */
const riddimPak = (): Promise<Buffer> =>
  pak({ pak_type: 'factory', device_name: 'EP-40', device_sku: 'TE032AS006', device_version: '0.0.0' }, ['riddim kick', 'riddim snare'], 'ep-40-factory-content/')

/**
 * teenage engineering's site at arc's /te/ path, serving [file] as the
 * EP-133's pack and [ep40] as the EP-40's; the paths asked go in [asked].
 */
async function teSite(page: Page, file: Buffer, asked: string[] = [], ep40?: Buffer): Promise<void> {
  await page.route('**/te/apps/ep-sample-tool**', async (route) => {
    const path = new URL(route.request().url()).pathname
    asked.push(path)
    if (path.endsWith('.pak') && path.includes('ep-40-')) {
      return ep40 !== undefined ? route.fulfill({ body: ep40, contentType: 'binary/octet-stream' }) : route.fulfill({ status: 404, body: '' })
    }
    if (path.endsWith('.pak')) return route.fulfill({ body: file, contentType: 'binary/octet-stream' })
    if (path.endsWith('.js')) {
      return route.fulfill({
        body: 'a="/apps/ep-sample-tool/assets/ep-40-factory-content-E2e40.pak",x="/apps/ep-sample-tool/assets/ep-133-factory-content-E2e.pak"',
        contentType: 'text/javascript',
      })
    }
    return route.fulfill({ body: '<script type="module" src="/apps/ep-sample-tool/assets/index-E2e.js"></script>', contentType: 'text/html' })
  })
}

test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })

test('Get downloads the factory sounds, and Live plays their project 1 offline', async ({ page }) => {
  const asked: string[] = []
  await teSite(page, await factoryPak(), asked)
  // Unplugged before Live opens: nothing read, so Live says to connect.
  await page.goto('/?demo#/settings')
  await page.waitForFunction(() => '__arcDemo' in window)
  await demo(page, (d) => d.unplug())
  await page.goto('/?demo#/live')
  await expect(page.locator('.live-strip')).toContainText('Connect your EP-133')

  await page.getByRole('button', { name: 'Get', exact: true }).click()
  await expect(page.locator('.live-strip')).toContainText('Factory sounds')
  expect(asked).toEqual([
    '/te/apps/ep-sample-tool',
    '/te/apps/ep-sample-tool/assets/index-E2e.js',
    '/te/apps/ep-sample-tool/assets/ep-133-factory-content-E2e.pak',
  ])
  await expect(page.getByText('Factory sounds saved: 2 sounds.', { exact: false })).toBeVisible()
  // p01 is '7' and p10 is '.', counted from the top: the snare and the kick.
  await expect(page.locator('[data-pad]').filter({ hasText: 'nt snare' })).toHaveCount(1)
  await expect(page.locator('[data-pad]').filter({ hasText: 'micro kick' })).toHaveCount(1)
  // The Get row is gone, and Settings says they are saved.
  await expect(page.getByRole('button', { name: 'Get', exact: true })).toHaveCount(0)
  await page.goto('/?demo#/settings')
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled()
})

test("an EP-1320 backup used as factory sounds: Live offline plays its names, and switches to the EP-133's after Get", async ({ page }) => {
  await teSite(page, await factoryPak())
  // A backup of a Medieval (a user pack, as arc writes them), made in the test.
  const medieval = await pak({ pak_type: 'user', device_name: 'EP-1320', device_sku: 'TE032AS005', device_version: '1.0.0' }, ['med kick', 'med snare'])
  await page.goto('/?demo#/settings')
  await page.waitForFunction(() => '__arcDemo' in window)
  await demo(page, (d) => d.unplug())
  // Settings: the EP-1320's row says how to get its sounds; no kit switch with one kit or none.
  const settingsScreen = page.locator('.app__screen[data-view="settings"]')
  await expect(settingsScreen.getByText('EP-1320 Medieval', { exact: true })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Factory kit' })).toHaveCount(0)

  await page.goto('/?demo#/backups')
  await importPak(page, { name: 'my medieval.pak', mimeType: 'application/octet-stream', buffer: medieval })
  const rows = page.getByRole('region', { name: 'Backups' }).getByRole('listitem')
  const row = rows.filter({ hasText: 'my medieval' })
  await expect(row).toHaveCount(1)
  await row.getByRole('button').first().click()
  const sheet = page.getByRole('dialog', { name: /./ })
  await sheet.getByRole('button', { name: 'Use as factory sounds', exact: true }).click()
  await expect(page.getByText('EP-1320 factory sounds saved: 2 sounds.', { exact: false })).toBeVisible()
  // The backup stays, beside its copy.
  await expect(row).toHaveCount(1)
  await expect(rows.filter({ hasText: 'EP-1320 Medieval factory sounds' })).toHaveCount(1)

  // Live offline: the Medieval's project 1, played from its pack.
  await page.goto('/?demo#/live')
  await expect(page.locator('.live-strip')).toContainText('Factory sounds')
  await expect(page.locator('[data-pad]').filter({ hasText: 'med snare' })).toHaveCount(1)
  await expect(page.locator('[data-pad]').filter({ hasText: 'med kick' })).toHaveCount(1)
  // The EP-133's still to get; with one kit, no switch.
  await expect(page.getByRole('radiogroup', { name: 'Factory kit' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Get', exact: true }).click()
  await expect(page.getByText('Factory sounds saved: 2 sounds.', { exact: false })).toBeVisible()
  // Both saved: the Medieval's stay, and the switch on the factory line picks the EP-133's.
  const kit = page.getByRole('radiogroup', { name: 'Factory kit' }).first()
  await expect(kit).toBeVisible()
  await expect(kit.getByRole('radio', { name: 'EP-1320' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('[data-pad]').filter({ hasText: 'med kick' })).toHaveCount(1)
  await kit.getByRole('radio', { name: 'EP-133' }).click()
  await expect(page.locator('[data-pad]').filter({ hasText: 'micro kick' })).toHaveCount(1)
  await expect(page.locator('[data-pad]').filter({ hasText: 'nt snare' })).toHaveCount(1)
  await expect(page.locator('[data-pad]').filter({ hasText: 'med kick' })).toHaveCount(0)
  await expect(kit.getByRole('radio', { name: 'EP-133' })).toHaveAttribute('aria-checked', 'true')

  // Settings has both kits saved and the same choice.
  await page.goto('/?demo#/settings')
  const settings = page.getByRole('radiogroup', { name: 'Factory kit' })
  await expect(settings.getByRole('radio', { name: 'EP-133' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveCount(2)
  await settings.getByRole('radio', { name: 'EP-1320' }).click()
  await page.goto('/?demo#/live')
  await expect(page.locator('[data-pad]').filter({ hasText: 'med kick' })).toHaveCount(1)
})

test("the EP-40's factory sounds: Get in Settings, Live plays them, and switches among three kits", async ({ page }) => {
  const asked: string[] = []
  await teSite(page, await factoryPak(), asked, await riddimPak())
  const medieval = await pak({ pak_type: 'factory', device_name: 'EP-1320', device_sku: 'TE032AS005', device_version: '1.0.0' }, ['med kick', 'med snare'])
  await page.goto('/?demo#/settings')
  await page.waitForFunction(() => '__arcDemo' in window)
  await demo(page, (d) => d.unplug())
  const settingsScreen = page.locator('.app__screen[data-view="settings"]')
  const row = (title: string) => settingsScreen.locator('.setting-row').filter({ has: page.getByText(title, { exact: true }) })
  // Settings › Live: EP-133, EP-40, EP-1320, in that order; no kit switch yet.
  await expect(row('EP-40 Riddim')).toHaveCount(1)
  const titles = await settingsScreen.locator('.setting-row__title > span:first-child').allTextContents()
  expect(titles.filter((t) => ['Factory sounds', 'EP-40 Riddim', 'EP-1320 Medieval'].includes(t))).toEqual(['Factory sounds', 'EP-40 Riddim', 'EP-1320 Medieval'])
  await expect(page.getByRole('radiogroup', { name: 'Factory kit' })).toHaveCount(0)

  await row('EP-40 Riddim').getByRole('button', { name: 'Get', exact: true }).click()
  await expect(page.getByText('EP-40 factory sounds saved: 2 sounds.', { exact: false })).toBeVisible()
  expect(asked.filter((p) => p.endsWith('.pak'))).toEqual(['/te/apps/ep-sample-tool/assets/ep-40-factory-content-E2e40.pak'])
  await expect(row('EP-40 Riddim').getByRole('button', { name: 'Saved', exact: true })).toBeDisabled()
  // The EP-133's still to get; one kit saved, no switch.
  await expect(row('Factory sounds').getByRole('button', { name: 'Get', exact: true })).toBeEnabled()
  await expect(page.getByRole('radiogroup', { name: 'Factory kit' })).toHaveCount(0)

  // Live offline: the EP-40's project 1.
  await page.goto('/?demo#/live')
  await expect(page.locator('.live-strip')).toContainText('Factory sounds')
  await expect(page.locator('[data-pad]').filter({ hasText: 'riddim snare' })).toHaveCount(1)
  await expect(page.locator('[data-pad]').filter({ hasText: 'riddim kick' })).toHaveCount(1)

  // The EP-133's too: the switch offers the two saved, the EP-40's still chosen.
  await page.goto('/?demo#/settings')
  await row('Factory sounds').getByRole('button', { name: 'Get', exact: true }).click()
  await expect(page.getByText('Factory sounds saved: 2 sounds.', { exact: false })).toBeVisible()
  const settingsKit = page.getByRole('radiogroup', { name: 'Factory kit' })
  await expect(settingsKit.getByRole('radio')).toHaveText(['EP-133', 'EP-40'])
  await expect(settingsKit.getByRole('radio', { name: 'EP-40' })).toHaveAttribute('aria-checked', 'true')

  // And the EP-1320's, imported: three kits, in order.
  await page.goto('/?demo#/backups')
  await importPak(page, { name: 'medieval.pak', mimeType: 'application/octet-stream', buffer: medieval })
  await expect(page.getByText('EP-1320 factory sounds saved: 2 sounds.', { exact: false })).toBeVisible()
  await page.goto('/?demo#/live')
  const kit = page.getByRole('radiogroup', { name: 'Factory kit' }).first()
  await expect(kit.getByRole('radio')).toHaveText(['EP-133', 'EP-40', 'EP-1320'])
  await expect(kit.getByRole('radio', { name: 'EP-1320' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('[data-pad]').filter({ hasText: 'med kick' })).toHaveCount(1)
  await kit.getByRole('radio', { name: 'EP-40' }).click()
  await expect(page.locator('[data-pad]').filter({ hasText: 'riddim kick' })).toHaveCount(1)
  await expect(page.locator('[data-pad]').filter({ hasText: 'med kick' })).toHaveCount(0)
  await kit.getByRole('radio', { name: 'EP-133' }).click()
  await expect(page.locator('[data-pad]').filter({ hasText: 'micro kick' })).toHaveCount(1)
  await expect(page.locator('[data-pad]').filter({ hasText: 'riddim kick' })).toHaveCount(0)

  // Settings shows all three saved and the same choice.
  await page.goto('/?demo#/settings')
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveCount(3)
  await expect(settingsKit.getByRole('radio')).toHaveText(['EP-133', 'EP-40', 'EP-1320'])
  await expect(settingsKit.getByRole('radio', { name: 'EP-133' })).toHaveAttribute('aria-checked', 'true')
})
