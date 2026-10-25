// The server bundle's entry (vite.server.config.ts → dist/server.js), which
// api/mcp.js and scripts/dev.mjs load: the handler with the built views.

import { BEAT_HTML } from './beatHtml'
import { GROOVES_HTML } from './groovesHtml'
import { GUIDE_HTML } from './guideHtml'
import { createArcHandler } from './server'

export const handler = createArcHandler({ beat: BEAT_HTML, guide: GUIDE_HTML, grooves: GROOVES_HTML })
