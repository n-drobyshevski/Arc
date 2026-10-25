// Builds the beat-card view (views/beat) into one self-contained HTML file,
// ui-dist/beat.html: scripts and styles inlined (vite-plugin-singlefile), as
// an MCP App view runs with no network. `npm run build:views`.
//
// The view imports the card parser from ../web/src/core, outside this
// package; Vite bundles it like any other file.
import { fileURLToPath } from 'node:url'
import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  root: fileURLToPath(new URL('./views/beat', import.meta.url)),
  plugins: [preact({ prerender: { enabled: false } }), viteSingleFile()],
  build: {
    outDir: fileURLToPath(new URL('./ui-dist', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: fileURLToPath(new URL('./views/beat/beat.html', import.meta.url)) },
  },
})
