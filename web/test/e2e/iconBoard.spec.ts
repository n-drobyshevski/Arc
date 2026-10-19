// End-to-end: the icon board (public/icon-board/), a static page served
// beside the app. vite preview sends none of vercel.json's headers, so the
// page is served here with the site's Content-Security-Policy added: any
// inline script, outside font or stylesheet it needed would be blocked and
// logged, which the fixture's console check fails on.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures'

interface VercelHeaders {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

const vercel = JSON.parse(readFileSync(fileURLToPath(new URL('../../../vercel.json', import.meta.url)), 'utf8')) as VercelHeaders
const CSP = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? ''

test.use({ viewport: { width: 390, height: 844 } })

test('the icon board works under the site CSP and links back to the app', async ({ page }) => {
  expect(CSP).toContain("script-src 'self'")
  await page.route('**/icon-board/', async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': CSP } })
  })
  await page.goto('/icon-board/')
  await expect(page).toHaveTitle('arc Icon Board')
  await expect(page.locator('.cell')).toHaveCount(41)
  await expect(page.getByRole('link', { name: 'Open arc ↗' })).toHaveAttribute('href', '/')

  // A star joins the shortlist.
  await page.getByRole('button', { name: 'Star A Reel' }).first().click()
  await expect(page.locator('#short .pick')).toHaveText(['A · Reel'])

  // Details draws each icon on both wallpapers; nothing scrolls sideways at phone width.
  await page.getByRole('tab', { name: 'Details' }).click()
  await expect(page.locator('article.card')).toHaveCount(41)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  // The link opens the app.
  await page.getByRole('link', { name: 'Open arc ↗' }).click()
  await expect(page).toHaveURL(/#\/live$/)
})
