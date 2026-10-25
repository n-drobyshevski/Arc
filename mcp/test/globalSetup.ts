// Builds views/beat into ui-dist/beat.html before the tests, as the server
// inlines it (src/beatHtml.ts), so `npm test` works on a fresh checkout.
import { build } from 'vite'

export default async function setup(): Promise<void> {
  await build({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, logLevel: 'warn' })
}
