// The Playwright test host (index.html, host.ts) on the Vite dev server, with
// the built MCP server (dist/server.js, `npm run build:server`) mounted at
// /mcp: the host reads the view and calls the tool over real HTTP.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

type Handler = (request: Request) => Promise<Response>

/** Node's request as a Web Request for the handler, and its Response back. */
async function serve(handler: Handler, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v)
    else if (Array.isArray(v)) for (const x of v) headers.append(k, x)
  }
  const url = new URL('/mcp', `http://${req.headers.host}`)
  const response = await handler(
    new Request(url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }),
  )
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (response.body) Readable.fromWeb(response.body as import('node:stream/web').ReadableStream).pipe(res)
  else res.end()
}

function mcpServer(): Plugin {
  return {
    name: 'arc-mcp-server',
    async configureServer(server) {
      const file = pathToFileURL(fileURLToPath(new URL('../../../dist/server.js', import.meta.url))).href
      const { handler } = (await import(file)) as { handler: Handler }
      server.middlewares.use('/mcp', (req, res, next) => {
        serve(handler, req, res).catch(next)
      })
    },
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  plugins: [mcpServer()],
  server: { fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] } },
})
