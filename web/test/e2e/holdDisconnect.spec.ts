// End-to-end: the connection key. Connected, a tap says "Hold to disconnect"
// and a pointer held for a second (a ring filling meanwhile) disconnects; let
// go early and it stays. Enter or Space held does the same, a screen reader has
// the hint as the key's description and a Disconnect button of its own, and
// prefers-reduced-motion still waits the second. Not connected, a tap connects
// at once.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const connected = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^EP-133 connected/ })
const offline = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Connect the EP-133' })
const hint = (page: Page) => page.getByRole('status').filter({ hasText: 'Hold to disconnect' })
const ring = (page: Page) => page.locator('.icon-block__ring')

async function open(page: Page): Promise<void> {
  await page.goto('/?demo#/backups')
  // Not while it connects or reads the device: the key is disabled (and loses a key press) then.
  await expect(connected(page)).toBeEnabled()
  await page.waitForTimeout(500)
  await expect(connected(page)).toBeEnabled()
}

async function pressDown(page: Page): Promise<void> {
  const box = (await connected(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
}

test('a tap says "Hold to disconnect" and stays connected', async ({ page }) => {
  await open(page)
  await connected(page).click()
  await expect(hint(page)).toBeVisible()
  await expect(connected(page)).toBeVisible()
})

test('holding a second fills the ring and disconnects; the click that ends it says nothing', async ({ page }) => {
  await open(page)
  await pressDown(page)
  await expect(ring(page)).toBeVisible()
  await expect(ring(page).locator('.icon-block__ring-fill')).toHaveCSS('animation-duration', '1s')
  // Still connected a little before the second is out.
  await page.waitForTimeout(600)
  await expect(connected(page)).toBeVisible()
  await expect(offline(page)).toBeVisible({ timeout: 3000 })
  await page.mouse.up()
  await expect(hint(page)).toHaveCount(0)
  await expect(ring(page)).toHaveCount(0)
})

test('letting go early cancels: no disconnect, the ring goes', async ({ page }) => {
  await open(page)
  await pressDown(page)
  await expect(ring(page)).toBeVisible()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await expect(ring(page)).toHaveCount(0)
  // Well past the second: the timer is gone.
  await page.waitForTimeout(700)
  await expect(connected(page)).toBeVisible()
})

test('moving the pointer off the key cancels it', async ({ page }) => {
  await open(page)
  await pressDown(page)
  await expect(ring(page)).toBeVisible()
  await page.mouse.move(300, 400)
  await expect(ring(page)).toHaveCount(0)
  await page.mouse.up()
  await page.waitForTimeout(1200)
  await expect(connected(page)).toBeVisible()
})

test('Enter held for a second disconnects; a short Enter says the hint', async ({ page }) => {
  await open(page)
  await connected(page).focus()
  await page.keyboard.press('Enter')
  await expect(hint(page)).toBeVisible()
  await expect(connected(page)).toBeVisible()
  await page.keyboard.down('Enter')
  await expect(ring(page)).toBeVisible()
  await page.keyboard.down('Enter') // key repeat
  await expect(offline(page)).toBeVisible({ timeout: 3000 })
  await page.keyboard.up('Enter')
  await expect(offline(page)).toBeVisible()
})

test('Space held for a second disconnects; let go early it stays and the hint shows on release', async ({ page }) => {
  await open(page)
  await connected(page).focus()
  await page.keyboard.down('Space')
  await expect(ring(page)).toBeVisible()
  await page.waitForTimeout(400)
  await page.keyboard.up('Space')
  await expect(ring(page)).toHaveCount(0)
  await expect(hint(page)).toBeVisible()
  await expect(connected(page)).toBeVisible()
  await connected(page).focus()
  await page.keyboard.down('Space')
  await expect(offline(page)).toBeVisible({ timeout: 3000 })
  await page.keyboard.up('Space')
  await expect(offline(page)).toBeVisible()
})

test('a screen reader hears the hint and has a Disconnect button of its own', async ({ page }) => {
  await open(page)
  await expect(connected(page)).toHaveAccessibleDescription('Hold to disconnect')
  const own = page.getByRole('banner').getByRole('button', { name: 'Disconnect', exact: true })
  await expect(own).toHaveCount(1)
  // Out of the tab order and out of sight: it is for the reader's own cursor.
  await expect(own).toHaveAttribute('tabindex', '-1')
  expect((await own.boundingBox())!.width).toBeLessThanOrEqual(1)
  await own.dispatchEvent('click')
  await expect(offline(page)).toBeVisible()
  // Disconnected, the button is gone with the hint.
  await expect(page.getByRole('banner').getByRole('button', { name: 'Disconnect', exact: true })).toHaveCount(0)
})

test('disconnected, a tap connects at once', async ({ page }) => {
  await open(page)
  await page.getByRole('banner').getByRole('button', { name: 'Disconnect', exact: true }).dispatchEvent('click')
  await expect(offline(page)).toBeVisible()
  await offline(page).click()
  await expect(connected(page)).toBeVisible()
  await expect(hint(page)).toHaveCount(0)
})

test('reduced motion: no sweep, but the ring is full and the second is still waited', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await pressDown(page)
  const fill = ring(page).locator('.icon-block__ring-fill')
  await expect(fill).toHaveCSS('animation-name', 'none')
  await expect(fill).toHaveCSS('stroke-dashoffset', '0px')
  await page.waitForTimeout(500)
  await expect(connected(page)).toBeVisible()
  await expect(offline(page)).toBeVisible({ timeout: 3000 })
  await page.mouse.up()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true })

  test('a touch held for a second disconnects, a tap says the hint', async ({ page }) => {
    await open(page)
    await connected(page).tap()
    await expect(hint(page)).toBeVisible()
    await expect(connected(page)).toBeVisible()
    const box = (await connected(page).boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
    await expect(ring(page)).toBeVisible()
    await expect(offline(page)).toBeVisible({ timeout: 3000 })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  })
})
