// Bundles the MCP server (src/handler.ts) into dist/server.js for the Vercel
// Function (api/mcp.js) and `npm run dev`: one ESM file with the card parser
// from ../web/src/core and the built view (ui-dist/beat.html, so build the
// views first) inlined. Packages from node_modules stay imports; Vercel traces
// and ships them. `npm run build:server`.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  // public/ is the Vercel project's static page, not part of the bundle.
  publicDir: false,
  build: {
    ssr: fileURLToPath(new URL('./src/handler.ts', import.meta.url)),
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'server.js', format: 'es' } },
  },
})
