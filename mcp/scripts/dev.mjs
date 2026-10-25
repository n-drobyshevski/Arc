// Serves the built server (dist/server.js, `npm run build` first) on
// http://localhost:3000/mcp for local testing with an MCP client such as
// `npx @modelcontextprotocol/inspector`. PORT changes the port.
//
//   npm run build && npm run dev

import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { handler } from '../dist/server.js'

const port = Number(process.env.PORT || 3000)

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${port}`}`)
  if (url.pathname !== '/mcp') {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found: the MCP endpoint is /mcp\n')
    return
  }
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v)
    else if (Array.isArray(v)) for (const x of v) headers.append(k, x)
  }
  const response = await handler(new Request(url, { method: req.method, headers, body }))
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (response.body) Readable.fromWeb(response.body).pipe(res)
  else res.end()
}).listen(port, () => console.log(`arc MCP server: http://localhost:${port}/mcp`))
