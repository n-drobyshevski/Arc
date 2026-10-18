// Dev helper: screenshot the app in Chromium.
//   node scripts/shot.mjs <out.png> [hash] [--dark] [--skin=EP40] [--size=393x852] [--query=demo] [--wait=800]
// Starts a Vite dev server, opens the page (optionally ?<query>#<hash>) and saves a PNG.
// --skin picks the skin in Settings first (as a person would; ?demo keeps settings in memory), then opens [hash].
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const out = args.find((a) => !a.startsWith('--') && a.endsWith('.png'))
if (!out) { console.error('usage: node scripts/shot.mjs <out.png> [hash] [--dark] [--skin=EP40|EP1320] [--size=WxH] [--query=q] [--wait=ms]'); process.exit(2) }
const hash = args.find((a) => !a.startsWith('--') && a !== out) ?? ''
const opt = (name, dflt) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? dflt
const [w, h] = opt('size', '393x852').split('x').map(Number)
const query = opt('query', '')
const wait = Number(opt('wait', '800'))
const skin = opt('skin', '')

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' })
await server.listen()
const port = server.httpServer.address().port
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' })
try {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: args.includes('--dark') ? 'dark' : 'light' })
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()) })
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  const base = `http://127.0.0.1:${port}/${query ? `?${query}` : ''}`
  if (skin) {
    const label = { EP133: 'EP-133', EP40: 'EP-40', EP1320: 'EP-1320' }[skin] ?? skin
    await page.goto(`${base}#settings`)
    await page.getByRole('radio', { name: label, exact: true }).click()
    await page.evaluate((h) => { location.hash = h }, hash.replace(/^#/, '') || 'live')
  } else {
    await page.goto(`${base}${hash ? `#${hash.replace(/^#/, '')}` : ''}`)
  }
  await page.waitForTimeout(wait)
  await page.screenshot({ path: out })
  console.log(out)
} finally {
  await browser.close()
  await server.close()
}
