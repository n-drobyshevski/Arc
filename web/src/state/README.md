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
  demo,     // ?demo: library in IndexedDB "arc-demo", settings in memory (see below)
  storage,  // pageStorage(demo): the storage the theme was read from
})
const c = createController(deps)
await c.start()          // library observe, sweep/reconcile/index, MIDI watch, auto-connect, launch queue
// on teardown: c.dispose()
```

`createBrowserDeps` never rejects for the database: if IndexedDB can't open,
the library is `unavailableLibrary(err)` and `start()` toasts
`Strings.libraryFailed(msg)`; the device side keeps working (Live's pad
copies then last for the session). Tests build `Deps` by hand with fakes
(see `test/state/controller.test.ts` and `test/state/liveHarness.ts`).

**?demo never touches the real library or settings**: with `demo: true` the
library is the separate IndexedDB database `arc-demo` (with its own
BroadcastChannel `arc-demo`), settings / Live preferences / Live's last read
are in memory for the page's lifetime (`pageStorage(true)`), storage events
from real tabs are ignored, and the device lock is `arc-device-demo`, so a
real tab can still connect the EP-133.

Live's deps: `liveAudio` (`LiveAudioDeps`, platform/audio/liveAudio's
`LiveAudio`: one output mixing pads and keys, samples preloaded by key),
`padSounds` (the folder PadSoundCache keeps its copies in: IndexedDB store
`padSounds`, db version 3) and `lastRead` (Live's last read, localStorage
`arc.live`). `nullLiveAudio()` is an output that never opens.

## Signals (read with `.value` in components)

| Signal | Type | Notes |
|---|---|---|
| `c.state` | `UiState` (`types.ts`) | the one app state; every change is a new object |
| `c.phase` | `ConnectionPhase` | `'unsupported' \| 'disconnected' \| 'opening' \| 'handshaking' \| 'ready' \| 'task' \| 'reading'` |
| `c.settings` | `AppSettings` | theme, autoConnect, keepScreenOn, keepLast, liveOneGroup, liveFollow, guideSeen, liveKeys, keysRoot (0..11), keysScale (`Scale`), keysOctave (0..8), keysNames (`NoteNames`) |
| `c.playing` | `string \| null` | key of the sound playing in the lists: `device:N`, `backup:<id>:N`, or the key given to `playNow` |
| `c.liveVoices` | `ReadonlySet<string>` | Live voices sounding on the phone: pads `live:<group>:<offset>`, keys `keys:<index>` (Android `liveKeys`) |
| `c.playingPads` | `ReadonlySet<number>` | the pads sounding, as `padKey(pad)` (ring them) |
| `c.playingKeys` | `ReadonlySet<number>` | the KEYS keys sounding, by index (ring them) |

Also: `c.store` (`get()`, `update()`, `subscribe()`, `waitFor()`), `c.trafficLog`,
`c.coach` (`seen`, `markSeen()`: the guide overlay's first-run flag, now
`AppSettings.guideSeen`, so it is kept in library.json; the old
`arc.coachSeen` is carried over at start), getters `c.isConnected`, `c.midiDescription`.

Only settings that were changed are stored (and written to library.json as
`app.*`), so a fresh install never overrides an earlier one's choices.

### UiState fields

`midiSupported`, `connected`, `device` (`{info, storage, sounds, projects}` or null),
`busy`, `backups` (`BackupRecord[]`, newest first), `libraryLoaded` (hide the empty
state until true), `freshId` (just-saved backup to highlight), `task`
(`{title, label, fraction, cancelling}` — show the progress sheet), `spaceLeft`,
`toast` (`{id, text, error}`), `browser` (`contents`, `details`, `projectSounds`,
`projectPads`, `reading`, `draft`), `diff`, `contents` (opened backup: `pak`,
`durations`, `error`), `search` (`query`, `results`, `indexing`), `pakCompare`,
`mirror` (`{state: MirrorState, loading, error, offline}`; `offline` is
`MirrorText.lastSeen(time)` while Live shows the last read without a device:
show **Offline** and that line; `state.notes` / `state.lastNote` are every
note held, for the KEYS view), `backgroundRead` (Live is copying a pad's
sound: unlike `busy`, keep every key enabled; an action just waits a moment),
`keysPad` (the `PhysicalPad` whose sample KEYS plays, or null), `folderPicked`, `folderStatus`
(`'none' \| 'granted' \| 'prompt' \| 'denied'`; `'prompt'` shows the "Reconnect
library folder" banner), `canPickFolder`, `folderName` (the folder in use, for `WebText.folderNote`).

## Actions

Async actions return a Promise that resolves when the work is done and never
reject (errors become toasts); the UI may ignore it.

**View / lifecycle (required wiring)**
- `HOME_TAB` (`'live'`, from `types.ts`): the app opens on Live, and Back from
  Backups or Device returns to Live (MainActivity; ui/nav.ts should use it).
- `tabChanged(prev: Tab, next: Tab)` — call on every tab switch (`'backups' | 'live' | 'device'`).
  Leaving Live closes the mirror and stops its sounds.
- `setLive(live: boolean)` — true while the Live tab is in front (false under debug/settings/guide).
  The mirror runs while live + page visible, connected or not (offline it
  shows the last read; it restarts when a device connects or goes), and
  Live's sound output is open on the same terms; do not drive
  `openMirror`/`pauseMirror`/`openLiveAudio`/`closeLiveAudio` from the UI.
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
- Pads sound while held (a gate) and play alongside each other (chords, up
  to 8): `playPad(pad, hold = true)`* on pointerdown, `releasePad(pad)` on
  pointerup/cancel; `hold: false` (a screen reader's Play) plays the whole
  sample. The sound comes from arc's copy of the device's sound, else the
  newest backup holding it, else (connected) the device; errors and "no
  copy" / "no sample yet" are toasts. A tapped pad becomes the KEYS sound.
- KEYS: `playKey(index, hold = true)`* / `releaseKey(index)` (0 = '.', the
  lowest), `selectKeysPad(pad)` (also for a pad played on the device),
  `setLiveKeys(on)`, `setKeysRoot(0..11)`, `setKeysScale(scale)`,
  `setKeysOctave(0..8)`; values are clamped. `Keys.notes(root, scale, octave)`
  (core/features/keys) gives each key's note for labels.
- While Live is open and connected, arc copies the samples on the active
  project's pads from the device in the background (`backgroundRead`).

**Settings**: `setTheme(t)`, `setAutoConnect(on)`, `setKeepScreenOn(on)`,
`setLiveOneGroup(on)`, `setLiveFollow(on)`, `setKeysNames(names)` (Note names
on the keys), `padSoundsSize(): Promise<number>` (bytes, for
`SettingsText.padSounds(Format.bytes(n))`) and `clearPadSounds()`,
`setGuideSeen()`, `pruneCount(keep)` (for the confirm dialog), then `setKeepLast(keep)`.

**Debug log**: `logText()`, `logFileName()`, `saveLog()`*, `shareLog()`*, `copyLog()`*.

**Formatting**: `fmtDay(ms)`, `fmtDateTime(ms)`.

\* Needs a user gesture: call straight from the click handler (before any
`await` of your own). Playback wakes the AudioContext, pickers and share sheets
need transient activation.

## Web behaviour the UI should know

- A running task sets a leave-page guard, the document title shows progress,
  and the screen wake lock is held; tell the user to keep the tab in front.
- Another tab may own the device (`Connection` toasts it); only one tab connects.
- Hiding the page stops playback, pauses the mirror and closes Live's output.
- Browsers start audio only after a tap: Live's output is set up on the first
  press when the page had none yet, so call `playPad`/`playKey` synchronously
  from the pointerdown handler.
- Restoring from a folder brings back the settings, Live's learned pads
  (combined with those learned since), the pad order (unless one was chosen
  since), the guide flag and live.json (unless this browser's read is newer),
  then rewrites library.json.
