// End-to-end: the factory sounds (FactorySounds) in ?demo with the EP-133
// unplugged before Live has read it. teenage engineering's site is stood in
// for at arc's /te/ path (vercel.json's rewrite in production) by a small
// factory pack: Get in Live tools downloads it, Live shows its project 1, and
// a pad plays from it.
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
      { path: 'sounds/001 micro kick.wav', data: wav, compress: false },
      { path: 'sounds/100 nt snare.wav', data: wav, compress: false },
      { path: 'projects/P01.tar', data: tarFile([['pads/a/p01', pad(100)], ['pads/a/p10', pad(1)]]), compress: false },
    ],
    { date: 0, offsetMin: 0 },
  )
  return Buffer.from(zip)
}

test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })

test('Get downloads the factory sounds, and Live plays their project 1 offline', async ({ page }) => {
  const pak = await factoryPak()
  const asked: string[] = []
  await page.route('**/te/apps/ep-sample-tool**', async (route) => {
    const path = new URL(route.request().url()).pathname
    asked.push(path)
    if (path.endsWith('.pak')) return route.fulfill({ body: pak, contentType: 'binary/octet-stream' })
    if (path.endsWith('.js')) return route.fulfill({ body: 'x="/apps/ep-sample-tool/assets/ep-133-factory-content-E2e.pak"', contentType: 'text/javascript' })
    return route.fulfill({ body: '<script type="module" src="/apps/ep-sample-tool/assets/index-E2e.js"></script>', contentType: 'text/html' })
  })
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
