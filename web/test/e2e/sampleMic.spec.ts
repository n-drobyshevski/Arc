// SAMPLE from the mic end to end, on the simulated EP-133 of ?demo, with
// Chromium's fake microphone (a beep) and its permission granted: the panel
// opens on the mic, its meter moves, and a pad held records from it into
// the review sheet.
import { expect, test } from './fixtures'

test.use({
  viewport: { width: 412, height: 915 },
  launchOptions: {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['microphone'],
})

test('SAMPLE: the mic opens, its level shows, and a held pad records from it', async ({ page }) => {
  await page.goto('/?demo')
  await expect(page.locator('.live-strip')).toContainText('Project 1')
  await page.getByRole('button', { name: 'Sample' }).click()
  const panel = page.getByRole('region', { name: 'Sample' })
  await expect(panel).toBeVisible()
  // The mic, as the panel's window says it.
  await expect(panel.getByLabel('Microphone, mono')).toBeVisible()
  // The fake mic beeps: the meter rises.
  const meter = panel.getByRole('meter', { name: 'Input level' })
  await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow')), { timeout: 15000 }).toBeGreaterThan(0)

  const pad = page.locator('[data-pad="9"]')
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(panel).toContainText(/0:01 \/ 0:\d\d/)
  await page.mouse.up()

  const review = page.getByRole('dialog', { name: 'New sample' })
  await expect(review).toBeVisible()
  await expect(review).toContainText('MIC')
  await review.getByRole('button', { name: 'Discard' }).click()
  await expect(review).toHaveCount(0)

  // On to RSP with + (through MIC ST where the mic has two channels): the mic is let go of.
  const window = panel.getByRole('status')
  for (let i = 0; i < 2 && !(await window.getAttribute('aria-label'))?.startsWith('Resample'); i++) {
    await panel.getByRole('button', { name: 'Next source' }).click()
  }
  await expect(window).toHaveAttribute('aria-label', /^Resample arc's sound/)
  await expect(panel.getByRole('slider', { name: /Level/ })).toHaveValue('0')
})
