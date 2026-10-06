// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt
// (+ the non-UI parts of app/src/main/kotlin/dev/arc/ep133/MainActivity.kt and ArcApp.kt,
//  reference/src/app.js)
//
// All app state (one UiState in a signal store) and every action, with the
// platform injected through Deps. createController(deps) builds it;
// controller.start() runs what ArcController's init block runs (library
// observing, startup maintenance, MIDI watching) plus the web's launch queue.
//
// Actions that are a Job on Android return a Promise here, resolved when the
// work is done (tests await them; the UI may ignore them).
//
// Web deltas, besides those in connection.ts, tasks.ts and mirror.ts:
// - Room Flows become Library.subscribe: every change reloads the list, the
//   names (for search) and the free space.
// - Search runs on every query, names or backups change; a generation token
//   keeps only the latest (collectLatest).
// - The library folder is opt-in (File System Access): reconcile at startup
//   only when its permission is already granted, else UiState.folderStatus is
//   'prompt' and [reconnectFolder] asks from a tap. After a folder is adopted
//   by [restoreFromFolder], the library is reconciled into it (Android's
//   Documents/arc already held every backup). [exportLibrary] is the
//   fallback for browsers that can't pick a folder.
// - Copy and folder messages use WebText (no Documents/arc on the web).
// - MainActivity's non-UI parts are here: VIEW intents (launchQueue),
//   save/share of paks, WAVs, projects and the log, keep-screen-on, the
//   mirror's lifecycle (live tab, device ready, tab visible) and the tab
//   side effects ([tabChanged]).
// - Playback needs a tap to wake the audio output: the play actions call
//   player.resumeInGesture() before their first await, so call them straight
//   from click handlers.
// - Live (main's Live KEYS delta): the mirror runs whenever Live is in front
//   and the tab visible, connected or not (offline it shows the last read);
//   Live's output (LiveAudioDeps) is open on the same terms; away from them
//   it is suspended, and let go after LIVE_AUDIO_KEEP_MS or when the page
//   goes (pagehide). Pads and keys play through live.ts. The first-run guide's flag is AppSettings.guideSeen
//   ([coach] keeps the old seen/markSeen shape for the UI).
// - Live's EDIT (an addition): [assignPad] writes a pad's sound at
//   once and offers UNDO on the toast ([toastWith] / [runToastAction]; the
//   closure stays here, the state only holds the word); [uploadForPad] goes
//   through the Device tab's upload sheet (draft + draftPad), then assigns.
// - [liveLate]: Live's output delay, for the display line's note, from the
//   output's latency (LiveAudioDeps.late); Android names Bluetooth from the route (liveWireless).
// - The debug screen's latency test: [liveLatency] / [resetLatency] (live.ts),
//   [liveEngine] (the row in use) and [liveLatencyHint] / [setLiveLatencyHint],
//   the web's stand-in for Android's audio engine choice (LatencyText). Play
//   actions take the press's event timeStamp ([at]) for the latency note.

import { computed, signal, type ReadonlySignal, type Signal } from '@preact/signals'
import { MAX_OCTAVE, MIN_OCTAVE, type NoteNames, type Scale } from '../core/features/keys'
import { choiceOf as pianoChoiceOf, type KeysView } from '../core/features/piano'
import { padKey, type PhysicalPad } from '../core/features/padNotes'
import type { PadTarget } from '../core/features/liveMirror'
import { backupDevice, restorePak } from '../core/backup/backup'
import { describePak, openPak, type PakDescription, type PakSound } from '../core/backup/pak'
import { project as exportProject, projectFileName, soundFileName, soundWav } from '../core/backup/pakExport'
import { compare as compareWithDevice } from '../core/features/backupDiff'
import { contents as deviceContents, projectLayout, soundDetails, type DeviceContents } from '../core/features/deviceBrowser'
import { FactorySounds } from '../core/features/factorySounds'
import { search as searchLibrary, type NameEntry } from '../core/features/librarySearch'
import type { PadOrder } from '../core/features/padPush'
import { compare as comparePaks } from '../core/features/pakCompare'
import { frames, seconds, type TrimRange } from '../core/features/sampleTrim'
import { nameFor, nextFree, upload, UploadItem } from '../core/features/sampleUpload'
import { decodeWav } from '../core/formats/wav'
import { assignPad as writePadSound, type SoundEntry } from '../core/protocol/device'
import { CancelledError } from '../core/protocol/errors'
import { download } from '../core/protocol/fs'
import type { TrafficLog } from '../core/protocol/trafficLog'
import { FeatureText } from '../core/text/featureText'
import type { WebLatencyHint } from '../core/text/latencyText'
import { MirrorText } from '../core/text/mirrorText'
import { DATE_TIME_PATTERN, DAY_PATTERN, date as formatDate } from '../core/text/format'
import { BackupDevice, fileNameFor, importTitle, toPrune, type BackupRecord, type RestoreSelection } from '../core/text/libraryRules'
import { SettingsText, type ThemeChoice } from '../core/text/settingsText'
import { Strings } from '../core/text/strings'
import { WebText } from '../core/text/webText'
import { ktTrim } from '../core/util/kotlinText'
import { APP_BUILD } from '../version'
import { describeFile, PAK_ACCEPT, WAV_ACCEPT, type ReadableFile } from '../platform/files/pick'
import { logFileName } from '../platform/files/save'
import type { FileData } from '../platform/files/save'
import { FileListTarget, type ExternalTarget } from '../platform/storage/external'
import { describeForRestore } from '../platform/storage/library'
import { indexSettings, type AppSettings } from '../platform/storage/settings'
import { keepScreenOn } from '../platform/wakelock/wakeLock'
import { Connection, connectionPhase, type ConnectionPhase } from './connection'
import type { Deps, LiveEngineInfo } from './deps'
import { LiveSounds, type LiveLatency } from './live'
import { MirrorController } from './mirror'
import { PreviewCache, type DecodedSound } from './previewCache'
import { createStore, type Store } from './store'
import { errorText, isCancelled, Tasks, type OnProgress } from './tasks'
import { initialState, type Tab, type UiState, type UploadDraftItem } from './types'

/** MainActivity COPY_LIMIT: the clipboard gets the latest part of a long log. */
export const COPY_LIMIT = 200_000

/** How long Live's output stays suspended (ready) after Live was left or hidden, before it is let go. */
export const LIVE_AUDIO_KEEP_MS = 60_000

/** The previews' cache keys for arc's pad copies ("pad:<slot>:<size>:<name>"); backups are "backup:<id>:<slot>". */
const PAD_PREVIEW = 'pad:'

const PAK_SAVE_MIME = 'application/octet-stream'
const PAK_SHARE_MIME = 'application/zip'
const WAV_MIME = 'audio/wav'
const TEXT_MIME = 'text/plain'
const LIBRARY_ZIP = 'arc-library.zip'

/** The first-run guide's "already shown" flag, as the UI reads it (useCoachFirstRun). */
export interface GuidePrefs {
  readonly seen: boolean
  markSeen(): void
}

const coerceIn = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

const sameSound = (a: SoundEntry | undefined, b: SoundEntry | undefined): boolean =>
  a !== undefined && b !== undefined && a.slot === b.slot && a.name === b.name && a.size === b.size

/** Kotlin String.toInt() for an export key's number. */
function toInt(s: string): number {
  if (!/^[+-]?\d+$/.test(s)) throw new Error(`For input string: "${s}"`)
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n > 2147483647 || n < -2147483648) throw new Error(`For input string: "${s}"`)
  return n
}

export function createController(deps: Deps): ArcController {
  return new ArcController(deps)
}

export class ArcController {
  readonly store: Store<UiState>
  /** The app state, for components. */
  readonly state: ReadonlySignal<UiState>
  /** The settings page's choices (ArcController.settings). */
  readonly settings: ReadonlySignal<AppSettings>
  /** The key of the sound playing (player.playing). */
  readonly playing: ReadonlySignal<string | null>
  /** Where the connection is (plan §3), derived from the state. */
  readonly phase: ReadonlySignal<ConnectionPhase>
  readonly trafficLog: TrafficLog
  /**
   * The guide overlay's first-run flag, for the UI: seen once AppSettings.guideSeen
   * is set (or the flag from before it, MainActivity's coach_seen); markSeen sets guideSeen.
   */
  readonly coach: GuidePrefs
  /** The Live voices sounding on the phone (pad "live:g:o" and key "keys:i" ids), for the rings (ArcController.liveKeys). */
  readonly liveVoices: ReadonlySignal<ReadonlySet<string>>
  /** The pads sounding on the phone, as padKey numbers (MainActivity's playingPads). */
  readonly playingPads: ReadonlySignal<ReadonlySet<number>>
  /** The KEYS notes sounding on the phone (grid and piano), first pressed first (MainActivity's playingNotes). */
  readonly playingNotes: ReadonlySignal<ReadonlySet<number>>
  /**
   * Live's output delay in ms while it is long enough to be heard against the
   * finger, else null: the display line says so (MirrorText.slowOutput).
   * From LiveAudioDeps.late, or, without it, the slow output it reports.
   */
  readonly liveLate: ReadonlySignal<number | null>
  private readonly slowMs = signal<number | null>(null)
  /** The debug screen's latency test: each engine's press-to-sound times this session. */
  readonly liveLatency: ReadonlySignal<LiveLatency>
  /** The row of the output Live plays through now (once heard), for "In use". */
  readonly liveEngine: ReadonlySignal<LiveEngineInfo | null>
  /** The debug screen's latencyHint choice; null where the output has none. */
  readonly liveLatencyHint: ReadonlySignal<WebLatencyHint> | null

  private readonly settingsSignal: Signal<AppSettings>
  private readonly tasks: Tasks
  private readonly conn: Connection
  private readonly mirror: MirrorController
  private readonly live: LiveSounds
  private toastIds = 0
  /** What the toast's key does (Live's UNDO), for the toast that shows it. */
  private toastRun: { id: number; run: () => void } | null = null
  /**
   * Bumped by every play request and every stop. A request that took a while
   * (a download, a decode) plays only if nothing stopped or replaced it meanwhile.
   */
  private playToken = 0
  /** The previews' decoded sounds (backups, pad copies), so playing one again starts at once. */
  private readonly previews = new PreviewCache()
  private searchGen = 0
  private libraryGen = 0
  private names: readonly NameEntry[] = []
  private liveTab = false
  private visible: boolean
  /** What syncMirror last decided: null (closed or paused), else the mirror runs for a ready device or not. */
  private mirrorWanted: 'ready' | 'offline' | null = null
  private audioWanted = false
  /** Lets Live's suspended output go after a while away ([LIVE_AUDIO_KEEP_MS]). */
  private audioClose: unknown = null
  private keepOn = false
  private started = false
  private disposed = false
  private readonly cleanups: (() => void)[] = []

  constructor(private readonly deps: Deps) {
    this.store = createStore<UiState>(initialState(deps.midi.supported(), deps.files.canPickFolder()))
    this.state = this.store.state
    this.settingsSignal = signal<AppSettings>(deps.settings.settings)
    this.settings = this.settingsSignal
    this.playing = deps.player.playing
    this.phase = computed(() => connectionPhase(this.state.value))
    this.trafficLog = deps.trafficLog
    const self = this
    this.coach = {
      get seen() {
        return deps.settings.settings.guideSeen || deps.coach.seen
      },
      markSeen: () => this.setGuideSeen(),
    }
    this.liveVoices = deps.liveAudio.voices
    this.playingPads = computed(() => {
      const out = new Set<number>()
      for (const k of this.liveVoices.value) {
        const p = k.split(':')
        if (p.length !== 3 || p[0] !== 'live') continue
        const g = Number(p[1])
        const o = Number(p[2])
        if (Number.isInteger(g) && Number.isInteger(o)) out.add(padKey({ group: g, offset: o }))
      }
      return out
    })
    this.playingNotes = computed(() => {
      const out = new Set<number>()
      for (const k of this.liveVoices.value) {
        if (!k.startsWith('note:')) continue
        const n = Number(k.slice(5))
        if (Number.isInteger(n)) out.add(n)
      }
      return out
    })
    const late = deps.liveAudio.late
    this.liveLate = late ?? this.slowMs
    this.liveEngine = deps.liveAudio.engine ?? signal(null)
    this.liveLatencyHint = deps.liveAudio.latencyHint ?? null
    this.visible = deps.visibility.visible()
    const toast = (text: string, error?: boolean): void => this.toast(text, error)
    this.tasks = new Tasks({ store: this.store, deps, toast, session: () => this.conn.session })
    this.conn = new Connection({
      store: this.store,
      deps,
      tasks: this.tasks,
      toast,
      onDropped: () => this.onDropped(),
    })
    this.live = new LiveSounds({
      store: this.store,
      deps,
      tasks: this.tasks,
      session: () => this.conn.session,
      mirror: () => this.mirror.current,
      names: () => this.names,
      playToken: () => this.playToken,
      toast,
      toastOnce: (text, error) => this.toastOnce(text, error),
    })
    this.liveLatency = this.live.latency
    this.store.update((s) => ({ ...s, keysPad: deps.mirrorPrefs.savedKeysPad() }))
    this.mirror = new MirrorController({
      store: this.store,
      prefs: deps.mirrorPrefs,
      tasks: this.tasks,
      session: () => this.conn.session,
      liveEvents: () => this.conn.liveEvents,
      perfNow: () => deps.perfNow(),
      setTimeout: (fn, ms) => deps.setTimeout(fn, ms),
      clearTimeout: (h) => deps.clearTimeout(h),
      requestFrame: deps.requestFrame,
      syncIndex: () => void this.syncIndex(),
      toast,
      live: this.live,
      fmtDateTime: (ms) => this.fmtDateTime(ms),
    })
  }

  // ---------- lifecycle (ArcController init, ArcApp.onCreate, MainActivity) ----------

  /**
   * What ArcController's init block runs: observe the library, sweep,
   * reconcile the folder (if its permission holds), index older backups,
   * and watch MIDI (connecting at once when permitted and autoConnect is
   * on). Also takes files from the launch queue. Resolves when all of that
   * has run once.
   */
  async start(): Promise<void> {
    if (this.started || this.disposed) return
    this.started = true
    const { deps } = this
    const lib = deps.library
    lib.settings = indexSettings(deps.settings, deps.mirrorPrefs)
    lib.onExternalError = (msg) => this.toast(WebText.copyFailed(msg), true)
    lib.live = () => this.live.lastReadJson()
    const audio = deps.liveAudio
    this.cleanups.push(audio.onStarted((id, ms, route, engine) => this.live.onStarted(id, ms, route, engine)))
    // Each output set up gets its row in the latency test, before its first press.
    if (audio.engine) {
      this.cleanups.push(
        audio.engine.subscribe((e) => {
          if (e) this.live.latencyOpened(e)
        }),
      )
    }
    if (audio.onSlowOutput) {
      this.cleanups.push(
        audio.onSlowOutput((ms) => {
          this.slowMs.value = Math.round(ms)
          this.live.slowOutput()
        }),
      )
    }
    if (audio.onLog) this.cleanups.push(audio.onLog((line) => this.trafficLog.note(line)))
    this.cleanups.push(lib.subscribe(() => void this.reloadLibrary()))
    this.cleanups.push(
      deps.settings.subscribe((s) => {
        this.settingsSignal.value = s
        this.syncKeepOn()
      }),
    )
    if (deps.onStorageChange) this.cleanups.push(deps.onStorageChange(() => deps.settings.reload()))
    // The guide's flag from before it joined the settings (and so library.json).
    if (!deps.settings.settings.guideSeen && deps.coach.seen) this.setGuideSeen()
    this.cleanups.push(deps.visibility.subscribe((v) => this.onVisibility(v)))
    // The page is going away (or into the back-forward cache): Live's output is let go now.
    if (deps.visibility.onPageHide) this.cleanups.push(deps.visibility.onPageHide(() => this.dropLiveAudio()))
    this.cleanups.push(
      this.store.subscribe(() => {
        this.syncKeepOn()
        this.syncMirror()
      }),
    )
    // A .pak opened with the installed app (the VIEW intent).
    deps.launchFiles((files) => void this.importFiles(files))
    await Promise.all([this.reloadLibrary(), this.maintenance(), this.conn.boot()])
  }

  /** Stops everything (page teardown, tests). */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const c of this.cleanups.splice(0)) c()
    this.mirror.stop()
    this.dropLiveAudio()
    this.conn.dispose()
    this.deps.player.stop()
    if (this.keepOn) {
      this.keepOn = false
      void this.deps.wakeLock.set(false).catch(() => undefined)
    }
  }

  private async maintenance(): Promise<void> {
    const lib = this.deps.library
    try {
      await lib.sweep()
    } catch {
      // Tried again next start.
    }
    // Whatever is missing from the library folder (a library from before it, or a
    // failed copy) goes there; only when the browser still allows the folder.
    let status: UiState['folderStatus'] = 'none'
    try {
      status = await lib.loadFolder()
      if (status === 'granted') await lib.reconcile()
    } catch {
      // The folder stays unused this session.
    }
    this.store.update((s) => ({ ...s, folderPicked: lib.folderPicked, folderStatus: status, folderName: lib.target?.name ?? null }))
    void lib.persist().catch(() => false)
    // Backups saved before search existed get their sound names indexed once.
    this.store.update((s) => ({ ...s, search: { ...s.search, indexing: true } }))
    try {
      await lib.indexMissing()
    } catch {
      // Damaged files are tried again next start.
    }
    this.store.update((s) => ({ ...s, search: { ...s.search, indexing: false } }))
  }

  /**
   * Live without a device shows the factory sounds once they are in the
   * library, and stops when they are deleted: it opens offline again.
   */
  private factoryChanged(): void {
    const st = this.store.get()
    const mi = st.mirror
    if (mi === null || (this.conn.session !== null && st.device !== null)) return
    const has = FactorySounds.inLibrary(st.backups) !== null
    if ((has && mi.error === MirrorText.NOT_CONNECTED) || (!has && mi.offline === MirrorText.FACTORY)) void this.mirror.openOffline()
  }

  /** library.backups collected: the list, the names for search, and the free space. */
  private async reloadLibrary(): Promise<void> {
    const gen = ++this.libraryGen
    const lib = this.deps.library
    try {
      const [list, names] = await Promise.all([lib.list(), lib.names()])
      let spaceLeft: number | null = null
      try {
        spaceLeft = await lib.estimate()
      } catch {
        spaceLeft = null
      }
      if (gen !== this.libraryGen || this.disposed) return
      this.names = names
      this.live.libraryChanged()
      this.store.update((s) => ({ ...s, backups: list, libraryLoaded: true, spaceLeft }))
      void this.runSearch()
      this.factoryChanged()
    } catch (e) {
      this.toast(Strings.libraryFailed(errorText(e)), true)
    }
  }

  /** combine(names, backups, query).collectLatest: only the latest search lands. */
  private async runSearch(): Promise<void> {
    const gen = ++this.searchGen
    await Promise.resolve()
    if (gen !== this.searchGen) return
    const st = this.store.get()
    const results = searchLibrary(this.names, st.backups, st.search.query)
    if (gen !== this.searchGen) return
    this.store.update((s) => ({ ...s, search: { ...s.search, results } }))
  }

  // ---------- view (MainActivity Root: tabs, live, keep-screen-on, lifecycle) ----------

  /**
   * selectTab's side effects: leaving Live closes the mirror and stops its
   * sounds, leaving Device stops playback (the UI also clears its pads
   * sheet), entering Device reads it.
   */
  tabChanged(prev: Tab, next: Tab): void {
    if (prev === next) return
    if (prev === 'live') {
      this.liveTab = false
      this.closeMirror()
      this.stopPlayback()
      // closeMirror leaves [mirrorWanted] alone; settle it now, even when no state changed.
      this.syncMirror()
      this.syncLiveAudio()
    } else if (prev === 'device') {
      this.stopPlayback()
    }
    if (next === 'device') void this.refreshBrowser()
    this.syncKeepOn()
  }

  /**
   * Whether the Live tab is in front (not under the debug, settings or guide
   * screen). The mirror runs while live, a device is ready and the tab is
   * visible; the screen stays on while live with keepScreenOn.
   */
  setLive(live: boolean): void {
    if (this.liveTab === live) return
    this.liveTab = live
    this.syncMirror()
    this.syncLiveAudio()
    this.syncKeepOn()
  }

  /** MainActivity.onStop: nothing keeps playing in the background; the mirror pauses, Live's output is suspended. */
  private onVisibility(visible: boolean): void {
    this.visible = visible
    if (!visible) this.stopPlayback()
    this.syncMirror()
    this.syncLiveAudio()
  }

  /**
   * LaunchedEffect(live, ready) + repeatOnLifecycle(STARTED): openMirror /
   * pauseMirror. The mirror runs while Live is in front, connected or not
   * (offline it shows the last read), and starts again when a device is
   * (re)connected or goes away.
   */
  private syncMirror(): void {
    if (this.disposed) return
    const wanted = this.liveTab && this.visible ? (this.store.get().device !== null ? 'ready' : 'offline') : null
    if (wanted === this.mirrorWanted) return
    this.mirrorWanted = wanted
    if (wanted !== null) void this.mirror.open()
    else this.mirror.pause()
  }

  /**
   * LaunchedEffect(live) + repeatOnLifecycle(STARTED): openLiveAudio /
   * closeLiveAudio. Web: away from Live (or hidden), the output is suspended
   * rather than closed, so coming back plays at once; it is let go after
   * [LIVE_AUDIO_KEEP_MS] away, or when the page goes.
   */
  private syncLiveAudio(): void {
    if (this.disposed) return
    const wanted = this.liveTab && this.visible
    if (wanted === this.audioWanted) return
    this.audioWanted = wanted
    this.cancelAudioClose()
    if (wanted) {
      void this.live.openAudio()
      return
    }
    this.live.suspendAudio()
    this.audioClose = this.deps.setTimeout(() => {
      this.audioClose = null
      if (!this.audioWanted) this.live.closeAudio()
    }, LIVE_AUDIO_KEEP_MS)
  }

  private cancelAudioClose(): void {
    if (this.audioClose === null) return
    this.deps.clearTimeout(this.audioClose)
    this.audioClose = null
  }

  /** Live's output let go at once (the page goes away, or the controller is disposed). */
  private dropLiveAudio(): void {
    this.cancelAudioClose()
    this.live.closeAudio()
    // Coming back (from the back-forward cache) opens it again.
    this.audioWanted = false
  }

  /** keepOn = task != null || (live && keepScreenOn). */
  private syncKeepOn(): void {
    if (this.disposed) return
    const on = keepScreenOn(this.store.get().task !== null, this.liveTab, this.settingsSignal.peek().keepScreenOn)
    if (on === this.keepOn) return
    this.keepOn = on
    void this.deps.wakeLock.set(on).catch(() => undefined)
  }

  // ---------- toast ----------

  toast(text: string, error = false): void {
    this.toastRun = null
    this.store.update((s) => ({ ...s, toast: { id: ++this.toastIds, text, error } }))
  }

  /** A toast, unless the same text is already showing (a slide over the keys presses many times). */
  toastOnce(text: string, error = false): void {
    if (this.store.get().toast?.text === text) return
    this.toast(text, error)
  }

  /** A toast with a key ([label], e.g. UNDO) that runs [run] once, if pressed before it goes. */
  private toastWith(text: string, label: string, run: () => void): void {
    const id = ++this.toastIds
    this.toastRun = { id, run }
    this.store.update((s) => ({ ...s, toast: { id, text, error: false, action: label } }))
  }

  /** The toast's key was pressed: runs what it offered and dismisses it. */
  runToastAction(id: number): void {
    const t = this.toastRun
    this.dismissToast(id)
    if (t === null || t.id !== id) return
    this.toastRun = null
    t.run()
  }

  dismissToast(id: number): void {
    if (this.toastRun?.id === id) this.toastRun = null
    this.store.update((s) => (s.toast?.id === id ? { ...s, toast: null } : s))
  }

  // ---------- device ----------

  /** Device description for the debug log export. */
  get midiDescription(): string {
    return this.conn.midiDescription
  }

  get isConnected(): boolean {
    return this.conn.session !== null
  }

  /** The Connect / Disconnect key. */
  connect(): Promise<void> {
    return this.conn.connect()
  }

  refreshDevice(): Promise<void> {
    return this.conn.refreshDevice()
  }

  /** dropSession's controller part (the session is already closed). */
  private onDropped(): void {
    this.mirror.stop()
    // Live shows the last read instead.
    if (this.store.get().mirror !== null) void this.mirror.openOffline()
    this.playToken++ // a device sound still downloading must not start after the device is gone
    if (this.deps.player.playing.peek()?.startsWith('device:') === true) this.deps.player.stop()
  }

  // ---------- long-running tasks ----------

  /** Runs a transfer (busy, progress sheet, cancel); null when busy or after an error (toasted). */
  runTask<T>(title: string, fn: (onProgress: OnProgress, signal: AbortSignal) => Promise<T>): Promise<T | null> {
    return this.tasks.runTask(title, fn)
  }

  /** Cancel stops between items, like the web version. */
  cancelTask(): void {
    this.tasks.cancelTask()
  }

  private fmtDate(ms: number): string {
    return formatDate(ms, DATE_TIME_PATTERN)
  }

  fmtDay(ms: number): string {
    return formatDate(ms, DAY_PATTERN)
  }

  fmtDateTime(ms: number): string {
    return this.fmtDate(ms)
  }

  async backup(): Promise<void> {
    const s = this.conn.session
    if (!s) return
    const saved = await this.tasks.runTask(Strings.BACKING_UP, async (onProgress, signal) => {
      const r = await backupDevice(s, { onProgress, signal, now: () => this.deps.now() })
      const d = describePak(await openPak(r.bytes))
      const dev = r.summary.device
      return this.deps.library.save(
        this.record(`Backup ${this.fmtDate(r.summary.createdAt)}`, r.summary.createdAt, 'device', null, BackupDevice(dev.product, dev.sku, dev.serial, dev.osVersion), d),
        r.bytes,
        d.soundNames,
      )
    })
    if (saved !== null) {
      this.store.update((st) => ({ ...st, freshId: saved.record.id }))
      this.toastSaved(Strings.saved(saved.record.soundCount, saved.record.projectCount) + (await this.pruneOld(saved.record.id)), saved.copyError)
    }
    await this.refreshAll(true) // refreshDevice().catch(() => {})
  }

  async restore(b: BackupRecord, sel: RestoreSelection): Promise<void> {
    const s = this.conn.session
    if (!s) return
    const done = await this.tasks.runTask(Strings.RESTORING, async (onProgress, signal) => {
      const bytes = await this.deps.library.bytes(b.id)
      const pak = await openPak(bytes)
      return restorePak(s, pak, { slots: sel.slots, projects: sel.projects, onProgress, signal })
    })
    if (done !== null) this.toast(Strings.restored(done.sounds, done.projects))
    await this.refreshAll(true)
  }

  // ---------- device browser, sample upload, compare (additions) ----------

  refreshBrowser(): Promise<void> {
    return this.refreshAll(false)
  }

  /**
   * Reads storage, sounds and projects once and updates both the device
   * panel and the browser, inside the busy guard.
   */
  private async refreshAll(quiet: boolean): Promise<void> {
    const c = await this.tasks.exclusive<DeviceContents>('contents', quiet, async (s) => {
      const c = await deviceContents(s)
      const info = s.info
      if (this.conn.session === s && info) {
        this.store.update((st) => ({ ...st, device: { info, storage: c.storage, sounds: c.sounds.length, projects: c.projects.length } }))
      }
      return c
    })
    if (c === null) return
    this.store.update((st) => {
      // Keep a slot's details only if the slot still holds the same sound;
      // project contents may have changed with any restore, so read them again.
      const before = new Map((st.browser.contents?.sounds ?? []).map((snd) => [snd.slot, snd]))
      const now = new Map(c.sounds.map((snd) => [snd.slot, snd]))
      const details = new Map([...st.browser.details].filter(([slot]) => sameSound(now.get(slot), before.get(slot))))
      return { ...st, browser: { ...st.browser, contents: c, details, projectSounds: new Map(), projectPads: new Map() } }
    })
    // Live's names and copies follow the fresh list (an upload, then onto a pad, needs the new sound's name).
    if (this.conn.session !== null) this.mirror.setSounds(this.conn.session, c.sounds)
  }

  async loadSoundDetails(slot: number): Promise<void> {
    const d = await this.tasks.exclusive(`slot:${slot}`, false, (s) => soundDetails(s, slot))
    if (d === null) return
    this.store.update((st) => ({ ...st, browser: { ...st.browser, details: new Map(st.browser.details).set(slot, d) } }))
  }

  async loadProjectSounds(project: number): Promise<void> {
    const layout = await this.tasks.exclusive(`project:${project}`, false, (s) => projectLayout(s, project))
    if (layout === null) return
    this.store.update((st) => ({
      ...st,
      browser: {
        ...st.browser,
        projectSounds: new Map(st.browser.projectSounds).set(project, layout.slots),
        projectPads: new Map(st.browser.projectPads).set(project, layout.pads),
      },
    }))
  }

  /** The sample picker (MainActivity samplesLauncher); call from a tap. */
  async pickSamples(): Promise<void> {
    const files = await this.deps.files.pick({ accept: WAV_ACCEPT, multiple: true })
    await this.pickForUpload(files)
  }

  /** Reads picked files and proposes a free slot for each. */
  async pickForUpload(files: readonly ReadableFile[]): Promise<void> {
    if (files.length === 0) return
    const occupied = this.store.get().browser.contents?.occupiedSlots ?? new Set<number>()
    const taken = new Set<number>()
    const items: UploadDraftItem[] = []
    for (const file of files) {
      const fileName = describeFile(file).name
      try {
        const bytes = await this.deps.files.read(file)
        const w = decodeWav(bytes) // fail early on files that are not usable WAVs
        const slot = nextFree(occupied, taken)
        if (slot !== null) taken.add(slot)
        items.push({ fileName, name: nameFor(fileName), slot, wav: bytes, error: null, trim: null, sampleRate: w.sampleRate })
      } catch (e) {
        items.push({ fileName, name: nameFor(fileName), slot: null, wav: null, error: errorText(e), trim: null, sampleRate: 0 })
      }
    }
    this.store.update((st) => ({ ...st, browser: { ...st.browser, draft: items } }))
  }

  setDraftSlot(index: number, slot: number | null): void {
    this.store.update((st) => {
      const d = st.browser.draft
      if (!d) return st
      return { ...st, browser: { ...st.browser, draft: d.map((item, i) => (i === index ? { ...item, slot } : item)) } }
    })
  }

  setDraftTrim(index: number, trim: TrimRange | null): void {
    this.store.update((st) => {
      const d = st.browser.draft
      if (!d) return st
      return { ...st, browser: { ...st.browser, draft: d.map((item, i) => (i === index ? { ...item, trim } : item)) } }
    })
  }

  dropDraft(): void {
    this.store.update((st) => ({ ...st, browser: { ...st.browser, draft: null, draftPad: null } }))
  }

  async uploadDraft(): Promise<void> {
    const s = this.conn.session
    if (!s) return
    const draft = this.store.get().browser.draft
    if (!draft) return
    const items = draft.flatMap((it) => (it.wav !== null && it.slot !== null ? [UploadItem(it.slot, it.name, it.wav, it.trim)] : []))
    if (items.length === 0) return
    const pad = this.store.get().browser.draftPad ?? null
    this.dropDraft()
    const done = await this.tasks.runTask(Strings.UPLOADING, (onProgress, signal) => upload(s, items, { onProgress, signal }))
    if (done !== null && pad === null) this.toast(Strings.uploaded(done.sounds))
    await this.refreshAll(true)
    // Live's EDIT: the new sound onto its pad (the device's list is fresh, so the toast names it).
    if (done !== null && pad !== null) {
      const t = this.editTarget(pad)
      if (t === null) return
      const slot = items[0]!.slot
      const r = await this.writePad(t, slot)
      if (r === null) return
      if (r.error !== null) this.toast(MirrorText.assignFailed(r.error), true)
      else this.padAssigned(pad, t, slot)
    }
  }

  /** Compares the backup with the device for this selection; the result shows in the restore sheet. */
  async compare(b: BackupRecord, sel: RestoreSelection): Promise<void> {
    const s = this.conn.session
    if (!s) return
    const result = await this.tasks.runTask(Strings.COMPARING, async (onProgress, signal) => {
      const bytes = await this.deps.library.bytes(b.id)
      const pak = await openPak(bytes)
      return compareWithDevice(s, pak, { slots: sel.slots, projects: sel.projects, onProgress, signal })
    })
    if (result !== null) this.store.update((st) => ({ ...st, diff: { backupId: b.id, selection: sel, result } }))
  }

  clearDiff(): void {
    this.store.update((st) => ({ ...st, diff: null }))
  }

  // ---------- playback ----------

  /**
   * Plays a sound of the device: Live's sample in memory, else arc's current
   * copy, else downloaded from the device (played first, then kept for Live).
   * Call from a tap.
   */
  async playDeviceSound(slot: number): Promise<void> {
    this.deps.player.resumeInGesture()
    const token = ++this.playToken
    const listed = this.store.get().browser.contents?.sounds.find((snd) => snd.slot === slot) ?? this.live.deviceSound(slot)
    // Already held here: no device needed.
    const held = listed === undefined ? null : await this.heldSound(slot, listed)
    if (token !== this.playToken) return
    if (held !== null) {
      await this.startSound(`device:${slot}`, held.pcm, held.channels, held.sampleRate)
      return
    }
    // Played straight from the list: read the channels and rate first when they aren't known yet.
    let d = this.store.get().browser.details.get(slot) ?? null
    if (d === null) {
      d = await this.tasks.exclusive(`play:${slot}`, false, (s) => soundDetails(s, slot))
      if (d !== null) {
        const got = d
        this.store.update((st) => ({ ...st, browser: { ...st.browser, details: new Map(st.browser.details).set(slot, got) } }))
      }
    }
    if (d === null) return
    if (token !== this.playToken) return
    // Not cancelled on stop: an interrupted download would leave the session out of step.
    const pcm = await this.tasks.exclusive(`play:${slot}`, false, (s) => download(s, slot))
    if (pcm === null) return
    // It plays first; then it is kept, so Live (and the next Play) has it without the device.
    const playing = token === this.playToken ? this.startSound(`device:${slot}`, pcm, Math.trunc(d.channels), Math.trunc(d.sampleRate)) : null
    const kept = this.store.get().browser.contents?.sounds.find((snd) => snd.slot === slot) ?? this.live.deviceSound(slot)
    if (kept !== undefined) void this.live.keepPadSound(slot, kept.name, kept.size, pcm, d.channels, d.sampleRate)
    await playing
  }

  /** A device sound held here, newest first: Live's sample in memory, else arc's copy while it is current. */
  private async heldSound(slot: number, e: SoundEntry): Promise<DecodedSound | null> {
    const mem = this.live.memorySound(slot, e.name)
    if (mem !== null) return mem
    const key = `${PAD_PREVIEW}${slot}:${e.size}:${e.name}`
    const hit = this.previews.get(key)
    if (hit !== null) return hit
    const wav = await this.live.currentCopy(slot, e.name, e.size)
    if (wav === null) return null
    let d: DecodedSound
    try {
      const w = decodeWav(wav)
      d = { pcm: w.pcm, channels: w.channels, sampleRate: Math.trunc(w.sampleRate) }
    } catch {
      // A copy that doesn't read: the device has the sound.
      return null
    }
    this.previews.put(key, d)
    return d
  }

  /**
   * Plays and says so when nothing will be heard. Where the sound went is
   * noted in the debug log.
   */
  private async startSound(key: string, pcm: Uint8Array, channels: number, sampleRate: number): Promise<void> {
    const r = await this.deps.player.play(key, pcm, channels, sampleRate)
    if (r.kind === 'failed') {
      this.trafficLog.note(`play ${key} failed: ${r.reason}`)
      this.toast(FeatureText.cantPlay(r.reason), true)
    } else {
      const secs = pcm.length / (2 * channels) / sampleRate
      this.trafficLog.note(FeatureText.playNote(key, sampleRate, channels, secs, r.route))
      if (this.deps.player.volumeOff()) this.toast(FeatureText.VOLUME_OFF)
    }
  }

  stopPlayback(): void {
    this.playToken++
    this.live.stopAll()
    this.deps.player.stop()
  }

  /** Plays PCM that is already in memory (the trim preview). Call from a tap. */
  playNow(key: string, pcm: Uint8Array, channels: number, sampleRate: number): Promise<void> {
    this.deps.player.resumeInGesture()
    this.playToken++
    return this.startSound(key, pcm, channels, sampleRate)
  }

  // ---------- backup contents (additions) ----------

  async openContents(b: BackupRecord): Promise<void> {
    const cur = this.store.get().contents
    if (cur?.backupId === b.id && cur.pak !== null) return
    this.store.update((st) => ({ ...st, contents: { backupId: b.id, pak: null, error: null, durations: new Map() } }))
    let next: UiState['contents']
    try {
      const bytes = await this.deps.library.bytes(b.id)
      const pak = await openPak(bytes)
      const durations = new Map<number, number>()
      for (const [slot, snd] of pak.sounds) {
        let w
        try {
          w = decodeWav(snd.wav)
        } catch {
          continue
        }
        durations.set(slot, seconds(frames(w.pcm, w.channels), w.sampleRate))
      }
      next = { backupId: b.id, pak, error: null, durations }
    } catch (e) {
      next = { backupId: b.id, pak: null, error: errorText(e), durations: new Map() }
    }
    this.store.update((st) => (st.contents?.backupId !== b.id ? st : { ...st, contents: next }))
  }

  closeContents(): void {
    this.stopPlayback()
    this.store.update((st) => ({ ...st, contents: null }))
  }

  /** Plays a sound from an opened backup; no device needed. Call from a tap. */
  async playBackupSound(slot: number): Promise<void> {
    this.deps.player.resumeInGesture()
    const token = ++this.playToken
    const c = this.store.get().contents
    if (!c) return
    const snd = c.pak?.sounds.get(slot)
    if (!snd) return
    const key = `backup:${c.backupId}:${slot}`
    try {
      // Decoded once: playing it again starts at once.
      let d = this.previews.get(key)
      if (d === null) {
        const w = decodeWav(snd.wav)
        d = { pcm: w.pcm, channels: w.channels, sampleRate: w.sampleRate }
        this.previews.put(key, d)
      }
      await Promise.resolve()
      if (token !== this.playToken || this.store.get().contents?.backupId !== c.backupId) return
      await this.startSound(key, d.pcm, d.channels, d.sampleRate)
    } catch (e) {
      this.toast(errorText(e), true)
    }
  }

  /** Compares two saved backups, the older one as the starting point (an addition). */
  async compareBackups(a: BackupRecord, b: BackupRecord): Promise<void> {
    const [old, next] = b.createdAt < a.createdAt ? [b, a] : [a, b]
    const current = this.store.get().pakCompare
    if (current && current.oldId === old.id && current.newId === next.id && (current.result !== null || current.error === null)) return
    const empty = { oldId: old.id, newId: next.id, result: null, oldNames: new Map<number, string>(), newNames: new Map<number, string>(), error: null }
    this.store.update((st) => ({ ...st, pakCompare: empty }))
    let ui: NonNullable<UiState['pakCompare']>
    try {
      const oldBytes = await this.deps.library.bytes(old.id)
      const newBytes = await this.deps.library.bytes(next.id)
      const o = await openPak(oldBytes)
      const n = await openPak(newBytes)
      const names = (snds: ReadonlyMap<number, PakSound>): Map<number, string> => new Map([...snds].map(([k, v]) => [k, v.name]))
      ui = { ...empty, result: comparePaks(o, n), oldNames: names(o.sounds), newNames: names(n.sounds) }
    } catch (e) {
      ui = { ...empty, error: errorText(e) }
    }
    this.store.update((st) => {
      const c = st.pakCompare
      return !c || c.oldId !== old.id || c.newId !== next.id ? st : { ...st, pakCompare: ui }
    })
  }

  closeCompare(): void {
    this.store.update((st) => ({ ...st, pakCompare: null }))
  }

  /** The bytes to export: "wav:N" (a sound's WAV) or "project:N" (a project as a .pak). */
  async exportBytes(backupId: string, what: string): Promise<Uint8Array> {
    // The open contents screen already holds the parsed backup.
    const c = this.store.get().contents
    const pak = c?.backupId === backupId && c.pak ? c.pak : await openPak(await this.deps.library.bytes(backupId))
    if (what.startsWith('wav:')) return soundWav(pak, toInt(what.slice(4)))
    if (what.startsWith('project:')) return exportProject(pak, toInt(what.slice(8)), this.deps.now())
    throw new Error(what)
  }

  // ---------- live mirror (an addition) ----------

  // These three leave [mirrorWanted] (what syncMirror last decided) alone:
  // changing it here made the next state change undo the call (openMirror
  // outside Live was paused at once, pauseMirror/closeMirror in Live reopened).

  /** Starts the mirror for the current connection (or shows "not connected"). */
  openMirror(): Promise<void> {
    return this.mirror.open()
  }

  /** Stops listening (background); the screen keeps its last state. */
  pauseMirror(): void {
    this.mirror.pause()
  }

  closeMirror(): void {
    this.mirror.close()
  }

  /** The sample on a pad in the mirror, once it is known. */
  mirrorName(pad: { readonly group: number; readonly offset: number }): string | null {
    return this.mirror.mirrorName(pad)
  }

  setPadOrder(order: PadOrder): void {
    this.mirror.setPadOrder(order)
  }

  /** The pad order Live uses (for the settings page). */
  padOrder(): PadOrder {
    return this.mirror.padOrder()
  }

  /** Forgets which pad is which in Live (names are learned again as pads are pressed). */
  forgetLearned(): void {
    this.mirror.forgetLearned()
  }

  /** Opens Live's sound output (Live came on screen); driven by [setLive] / [tabChanged]. */
  openLiveAudio(): Promise<void> {
    return this.live.openAudio()
  }

  /** Closes it (Live left the screen); driven by [setLive] / [tabChanged]. */
  closeLiveAudio(): void {
    this.live.closeAudio()
  }

  /**
   * Plays a Live pad's sample on the phone (arc's copy, else the newest
   * backup holding it, else, connected, the device) alongside whatever else
   * sounds, until [releasePad]; [hold] false (a screen reader's Play) plays
   * it to the end. The pad also becomes the KEYS sound. Call from the press.
   * [unsure]: a press on the scrolling page, settled by [keepPad] or [cutPad].
   * [at]: the press's event timeStamp, for the latency note.
   */
  playPad(pad: PhysicalPad, hold = true, unsure = false, at?: number): Promise<void> {
    return this.live.playPad(pad, hold, unsure, at)
  }

  /** The unsure press on the pad was a press after all: it becomes the KEYS sound (and one not in memory loads). */
  keepPad(pad: PhysicalPad): Promise<void> {
    return this.live.keepPad(pad)
  }

  /** The finger left the pad: its sound fades out. */
  releasePad(pad: PhysicalPad): void {
    this.live.releasePad(pad)
  }

  /** The press on the pad turned into a scroll (the all-groups page): its sound ends at once. */
  cutPad(pad: PhysicalPad): void {
    this.live.cutPad(pad)
  }

  /** The sound KEYS plays: the pad last tapped, or last played on the device in the pads view. */
  selectKeysPad(pad: PhysicalPad): void {
    this.live.selectKeysPad(pad)
  }

  /** Plays MIDI [note] on the KEYS sound (a grid key or a piano key) until [releaseNote]; [hold] false plays to the end. Call from the press ([at]: its timeStamp). */
  playNote(note: number, hold = true, at?: number): Promise<void> {
    return this.live.playNote(note, hold, at)
  }

  /** The debug screen's latencyHint choice: Live's output reopens at the new hint. */
  setLiveLatencyHint(choice: WebLatencyHint): void {
    this.deps.liveAudio.setLatencyHint?.(choice)
  }

  /** The latency test's Reset: every engine's times go (the engines tried keep their rows). */
  resetLatency(): void {
    this.live.resetLatency()
  }

  /** The last finger left the note: it fades out. */
  releaseNote(note: number): void {
    this.live.releaseNote(note)
  }

  // ---------- Live's EDIT: another sound on a pad (an addition, see device.assignPad) ----------

  /**
   * The device's sounds as Live knows them, by slot: the Device tab's list
   * when it has been read, else the one Live's own read made. For the pad
   * sheet and the Sounds tab.
   */
  liveSounds(): readonly SoundEntry[] {
    return this.store.get().browser.contents?.sounds ?? this.live.deviceSoundList()
  }

  /**
   * The name of the sound on [pad] now, as its pad record says (the mirror's
   * own name for it waits for a learned link); null when unknown or empty.
   */
  padSoundName(pad: PhysicalPad): string | null {
    const slot = this.editTarget(pad, true)?.slot ?? null
    return slot === null ? null : this.soundName(slot)
  }

  /** A device sound's name for a toast: its name, else its slot number. */
  private soundName(slot: number): string {
    return this.liveSounds().find((snd) => snd.slot === slot)?.name ?? FeatureText.slot(slot)
  }

  /**
   * Where [pad]'s sound is set now (its project, pad file and slot), or
   * null, saying why, when it can't be changed: not connected, or the
   * active project not read yet.
   */
  editTarget(pad: PhysicalPad, quiet = false): PadTarget | null {
    if (this.conn.session === null || this.store.get().device === null) {
      if (!quiet) this.toast(MirrorText.EDIT_OFFLINE)
      return null
    }
    const m = this.mirror.current
    const t = m?.target(pad) ?? null
    if (t === null && !quiet) {
      // A known project but no pad number: the device numbers its pads otherwise than arc guessed.
      const unknownPad = m != null && m.snapshot(this.deps.perfNow()).activeProject !== null && m.padNumber(pad) === null
      this.toast(unknownPad ? MirrorText.EDIT_PRESS_FIRST : MirrorText.EDIT_NO_PROJECT)
    }
    return t
  }

  /** Writes [slot] onto [t]'s pad; the error text, null when done (or nothing was written: busy). */
  private async writePad(t: PadTarget, slot: number): Promise<{ error: string | null } | null> {
    return this.tasks.exclusive('assign', true, async (s) => {
      try {
        await writePadSound(s, t.project, t.group, t.pad, slot)
        return { error: null }
      } catch (e) {
        return { error: errorText(e) }
      }
    })
  }

  /**
   * Puts device sound [slot] on Live's [pad] in the active project, at
   * once: the mirror's names follow, and the toast offers UNDO (when the
   * sound it had is known). Resolves true when the pad took it.
   */
  async assignPad(pad: PhysicalPad, slot: number): Promise<boolean> {
    const t = this.editTarget(pad)
    if (t === null) return false
    if (t.slot === slot) return true
    const r = await this.writePad(t, slot)
    if (r === null) return false
    if (r.error !== null) {
      this.toast(MirrorText.assignFailed(r.error), true)
      return false
    }
    this.padAssigned(pad, t, slot)
    return true
  }

  /** [pad] took [slot] (its target was [t]): names follow, and a toast with UNDO when the old sound is known. */
  private padAssigned(pad: PhysicalPad, t: PadTarget, slot: number): void {
    this.mirror.assigned(t, slot)
    const text = MirrorText.assigned(pad, this.soundName(slot))
    const old = t.slot
    // An empty or unrecorded pad has no sound to put back.
    if (old === null) {
      this.toast(text)
      return
    }
    this.toastWith(text, MirrorText.UNDO, () => void this.undoAssign(pad, { ...t, slot }, old))
  }

  /** UNDO: [old] back onto the pad [now] describes. */
  private async undoAssign(pad: PhysicalPad, now: PadTarget, old: number): Promise<void> {
    const r = await this.writePad(now, old)
    if (r === null) return
    if (r.error !== null) {
      this.toast(MirrorText.undoFailed(r.error), true)
      return
    }
    this.mirror.assigned(now, old)
    this.toast(MirrorText.restored(pad, this.soundName(old)))
  }

  /**
   * EDIT's "Upload a new sample…" (or a WAV dropped on a pad): the file goes
   * into the upload sheet as for the Device tab (a free slot, Trim), and
   * once uploaded onto [pad]. Only the first file is used.
   */
  async uploadForPad(pad: PhysicalPad, files: readonly ReadableFile[]): Promise<void> {
    if (files.length === 0 || this.editTarget(pad) === null) return
    // The free slots come from the device's list: read it first if the Device tab hasn't.
    if (this.store.get().browser.contents === null) await this.refreshAll(true)
    if (this.store.get().browser.contents === null) return
    await this.pickForUpload(files.slice(0, 1))
    this.store.update((st) => (st.browser.draft ? { ...st, browser: { ...st.browser, draftPad: pad } } : st))
  }

  /**
   * WAVs dropped on Live's Sounds tab: the upload sheet, as for the Device
   * tab's Add (the free slots come from the device's list, read first if needed).
   */
  async dropSamples(files: readonly ReadableFile[]): Promise<void> {
    if (files.length === 0) return
    if (this.conn.session === null || this.store.get().device === null) {
      this.toast(MirrorText.EDIT_OFFLINE)
      return
    }
    if (this.store.get().browser.contents === null) await this.refreshAll(true)
    if (this.store.get().browser.contents === null) return
    await this.pickForUpload(files)
  }

  /** The picker for [uploadForPad]; call from a tap. */
  async pickForPad(pad: PhysicalPad): Promise<void> {
    if (this.editTarget(pad) === null) return
    const files = await this.deps.files.pick({ accept: WAV_ACCEPT, multiple: false })
    await this.uploadForPad(pad, files)
  }

  /** Space taken by Live's copies of the device's sounds, in bytes (for Settings). */
  padSoundsSize(): Promise<number> {
    return this.live.padSoundsSize()
  }

  /** Clears Live's copies of the device's sounds (Settings). */
  clearPadSounds(): Promise<void> {
    this.previews.clear(PAD_PREVIEW)
    return this.live.clearPadSounds()
  }

  // ---------- library folder ----------

  /**
   * Brings the library back from a folder (a library folder from another
   * browser, or the Android app's Documents/arc). Settings kept there return
   * too. A writable folder becomes the library folder, and the library is
   * copied into it.
   */
  async restoreFromFolder(target: ExternalTarget): Promise<void> {
    const lib = this.deps.library
    try {
      const { count, settings, live } = await lib.restoreFrom(target, (bytes) => describeForRestore(bytes, () => this.deps.now()))
      // Pads learned since the reinstall stay (the folder's fill in the rest), as does a pad order chosen since.
      this.deps.mirrorPrefs.fromIndex(settings)
      this.deps.settings.fromIndex(settings)
      await this.live.restoreLastRead(live)
      // library.json was rewritten before these were applied: write them into it now.
      await this.syncIndex()
      // Its own failure must not hide that the restore worked.
      if (!target.readOnly && lib.target === target) await this.reconcile()
      this.store.update((s) => ({ ...s, folderPicked: lib.folderPicked, folderStatus: lib.target ? 'granted' : s.folderStatus, folderName: lib.target?.name ?? null }))
      this.toast(count === 0 ? FeatureText.NOTHING_TO_RESTORE : FeatureText.restored(count))
    } catch (e) {
      const msg = errorText(e)
      this.toast(msg === FeatureText.PICK_ARC_FOLDER ? WebText.PICK_ARC_FOLDER : msg, true)
    }
  }

  /**
   * The folder picker (MainActivity folderLauncher); call from a tap. Picks
   * a writable folder where the browser can, else a read-only one through
   * <input webkitdirectory>, then restores from it.
   */
  async pickFolder(): Promise<void> {
    const { files } = this.deps
    let target: ExternalTarget | null
    try {
      if (files.canPickFolder()) {
        target = await files.pickFolder()
      } else {
        const picked = await files.pick({ directory: true, multiple: true })
        target = picked.length === 0 ? null : new FileListTarget(picked)
      }
    } catch (e) {
      this.toast(errorText(e), true)
      return
    }
    if (target) await this.restoreFromFolder(target)
  }

  /** From the "Reconnect library folder" tap: asks again for the remembered folder, then catches it up. */
  async reconnectFolder(): Promise<void> {
    const lib = this.deps.library
    let status: UiState['folderStatus']
    try {
      status = await lib.reconnectFolder()
    } catch (e) {
      this.toast(errorText(e), true)
      return
    }
    this.store.update((s) => ({ ...s, folderStatus: status, folderPicked: lib.folderPicked, folderName: lib.target?.name ?? null }))
    if (status === 'granted') await this.reconcile()
  }

  /** runCatching { library.reconcile() }: a failed catch-up is tried again next start. */
  private async reconcile(): Promise<void> {
    try {
      await this.deps.library.reconcile()
    } catch {
      // Copy errors are reported through onExternalError; a database error waits for the next start.
    }
  }

  /** "Export library": every .pak plus library.json as one zip (browsers without a folder picker). */
  async exportLibrary(): Promise<void> {
    try {
      const zip = await this.deps.library.exportZip()
      await this.deps.files.save(LIBRARY_ZIP, zip, 'application/zip')
    } catch (e) {
      this.toast(errorText(e), true)
    }
  }

  setSearch(query: string): void {
    // The field shows what was typed at once; results follow.
    this.store.update((s) => ({ ...s, search: { ...s.search, query } }))
    void this.runSearch()
  }

  // ---------- library ----------

  private record(title: string, createdAt: number, source: string, fileName: string | null, device: BackupDevice, d: PakDescription): BackupRecord {
    return {
      id: '',
      title,
      notes: '',
      createdAt,
      source,
      fileName,
      device,
      soundCount: d.soundCount,
      projectCount: d.projectCount,
      projects: d.projects,
      slots: d.slots,
      projectSlots: d.projectSlots,
      size: 0,
    }
  }

  /** The import picker (MainActivity importLauncher); call from a tap. */
  async pickImport(): Promise<void> {
    const files = await this.deps.files.pick({ accept: PAK_ACCEPT })
    await this.importFiles(files)
  }

  /** Imports files one after the other (picker, drop, launch queue). */
  async importFiles(files: readonly ReadableFile[]): Promise<void> {
    for (const f of files) await this.importFile(f)
  }

  /** importUri: a picked, dropped or launched file. */
  importFile(file: ReadableFile): Promise<void> {
    const { name, lastModified } = describeFile(file)
    return this.import(name, lastModified, () => this.deps.files.read(file))
  }

  /** Import a .pak (from the picker, or opened with the app). */
  async import(name: string, lastModified: number | null, read: () => Promise<Uint8Array>): Promise<void> {
    try {
      const bytes = await read()
      const d = describePak(await openPak(bytes))
      const saved = await this.deps.library.save(
        this.record(
          importTitle(name),
          // generatedAt || file.lastModified || Date.now()
          d.generatedAt ?? (lastModified !== null && lastModified !== 0 ? lastModified : this.deps.now()),
          'import',
          name,
          BackupDevice(d.device.product, d.device.sku, '', d.device.osVersion),
          d,
        ),
        bytes,
        d.soundNames,
      )
      this.store.update((st) => ({ ...st, freshId: saved.record.id }))
      this.toastSaved(Strings.imported(saved.record.soundCount, saved.record.projectCount) + (await this.pruneOld(saved.record.id)), saved.copyError)
    } catch (e) {
      this.toast(Strings.importFailed(name, errorText(e)), true)
    }
  }

  /** Whether the factory sounds can be downloaded here (FactorySounds). */
  get canGetFactory(): boolean {
    return this.deps.factory !== undefined
  }

  /**
   * Downloads the EP-133's factory sounds from teenage engineering's EP
   * Sample Tool and keeps them in the library (FactorySounds), as a task:
   * the progress sheet shows how much has come, and Cancel stops it.
   */
  async getFactorySounds(): Promise<void> {
    const net = this.deps.factory
    if (net === undefined || FactorySounds.inLibrary(this.store.get().backups) !== null) return
    // Tapped while something else runs (a read as the page starts, a transfer): it goes next, not never.
    if (this.store.get().busy) await this.store.waitFor((st) => !st.busy)
    if (FactorySounds.inLibrary(this.store.get().backups) !== null) return
    const saved = await this.tasks.runTask(FeatureText.GETTING_FACTORY, async (onProgress, signal) => {
      try {
        const path = await FactorySounds.locate((p) => net.text(p, signal))
        const bytes = await net.bytes(path, signal, (done, total) => {
          const all = Math.max(total ?? FactorySounds.KNOWN_SIZE, done)
          onProgress({ fraction: done / all, label: FeatureText.factoryProgress(done, all) })
        })
        const pak = await openPak(bytes)
        if (!FactorySounds.isFactory(pak)) throw new Error(FeatureText.NOT_FACTORY)
        const d = describePak(pak)
        return await this.deps.library.save(
          this.record(
            FeatureText.FACTORY_TITLE,
            d.generatedAt ?? this.deps.now(),
            FactorySounds.SOURCE,
            FactorySounds.FILE_NAME,
            BackupDevice(d.device.product, d.device.sku, '', d.device.osVersion),
            d,
          ),
          bytes,
          d.soundNames,
        )
      } catch (e) {
        if (signal.aborted || isCancelled(e)) throw new CancelledError()
        throw new Error(FeatureText.factoryFailed(errorText(e)))
      }
    }, { device: false })
    if (saved === null) return
    this.store.update((st) => ({ ...st, freshId: saved.record.id }))
    this.toastSaved(FeatureText.factorySaved(saved.record.soundCount), saved.copyError)
  }

  /** Saves edits made in the detail sheet (saveDetailEdits). */
  async saveEdits(b: BackupRecord, titleField: string, notes: string): Promise<void> {
    const trimmed = ktTrim(titleField)
    const title = trimmed.length !== 0 ? trimmed : b.title
    if (title === b.title && notes === b.notes) return
    try {
      await this.deps.library.update(b.id, title, notes)
    } catch (e) {
      this.toast(errorText(e), true)
    }
  }

  /** Returns whether it worked; on failure the detail sheet stays open. */
  async delete(b: BackupRecord): Promise<boolean> {
    try {
      const copyError = await this.deps.library.delete(b.id)
      this.toastSaved(Strings.BACKUP_DELETED, copyError)
      return true
    } catch (e) {
      this.toast(errorText(e), true)
      return false
    }
  }

  /**
   * Deletes the oldest backups beyond the Keep setting (never [keepId], the
   * one just saved). Returns " Removed N old backups." for the toast, or "".
   */
  private async pruneOld(keepId: string | null = null): Promise<string> {
    const keep = this.deps.settings.settings.keepLast
    if (keep === null) return ''
    let removed: number
    try {
      removed = await this.deps.library.prune(keep, keepId)
    } catch {
      // The library could not be listed: nothing pruned now (the next save
      // tries again); the save's own toast still shows.
      return ''
    }
    return removed > 0 ? ' ' + SettingsText.pruned(removed) : ''
  }

  setTheme(t: ThemeChoice): void {
    this.changeSettings((s) => ({ ...s, theme: t }))
  }

  setAutoConnect(on: boolean): void {
    this.changeSettings((s) => ({ ...s, autoConnect: on }))
  }

  setKeepScreenOn(on: boolean): void {
    this.changeSettings((s) => ({ ...s, keepScreenOn: on }))
  }

  setLiveOneGroup(on: boolean): void {
    this.changeSettings((s) => ({ ...s, liveOneGroup: on }))
  }

  setLiveFollow(on: boolean): void {
    this.changeSettings((s) => ({ ...s, liveFollow: on }))
  }

  /** Live plays the keys (one sound as notes) instead of the pads. */
  setLiveKeys(on: boolean): void {
    this.changeSettings((s) => ({ ...s, liveKeys: on }))
  }

  /** KEYS' key, 0 (DO / C) to 11. */
  setKeysRoot(root: number): void {
    this.changeSettings((s) => ({ ...s, keysRoot: coerceIn(Math.trunc(root), 0, 11) }))
  }

  setKeysScale(scale: Scale): void {
    this.changeSettings((s) => ({ ...s, keysScale: scale }))
  }

  /** KEYS' octave, MIN_OCTAVE (0) to MAX_OCTAVE (8). */
  setKeysOctave(octave: number): void {
    this.changeSettings((s) => ({ ...s, keysOctave: coerceIn(Math.trunc(octave), MIN_OCTAVE, MAX_OCTAVE) }))
  }

  /** How KEYS names its notes (Settings → Live → Note names). */
  setKeysNames(names: NoteNames): void {
    this.changeSettings((s) => ({ ...s, keysNames: names }))
  }

  setKeysShowNames(on: boolean): void {
    this.changeSettings((s) => ({ ...s, keysShowNames: on }))
  }

  /** KEYS on the pads or the piano, remembered for a wide window ([wide]) and for a tall one. */
  setKeysView(wide: boolean, view: KeysView): void {
    this.changeSettings((s) => (wide ? { ...s, keysViewWide: view } : { ...s, keysViewTall: view }))
  }

  /** Live's piano size (Settings → Live → Piano keys): white keys, null for Auto (as many as fit). */
  setPianoWhites(whites: number | null): void {
    this.changeSettings((s) => ({ ...s, pianoWhites: pianoChoiceOf(whites) }))
  }

  /** A light tick when a pad or key goes down (Settings → Live → Haptics). */
  setHaptics(on: boolean): void {
    this.changeSettings((s) => ({ ...s, haptics: on }))
  }

  /** The guide overlay was shown (it opens by itself only once, also across reinstalls). */
  setGuideSeen(): void {
    this.changeSettings((s) => ({ ...s, guideSeen: true }))
  }

  /** How many backups [setKeepLast] would delete now, for the confirmation. */
  pruneCount(keep: number | null): number {
    return toPrune(this.store.get().backups, keep).length
  }

  /** Sets how many backups to keep and deletes the older ones now (after the page confirmed). */
  async setKeepLast(keep: number | null): Promise<void> {
    this.changeSettings((s) => ({ ...s, keepLast: keep }))
    const note = await this.pruneOld()
    if (note.length !== 0) this.toast(ktTrim(note))
  }

  private changeSettings(change: (s: AppSettings) => AppSettings): void {
    const before = this.deps.settings.settings
    // Only a change is written (and copied to library.json).
    if (this.deps.settings.update(change) === before) return
    void this.syncIndex()
  }

  private async syncIndex(): Promise<void> {
    try {
      await this.deps.library.syncIndex()
    } catch {
      // Reported through onExternalError.
    }
  }

  /** One toast for the result, so a failed copy to the library folder is not hidden behind it. */
  private toastSaved(text: string, copyError: string | null): void {
    if (copyError === null) this.toast(text)
    else this.toast(text + ' ' + WebText.copyFailed(copyError), true)
  }

  pakBytes(b: BackupRecord): Promise<Uint8Array> {
    return this.deps.library.bytes(b.id)
  }

  pakBlob(b: BackupRecord): Promise<Blob> {
    return this.deps.library.blob(b.id)
  }

  // ---------- save and share (MainActivity) ----------

  /**
   * Saves a file; a failure is toasted. Call from a tap (the save picker needs it).
   * The bytes are read before the picker opens: Android deletes the document it
   * created when they can't be read (savePak checks the file first), and the web
   * can't remove the empty file a save picker already made.
   */
  private async saveFile(name: string, data: FileData, mime: string): Promise<void> {
    try {
      const ready = typeof data === 'function' ? await data() : data
      await this.deps.files.save(name, ready, mime)
    } catch (e) {
      this.toast(errorText(e), true)
    }
  }

  /** Shares [read]'s bytes as a file named [name]; falls back to saving (and says so). */
  private async shareBytes(name: string, mime: string, title: string, read: FileData, text?: string): Promise<void> {
    try {
      const r = await this.deps.share.share(name, read, mime, title, text)
      if (r === 'saved') this.toast(WebText.savedInstead(name))
    } catch (e) {
      this.toast(errorText(e) || Strings.SHARE_FAILED, true)
    }
  }

  savePak(b: BackupRecord): Promise<void> {
    return this.saveFile(fileNameFor(b.title), () => this.deps.library.blob(b.id), PAK_SAVE_MIME)
  }

  sharePak(b: BackupRecord): Promise<void> {
    return this.shareBytes(fileNameFor(b.title), PAK_SHARE_MIME, b.title, () => this.deps.library.blob(b.id))
  }

  saveWav(b: BackupRecord, snd: PakSound): Promise<void> {
    return this.saveFile(soundFileName(snd), () => this.exportBytes(b.id, `wav:${snd.slot}`), WAV_MIME)
  }

  shareWav(b: BackupRecord, snd: PakSound): Promise<void> {
    const name = soundFileName(snd)
    return this.shareBytes(name, WAV_MIME, name, () => this.exportBytes(b.id, `wav:${snd.slot}`))
  }

  saveProject(b: BackupRecord, n: number): Promise<void> {
    return this.saveFile(projectFileName(fileNameFor(b.title), n), () => this.exportBytes(b.id, `project:${n}`), PAK_SAVE_MIME)
  }

  shareProject(b: BackupRecord, n: number): Promise<void> {
    const name = projectFileName(fileNameFor(b.title), n)
    return this.shareBytes(name, PAK_SHARE_MIME, name, () => this.exportBytes(b.id, `project:${n}`))
  }

  /** The SysEx log with its header (MainActivity.logText). */
  logText(): string {
    return this.trafficLog.export(WebText.logHeader(APP_BUILD, this.deps.userAgent, this.conn.midiDescription, this.deps.now()))
  }

  logFileName(): string {
    return logFileName(this.deps.now())
  }

  saveLog(): Promise<void> {
    return this.saveFile(this.logFileName(), new TextEncoder().encode(this.logText()), TEXT_MIME)
  }

  shareLog(): Promise<void> {
    const text = this.logText()
    return this.shareBytes(this.logFileName(), TEXT_MIME, Strings.DEBUG_TITLE, new TextEncoder().encode(text), Strings.DEBUG_TITLE)
  }

  /** Copies the latest part of the log (MainActivity.copyLog's COPY_LIMIT). */
  async copyLog(): Promise<void> {
    const full = this.logText()
    const text = full.length <= COPY_LIMIT ? full : Strings.DEBUG_COPY_TRUNCATED + '\n' + full.slice(-COPY_LIMIT)
    try {
      const cb = this.deps.clipboard
      if (!cb) throw new Error(Strings.SAVE_FAILED)
      await cb.writeText(text)
      this.toast(Strings.DEBUG_COPIED)
    } catch (e) {
      this.toast(errorText(e), true)
    }
  }
}
