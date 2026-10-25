// Builds the beat-card view (views/beat) into one self-contained HTML file,
// ui-dist/beat.html: scripts and styles inlined (vite-plugin-singlefile), as
// an MCP App view runs with no network. vite.guide.config.ts builds the guide
// view the same way with viewConfig; `npm run build:views` runs both, this one
// first, as it empties ui-dist.
//
// The views import the card parser and the guide from ../web/src/core, and
// the guide view the key caps from ../web/src/ui/components, outside this
// package; Vite bundles them like any other file. Preact is deduped so those
// files get this package's copy: web/ has its own, which a deploy of mcp/
// doesn't install, and two copies would not render together. tsconfig.json's
// paths do the same for the typecheck, which would look for preact in
// web/node_modules from those files.
import { fileURLToPath } from 'node:url'
import preact from '@preact/preset-vite'
import { defineConfig, type UserConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** The build of views/[name]/[name].html into ui-dist/[name].html; [empty] clears ui-dist first. */
export function viewConfig(name: string, empty: boolean): UserConfig {
  return {
    root: fileURLToPath(new URL(`./views/${name}`, import.meta.url)),
    plugins: [preact({ prerender: { enabled: false } }), viteSingleFile()],
    resolve: { dedupe: ['preact'] },
    build: {
      outDir: fileURLToPath(new URL('./ui-dist', import.meta.url)),
      emptyOutDir: empty,
      target: 'es2022',
      rollupOptions: { input: fileURLToPath(new URL(`./views/${name}/${name}.html`, import.meta.url)) },
    },
  }
}

export default defineConfig(viewConfig('beat', true))
