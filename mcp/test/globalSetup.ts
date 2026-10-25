// Builds views/beat, views/guide and views/grooves into ui-dist/beat.html,
// guide.html and grooves.html before the tests, as the server inlines them
// (src/beatHtml.ts, src/guideHtml.ts, src/groovesHtml.ts), so `npm test`
// works on a fresh checkout. The beat view first: its build empties ui-dist.
import { build } from 'vite'

export default async function setup(): Promise<void> {
  for (const config of ['../vite.config.ts', '../vite.guide.config.ts', '../vite.grooves.config.ts']) {
    await build({ configFile: new URL(config, import.meta.url).pathname, logLevel: 'warn' })
  }
}
