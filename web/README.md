# arc web

The arc Android app ported to the browser: Vite, Preact, `@preact/signals` and TypeScript (strict, `noUncheckedIndexedAccess`). It talks to the EP-133 over WebMIDI, keeps the library in IndexedDB and installs as a PWA. What it does for users, the browser table and how it differs from Android are in the [root README](../README.md#web-app).

Production: https://arc-pi-mauve.vercel.app. Every other branch gets a Vercel preview.

## Scripts

Node 22 or newer. Run from `web/`.

```sh
npm ci
npm run dev          # Vite dev server; open /?demo for the simulated EP-133
npm run check        # typecheck + unit tests + production build: run before every commit
npm run typecheck    # tsc --noEmit
npm test             # Vitest, once (TZ=UTC); npm run test:watch to keep it running
npm run build        # dist/ with the service worker and manifest
npm run preview      # serve dist/
npm run e2e          # Playwright smoke test against the built app (see Testing)
npm run gen:guide    # regenerate src/core/text/guideData.ts from core's GuideText.kt
node scripts/shot.mjs out.png '/backups' --query=demo [--dark] [--size=393x852]   # screenshot a screen
```

The version comes from `../version.properties` at build time (`vite.config.ts`). Vercel production builds show it exactly; every other build adds `-dev`, plus the CI run and commit when known.

## Layout of `src/`

```
main.tsx        start-up: theme, ?demo, browser deps, controller, render (MainActivity.onCreate)
app.tsx         Root(): which screen shows, the sheets, drag-and-drop import
pwa.ts          service worker registration; reloads for an update only when no transfer runs
version.ts      APP_VERSION, PAK_AUTHOR (Arc.kt)
core/           pure TypeScript port of the Kotlin core/ module: no DOM, no browser APIs
  protocol/       packed7, frame, session, fs, device, SysEx reassembly, port matching, traffic log
  formats/        zip, wav, tar, crc32
  backup/         backup, restore, the .pak layout, export, library.json
  features/       device browser, upload, trim, pads, search, compare, live mirror
  text/           every user-visible string; webText.ts holds the browser rewordings
  util/           bytes, and the Kotlin string behaviours the ports rely on
platform/       the browser behind small interfaces (the Android parts of app/)
  midi/           WebMIDI transport and device discovery; Web Locks so only one tab connects
  storage/        IndexedDB library and settings, the library folder (File System Access), cross-tab sync
  files/          pick, save, drag and drop, launchQueue (.pak file handler)
  share/          navigator.share with a save fallback
  audio/          playback (SoundPlayer)
  wakelock/       screen wake lock (TransferService, keepScreenOn)
state/          the controller the UI talks to (ArcController.kt); see state/README.md
boot/           browserDeps.ts: wires platform/ into the controller's Deps
ui/             components, screens, sheets, navigation, theme; see ui/README.md
dev/demo.ts     ?demo: a fake requestMIDIAccess backed by the test simulator
```

`core/` and `state/` never touch browser globals, so they run in plain Vitest. `state/` gets everything through `Deps` (`state/deps.ts`); tests pass fakes.

## How the port maps to the Kotlin

Each file is a port of one Kotlin file (sometimes a few) and says so on its first line:

```ts
// Port of core/src/main/kotlin/dev/arc/ep133/protocol/Session.kt (+ reference/src/protocol/session.js)
```

- `core/src/main/kotlin/dev/arc/ep133/<pkg>/X.kt` becomes `src/core/<pkg>/x.ts`, line by line where the protocol is concerned. The Kotlin core is itself a port of `../reference/`, which stays the read-only spec; when they disagree, the header comment says which one this file follows.
- `app/.../controller/ArcController.kt` is `src/state/` (split into controller, connection, tasks, mirror). `app/.../midi`, `data`, `files` and `audio` are `src/platform/`. Compose screens in `app/.../ui/` are `src/ui/` with the same names.
- Text is never retyped: screens use `core/text/*`, which copy the Kotlin strings. Only sentences about the phone, Android, Documents/arc or the share sheet are reworded, all in `webText.ts`. The guide data is generated from `GuideText.kt` (`npm run gen:guide`), and a test fails when it is stale.
- Web stand-ins for Android features (foreground service, Documents/arc, the VIEW intent, share sheet) are listed in the header of the file that replaces them.

Never edit `../core`, `../app` or `../reference` from here. A behaviour change goes into the Kotlin first, then into the port.

## Testing

- **Unit tests** (`test/**/*.test.ts`, Vitest, Node): `test/core` mirrors the Kotlin tests (`ProtocolTest`, `SessionTest`, `E2eTest`, `PakCompatTest`, `QuirksTest`, ...) and keeps their names and cases. `test/platform` runs storage against `fake-indexeddb` and MIDI against `test/helpers/fakeMidiAccess.ts`. `test/state` drives the controller against the simulator. `test/ui` covers the pure UI logic.
- **The simulator**, `test/helpers/mockDevice.ts`, is a port of Kotlin's `MockEP133` (itself `reference/test/mock-device.js`), strict in the same places. The same simulator powers `?demo`.
- **Compatibility:** `test/core/backup/pakCompat.test.ts` opens `../reference/test/fixtures/sample.pak` in place, backs up the same simulated device and compares every entry with the JS output byte for byte (compressed bytes may differ). Fixtures are read from `reference/`, never copied.
- **Smoke test** (`test/e2e/smoke.spec.ts`, Playwright, Chromium): builds the app, serves it with `vite preview` on 127.0.0.1:4173 and walks through the main flows with `?demo`, plus a page without WebMIDI. Once per machine: `npx playwright install chromium`, or point `CHROMIUM_PATH` at a Chromium already installed.
- CI (`../.github/workflows/web.yml`) runs typecheck, tests, build and the smoke test on pull requests and pushes to `main` that touch `web/`, `reference/`, `version.properties` or `vercel.json`.

Unit tests run in UTC (`TZ=UTC` in the npm scripts); the smoke test also pins the `en-US` locale.

## Demo mode

Add `?demo` to the URL (`http://localhost:5173/?demo#/backups`). `main.tsx` then loads `src/dev/demo.ts` as its own chunk, before any MIDI code runs. It replaces `navigator.requestMIDIAccess` with a fake backed by `MockEP133`, holding 12 sounds and 3 projects, and answers the MIDI permission as granted, so arc connects by itself. The library starts empty. Replies arrive as separate tasks, like real MIDI events, so progress shows.

From the console (and from Playwright), `window.__arcDemo` drives it:

```js
__arcDemo.unplug(); __arcDemo.plug()           // the USB cable
__arcDemo.noteOn(36, 100); __arcDemo.noteOff(36) // pad notes (36-83) for the Live tab
__arcDemo.pushPadActive(project, group, pad)    // the device's "pad selected" push
__arcDemo.clock('start' | 'stop' | 'tick' | 120)
__arcDemo.mock                                  // the simulator itself
```

Without `?demo`, headless Chromium leaves `requestMIDIAccess()` waiting on a permission prompt nobody answers; the library side still works there.

## Deploy

`../vercel.json` (repository root) is the build: `npm ci --prefix web`, `npm run build --prefix web`, output `web/dist`, with cache headers for `sw.js`, `manifest.webmanifest` and `assets/`, `Permissions-Policy: midi=(self)`, and a Content-Security-Policy (same-origin scripts and connections only, `data:` fonts for Vite's inlined Manrope subsets, `frame-ancestors 'none'`). A new external origin or an inline script needs a matching change there. Vercel skips the build when nothing under `web/`, `reference/`, `version.properties` or `vercel.json` changed. The Vercel project is `arc`.
