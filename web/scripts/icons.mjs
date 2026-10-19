// Writes the app icon: public/icons/icon.svg and the PNGs the manifest and index.html list.
//   node scripts/icons.mjs
// The artwork is the Android launcher icon's (app/src/main/res/drawable/ic_launcher_foreground.xml), on a 512-unit
// canvas: a cassette with its window and head notch cut through, a paper hub and the take-up reel lit orange.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url))
const NAVY = '#1f2558'
const ART = [
  ['#f4f2ee', 'M148 168H364A24 24 0 0 1 388 192V312A24 24 0 0 1 364 336H320L301.5 304H210.5L192 336H148A24 24 0 0 1 124 312V192A24 24 0 0 1 148 168Z M168 196H344A12 12 0 0 1 356 208V268A12 12 0 0 1 344 280H168A12 12 0 0 1 156 268V208A12 12 0 0 1 168 196Z'],
  ['#f4f2ee', 'M186 238A20 20 0 1 1 226 238A20 20 0 1 1 186 238Z M196 238A10 10 0 1 1 216 238A10 10 0 1 1 196 238Z'],
  ['#ff4c00', 'M276 238A30 30 0 1 1 336 238A30 30 0 1 1 276 238Z M296 238A10 10 0 1 1 316 238A10 10 0 1 1 296 238Z'],
].map(([fill, d]) => `  <path fill="${fill}" fill-rule="evenodd" d="${d}"/>`).join('\n')

// The launcher shows 85.3..426.7 of the 512 canvas (72 of 108dp); the "any" icon is that square as a rounded tile.
const VISIBLE = '85.3 85.3 341.4 341.4'
const svg = (viewBox, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n  ${bg}\n${ART}\n</svg>\n`
const tile = svg(VISIBLE, `<rect x="85.3" y="85.3" width="341.4" height="341.4" rx="75" fill="${NAVY}"/>`)
// Full bleed for icons the platform masks itself. Maskable icons keep the art inside a circle of 40% of their size:
// with 400 units shown, the art's farthest corner (r 158) lands at 202 of 512.
const bleed = (viewBox) => svg(viewBox, `<rect width="512" height="512" fill="${NAVY}"/>`)

writeFileSync(dir + 'icon.svg', tile)
const pngs = [
  ['icon-192.png', 192, tile],
  ['icon-512.png', 512, tile],
  ['maskable-192.png', 192, bleed('56 56 400 400')],
  ['maskable-512.png', 512, bleed('56 56 400 400')],
  ['apple-touch-icon.png', 180, bleed(VISIBLE)], // iOS rounds the corners itself and fills transparency with black
]
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' })
try {
  for (const [name, size, src] of pngs) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src)
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${url}" width="${size}" height="${size}">`)
    await page.locator('img').evaluate((img) => img.decode())
    await page.screenshot({ path: dir + name, omitBackground: true })
    await page.close()
    console.log(name, size)
  }
} finally {
  await browser.close()
}
