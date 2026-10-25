// Builds views/beat and views/guide into ui-dist/beat.html and guide.html
// before the tests, as the server inlines them (src/beatHtml.ts,
// src/guideHtml.ts), so `npm test` works on a fresh checkout. The beat view
// first: its build empties ui-dist.
import { build } from 'vite'

export default async function setup(): Promise<void> {
  for (const config of ['../vite.config.ts', '../vite.guide.config.ts']) {
    await build({ configFile: new URL(config, import.meta.url).pathname, logLevel: 'warn' })
  }
}
