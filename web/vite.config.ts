import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// version.properties at the repo root is the one place arc's version is set,
// shared with the Android build. Same rule: MAJOR.MINOR.PATCH, minor and patch below 100.
function readVersion(): string {
  const file = fileURLToPath(new URL('../version.properties', import.meta.url))
  const match = /^version=(.*)$/m.exec(readFileSync(file, 'utf8'))
  const v = match?.[1]?.trim() ?? ''
  if (!/^\d+\.\d{1,2}\.\d{1,2}$/.test(v)) throw new Error(`version.properties: "${v}" is not MAJOR.MINOR.PATCH`)
  return v
}

// Release builds (Vercel production, or ARC_RELEASE=true) show exactly X.Y.Z, like
// Android release builds. Others are X.Y.Z-dev, plus the CI run and commit when known.
function buildName(v: string): string {
  const env = process.env
  if (env.ARC_RELEASE === 'true' || env.VERCEL_ENV === 'production') return v
  let name = `${v}-dev`
  if (env.GITHUB_RUN_NUMBER) name += `.${env.GITHUB_RUN_NUMBER}`
  const sha = env.GITHUB_SHA || env.VERCEL_GIT_COMMIT_SHA
  if (sha) name += `+${sha.slice(0, 7)}`
  return name
}

const version = readVersion()

// The installable app and its service worker (src/pwa.ts registers it). 'prompt',
// not 'autoUpdate': a new version waits for the update prompt's Reload, which
// itself waits for any transfer to end, so a deploy can never reload arc mid-restore.
const pwa = VitePWA({
  strategies: 'generateSW',
  registerType: 'prompt',
  injectRegister: null,
  // The icons are in globPatterns already (listing them twice duplicates precache entries).
  includeManifestIcons: false,
  manifest: {
    name: 'arc for EP-133 K.O. II',
    short_name: 'arc',
    description:
      'Free backup librarian for the EP-133 K.O. II. Back up, restore and share your projects and samples over USB-C.',
    id: './',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#E6E2DB',
    theme_color: '#E6E2DB',
    categories: ['music', 'utilities'],
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    // Opening a .pak with the installed app (Chromium desktop): the files reach
    // window.launchQueue, which the controller consumes at start (platform/files/launchQueue.ts).
    file_handlers: [
      {
        action: './',
        accept: {
          'application/zip': ['.pak'],
          'application/octet-stream': ['.pak'],
          'application/x-zip-compressed': ['.pak'],
        },
      },
    ],
    launch_handler: { client_mode: 'focus-existing' },
  },
  workbox: {
    navigateFallback: 'index.html',
    // public/icon-board is a standalone design page, not part of the app: the
    // service worker must let its navigations reach the network, and not precache it.
    navigateFallbackDenylist: [/\/icon-board(?:[/?]|$)/],
    globPatterns: ['**/*.{js,css,html,svg,png,woff2,txt}'],
    globIgnores: [
      'icon-board/**',
      // ?demo only: fetched (and runtime-cached) when someone opens the demo.
      '**/demo-*.js',
      '**/*.map',
      // Manrope: precache the latin and latin-ext subsets the UI text uses. The
      // others load by unicode-range only when a backup name needs them.
      '**/manrope-cyrillic-*',
      '**/manrope-greek-*',
      '**/manrope-vietnamese-*',
    ],
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        // Hashed, so never stale: the demo chunk and the other font subsets, kept once fetched.
        urlPattern: /\/assets\/(?:demo-[\w-]+\.js|manrope-[\w-]+\.woff2)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'arc-assets',
          expiration: { maxEntries: 40 },
          cacheableResponse: { statuses: [200] },
        },
      },
    ],
  },
})

// teenage engineering's EP Sample Tool, where the factory sounds come from
// (platform/net/factory): their server sends no CORS headers, so arc reads it
// through its own origin. vercel.json forwards the same path in production.
const sampleTool = {
  '/te/apps/ep-sample-tool': {
    target: 'https://teenage.engineering',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/te/, ''),
  },
}

export default defineConfig({
  plugins: [preact(), pwa],
  base: './',
  server: { proxy: sampleTool },
  preview: { proxy: sampleTool },
  define: {
    __ARC_VERSION__: JSON.stringify(version),
    __ARC_BUILD__: JSON.stringify(buildName(version)),
  },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 20000,
    env: { TZ: 'UTC' },
  },
})
