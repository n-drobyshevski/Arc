// The server bundle's entry (vite.server.config.ts → dist/server.js), which
// api/mcp.js and scripts/dev.mjs load: the handler with the built view.

import { BEAT_HTML } from './beatHtml'
import { createArcHandler } from './server'

export const handler = createArcHandler(BEAT_HTML)
