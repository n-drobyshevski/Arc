// The Vercel Function behind https://<host>/mcp (vercel.json rewrites /mcp
// here): Node.js runtime, the Web fetch signature, every method to the MCP
// handler. dist/server.js is src/handler.ts bundled by `npm run build`
// (vite.server.config.ts) with the beat-card parser from ../web/src/core and
// the view's HTML inlined; Vercel runs the build before it traces this file.
// Plain JS on purpose: Vercel's own TypeScript step would leave the parser's
// extensionless ESM imports as they are, which Node can't load.

import { handler } from '../dist/server.js'

export default {
  fetch(request) {
    return handler(request)
  },
}
