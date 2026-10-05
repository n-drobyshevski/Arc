# state/ — the controller the UI talks to

Port of `ArcController.kt` (+ the non-UI parts of `MainActivity.kt`, `ArcApp.kt`).
Screens read signals and call actions; they never touch MIDI, IndexedDB or the
platform directly. `state/` has no browser globals: everything comes in through
`Deps` (`deps.ts`), and the browser wiring lives in `src/boot/browserDeps.ts`.

## Creating it

```ts
import { createBrowserDeps } from '../boot/browserDeps'
import { createController } from '../state/controller'

const deps = await createBrowserDeps({
  onLibraryBlocked: () => showBanner('Close other arc tabs to open the library'),
  onLibraryVersionChange: () => location.reload(), // or ask first
})
const c = createController(deps)
await c.start()          // library observe, sweep/reconcile/index, MIDI watch, auto-connect, launch queue
// on teardown: c.dispose()
```

`createBrowserDeps` never rejects for the database: if IndexedDB can't open,
the library is `unavailableLibrary(err)` and `start()` toasts
`Strings.libraryFailed(msg)`; the device side keeps working. Tests build
`Deps` by hand with fakes (see `test/state/controller.test.ts` harness).

## Signals (read with `.value` in components)

| Signal | Type | Notes |
|---|---|---|
| `c.state` | `UiState` (`types.ts`) | the one app state; every change is a new object |
| `c.phase` | `ConnectionPhase` | `'unsupported' \| 'disconnected' \| 'opening' \| 'handshaking' \| 'ready' \| 'task' \| 'reading'` |
| `c.settings` | `AppSettings` | theme, autoConnect, keepScreenOn, keepLast, liveOneGroup, liveFollow |
| `c.playing` | `string \| null` | key of the sound playing: `device:N`, `backup:<id>:N`, or the key given to `playNow` |

Also: `c.store` (`get()`, `update()`, `subscribe()`, `waitFor()`), `c.trafficLog`,
`c.coach` (`seen`, `markSeen()`), getters `c.isConnected`, `c.midiDescription`.

### UiState fields

`midiSupported`, `connected`, `device` (`{info, storage, sounds, projects}` or null),
`busy`, `backups` (`BackupRecord[]`, newest first), `libraryLoaded` (hide the empty
state until true), `freshId` (just-saved backup to highlight), `task`
(`{title, label, fraction, cancelling}` — show the progress sheet), `spaceLeft`,
`toast` (`{id, text, error}`), `browser` (`contents`, `details`, `projectSounds`,
`projectPads`, `reading`, `draft`), `diff`, `contents` (opened backup: `pak`,
`durations`, `error`), `search` (`query`, `results`, `indexing`), `pakCompare`,
`mirror` (`{state: MirrorState, loading, error}`), `folderPicked`, `folderStatus`
(`'none' \| 'granted' \| 'prompt' \| 'denied'`; `'prompt'` shows the "Reconnect
library folder" banner), `canPickFolder`, `folderName` (the folder in use, for `WebText.folderNote`).

## Actions

Async actions return a Promise that resolves when the work is done and never
reject (errors become toasts); the UI may ignore it.

**View / lifecycle (required wiring)**
- `tabChanged(prev: Tab, next: Tab)` — call on every tab switch (`'backups' | 'live' | 'device'`).
- `setLive(live: boolean)` — true while the Live tab is in front (false under debug/settings/guide).
  The mirror runs while live + device ready + page visible; do not drive
  `openMirror`/`pauseMirror` from the UI.
- `toast(text, error?)`, `dismissToast(id)` — the UI times toasts out with `dismissToast`.

**Device**: `connect()` (Connect/Disconnect toggle), `refreshDevice()`, `cancelTask()`,
`backup()`, `restore(b, sel)`, `compare(b, sel)` / `clearDiff()`.

**Device browser**: `refreshBrowser()`, `loadSoundDetails(slot)`, `loadProjectSounds(project)`,
`playDeviceSound(slot)`*, `stopPlayback()`, `playNow(key, pcm, channels, rate)`*.
Upload: `pickSamples()`* or `pickForUpload(files)`, then `setDraftSlot(i, slot)`,
`setDraftTrim(i, trim)`, `uploadDraft()` / `dropDraft()`.

**Backups**: `openContents(b)` / `closeContents()`, `playBackupSound(slot)`*,
`compareBackups(a, b)` / `closeCompare()`, `saveEdits(b, title, notes)`,
`delete(b): Promise<boolean>`, `setSearch(query)`, `pickImport()`*,
`importFiles(files)` (drop: `attachDrop(document.body, { onFiles: f => c.importFiles(f), filter: f => isPakName(f.name) })`
from `platform/files/pick`), `exportBytes(id, 'wav:N' | 'project:N')`.

**Export / share** (call from a tap)*: `savePak(b)`, `sharePak(b)`, `saveWav(b, snd)`,
`shareWav(b, snd)`, `saveProject(b, n)`, `shareProject(b, n)`, `pakBytes(b)`, `pakBlob(b)`.

**Library folder**: `pickFolder()`* (restores from it; writable folders become the
library folder), `restoreFromFolder(target)`, `reconnectFolder()`* (the banner tap),
`exportLibrary()`* (when `!canPickFolder`).

**Live**: `mirrorName(pad)`, `setPadOrder(order)`, `padOrder()`, `forgetLearned()`.
(`openMirror`/`pauseMirror`/`closeMirror` exist but are driven by `setLive`/`tabChanged`.)

**Settings**: `setTheme(t)`, `setAutoConnect(on)`, `setKeepScreenOn(on)`,
`setLiveOneGroup(on)`, `setLiveFollow(on)`, `pruneCount(keep)` (for the confirm
dialog), then `setKeepLast(keep)`.

**Debug log**: `logText()`, `logFileName()`, `saveLog()`*, `shareLog()`*, `copyLog()`*.

**Formatting**: `fmtDay(ms)`, `fmtDateTime(ms)`.

\* Needs a user gesture: call straight from the click handler (before any
`await` of your own). Playback wakes the AudioContext, pickers and share sheets
need transient activation.

## Web behaviour the UI should know

- A running task sets a leave-page guard, the document title shows progress,
  and the screen wake lock is held; tell the user to keep the tab in front.
- Another tab may own the device (`Connection` toasts it); only one tab connects.
- Hiding the page stops playback and pauses the mirror.
