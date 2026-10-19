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
//   Offline it changes the pad in arc only ([assignOffline], Reset with
//   [resetOfflinePads]); once the EP-133 is read again it asks whether to
//   write those changes ([offerOfflinePads], [writeOfflinePads] /
//   [discardOfflinePads]). [playLiveSound] previews the offline lists.
// - [liveLate]: Live's output delay, for the top bar's Bluetooth key, from the
//   output's latency (LiveAudioDeps.late); Android names Bluetooth from the route (liveWireless).
// - The debug screen's latency test: [liveLatency] / [resetLatency] (live.ts),
//   [liveEngine] (the row in use) and [liveLatencyHint] / [setLiveLatencyHint],
//   the web's stand-in for Android's audio engine choice (LatencyText). Play
//   actions take the press's event timeStamp ([at]) for the latency note.
// - Try arc (the first-run tour): its progress and flag are settings
//   ([setTourSteps], [finishTour], [restartTour]), copied into library.json
//   only once there is a library to keep them with (Tour.syncsIndex), so a
//   fresh install that never backs up writes no library.json. ?demo has
//   [Deps.demoPress] for the Pad step.

import { computed, effect, signal, type ReadonlySignal, type Signal } from '@preact/signals'
import { Keys, MAX_OCTAVE, MIN_OCTAVE, type NoteNames, type Scale } from '../core/features/keys'
import { arpNote } from '../core/features/arp'
import type { CardProblem } from '../core/features/beatCard'
import { ClaudeText } from '../core/text/claudeText'

// An arp voice's key split at ':': "arp", group, offset, and semitones or "n" (a pad hit).
function arpVoiceKey(p: readonly string[]): boolean {
  return p.length === 4 && p[0] === 'arp' && (p[3] === 'n' || Number.isInteger(Number(p[3])))
}
import { choiceOf as pianoChoiceOf, type KeysView } from '../core/features/piano'
import { padKey, type PhysicalPad } from '../core/features/padNotes'
import type { PadTarget } from '../core/features/liveMirror'
import { OfflinePads, SoundSource, type OfflinePad } from '../core/features/offlinePads'
import { backupDevice, restorePak } from '../core/backup/backup'
import { describePak, openPak, type PakDescription, type PakSound } from '../core/backup/pak'
import { project as exportProject, projectFileName, soundFileName, soundWav } from '../core/backup/pakExport'
import { compare as compareWithDevice } from '../core/features/backupDiff'
import { Tour } from '../core/features/tour'
import { contents as deviceContents, projectLayout, soundDetails, type DeviceContents } from '../core/features/deviceBrowser'
import { FactoryKit, FactorySounds, type FactoryKitId } from '../core/features/factorySounds'
import { search as searchLibrary, type NameEntry } from '../core/features/librarySearch'
import type { PadOrder } from '../core/features/padPush'
import { compare as comparePaks } from '../core/features/pakCompare'
import { frames, seconds, type TrimRange } from '../core/features/sampleTrim'
import { nameFor, nextFree, upload, uploadToPad, UploadItem } from '../core/features/sampleUpload'
import { FxControl } from '../core/formats/fx/fxBus'
import type { VoiceShape } from '../core/formats/voiceMixer'
import type { PadSettings } from '../core/features/padSettings'
import { OfflinePadSettings } from '../core/features/offlinePadSettings'
import { OGG_MIME, oggOpusFile, preSkipOf, voicePcm } from '../core/formats/oggOpus'
import { decodeWav } from '../core/formats/wav'
import { REC_IDLE, type RecState } from '../core/features/takeRecorder'
import type { RecordedTake } from '../platform/audio/liveAudio'
import type { TakeInfo } from '../platform/storage/takeStore'
import { assignPad as writePadSound, type SoundEntry } from '../core/protocol/device'
import { CancelledError } from '../core/protocol/errors'
import { download } from '../core/protocol/fs'
import type { TrafficLog } from '../core/protocol/trafficLog'
import { FeatureText } from '../core/text/featureText'
import type { WebLatencyHint } from '../core/text/latencyText'
import { MirrorText } from '../core/text/mirrorText'
import { DATE_TIME_PATTERN, DAY_PATTERN, MONTH_DAY_PATTERN, date as formatDate } from '../core/text/format'
import { BackupDevice, fileNameFor, importTitle, toPrune, type BackupRecord, type RestoreSelection } from '../core/text/libraryRules'
import { SettingsText, type SkinChoice, type ThemeChoice } from '../core/text/settingsText'
import { Strings } from '../core/text/strings'
import { WebText } from '../core/text/webText'
import { ktTrim } from '../core/util/kotlinText'
import { APP_BUILD } from '../version'
import { describeFile, PAK_ACCEPT, WAV_ACCEPT, type ReadableFile } from '../platform/files/pick'
import { BeatCards } from '../core/features/beatCard'
import { logFileName } from '../platform/files/save'
import type { FileData } from '../platform/files/save'
import { FileListTarget, type ExternalTarget } from '../platform/storage/external'
import { describeForRestore } from '../platform/storage/library'
import { LIVE_PAD_SETTINGS_KEY, OfflinePadsPrefs, PatternPrefs, indexSettings, memoryStorage, type AppSettings } from '../platform/storage/settings'
import { keepScreenOn } from '../platform/wakelock/wakeLock'
import { Connection, connectionPhase, type ConnectionPhase } from './connection'
import type { Deps, LiveEngineInfo } from './deps'
import { LiveSounds, noteVoice, padVoice, pressTime, type LiveLatency } from './live'
import { FxKeeper, duckSource } from './fx'
import { voiceShape } from './padShape'
import { stepWord } from './stepPlan'
import { PadEditDesk } from './padEdit'
import { PatternDesk } from './pattern'
import { SampleDesk } from './sample'
import { physicalPadOf } from './samplePlan'
import { patternBpm } from './patternPlan'
import { MirrorController } from './mirror'
import { PreviewCache, type DecodedSound } from './previewCache'
import { createStore, type Store } from './store'
import { errorText, isCancelled, Tasks, type OnProgress } from './tasks'
import { initialState, type OfflineSounds, type Tab, type UiState, type UploadDraftItem } from './types'

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
  /** The TAKE key's state (ArcController.rec). */
  readonly rec: ReadonlySignal<RecState>
  /** PATTERN: Live's own patterns, recorded and played on its output (state/pattern.ts). */
  readonly pattern: PatternDesk
  /** FX: every project's settings, the one Live shows, the punch-ins held. */
  readonly fx: FxKeeper
  /** EDIT: the pads' sound settings as arc knows them, and the pad sheet's. */
  readonly padEdit: PadEditDesk
  /** SAMPLE: recording into a pad (Live's mix). */
  readonly sample: SampleDesk
  // Presses in ERASE on the scrolling page that may still turn into a scroll: when each went down, by pad key.
  private readonly eraseUnsure = new Map<number, number>()
  // The pads and KEYS notes whose press went to the STEP panel or CORRECT (pad key, or 1000 + MIDI note),
  // so their release goes there too; and their unsure presses on the scrolling page, with when they went down.
  private readonly pressTaken = new Map<number, 'step' | 'correct'>()
  private readonly pressUnsure = new Map<number, { readonly kind: 'step' | 'correct'; readonly at: number }>()
  /** The pads sounding on the phone, as padKey numbers (MainActivity's playingPads). */
  readonly playingPads: ReadonlySignal<ReadonlySet<number>>
  /** The KEYS notes sounding on the phone (grid and piano), first pressed first (MainActivity's playingNotes). */
  readonly playingNotes: ReadonlySignal<ReadonlySet<number>>
  /** The pads the arp sounds now, as padKey numbers (LiveVoices.arpPads): lit full. */
  readonly arpPads: ReadonlySignal<ReadonlySet<number>>
  /** The KEYS notes the arp sounds now on the KEYS sound (LiveVoices.arpNotes): lit full. */
  readonly arpNotes: ReadonlySignal<ReadonlySet<number>>
  /**
   * Live's output delay in ms while it is long enough to be heard against the
   * finger, else null: Live's top bar shows its Bluetooth key then.
   * From LiveAudioDeps.late, or, without it, the slow output it reports.
   */
  readonly liveLate: ReadonlySignal<number | null>
  /** The Bluetooth delay in ms while it is made up for, else null: the Bluetooth key's words (LiveAudio.madeUpFor). */
  readonly delayMadeUpFor: ReadonlySignal<number | null>
  /** The output's latency (ms) while it is taken for Bluetooth, else null: Settings' note on what is made up. */
  readonly liveBluetooth: ReadonlySignal<number | null>
  private readonly slowMs = signal<number | null>(null)
  /** The debug screen's latency test: each engine's press-to-sound times this session. */
  readonly liveLatency: ReadonlySignal<LiveLatency>
  /** The row of the output Live plays through now (once heard), for "In use". */
  readonly liveEngine: ReadonlySignal<LiveEngineInfo | null>
  /** The debug screen's latencyHint choice; null where the output has none. */
  readonly liveLatencyHint: ReadonlySignal<WebLatencyHint> | null
  /** Live's VOLUME (0..1; web: the drawn EP-133's knob). */
  readonly liveVolume: ReadonlySignal<number>
  /** TEMPO's click level (0..1; web: the drawn EP-133's metronome level, TEMPO's Y), 1 unless turned. */
  readonly clickLevel: ReadonlySignal<number>

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
  /** Write putting the offline pad changes on: they are cleared only at its end, so a read meanwhile doesn't ask again. */
  private offlineWrite: Promise<void> | null = null
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
    this.rec = deps.liveAudio.rec ?? signal<RecState>(REC_IDLE)
    this.playingPads = computed(() => {
      const out = new Set<number>()
      for (const k of this.liveVoices.value) {
        const p = k.split(':')
        // A pad's own voice; a pattern's KEYS note, and the arp's, ring the pad it plays on (LiveVoices.pads).
        const pad = (p.length === 3 && p[0] === 'live') || (p.length === 4 && p[0] === 'seq') || arpVoiceKey(p)
        if (!pad) continue
        const g = Number(p[1])
        const o = Number(p[2])
        if (Number.isInteger(g) && Number.isInteger(o)) out.add(padKey({ group: g, offset: o }))
      }
      return out
    })
    this.playingNotes = computed(() => {
      const out = new Set<number>()
      const keysPad = this.store.state.value.keysPad
      for (const k of this.liveVoices.value) {
        if (k.startsWith('note:')) {
          const n = Number(k.slice(5))
          if (Number.isInteger(n)) out.add(n)
          continue
        }
        // The note the arp sounds now on the KEYS sound lights its key (LiveVoices.arpNotes).
        const p = k.split(':')
        if (keysPad === null || !arpVoiceKey(p) || p[3] === 'n' || Number(p[1]) !== keysPad.group || Number(p[2]) !== keysPad.offset) continue
        out.add(Keys.ROOT_NOTE + Number(p[3]))
      }
      return out
    })
    this.arpPads = computed(() => {
      const out = new Set<number>()
      for (const k of this.liveVoices.value) {
        const p = k.split(':')
        if (!arpVoiceKey(p)) continue
        const g = Number(p[1])
        const o = Number(p[2])
        if (Number.isInteger(g) && Number.isInteger(o)) out.add(padKey({ group: g, offset: o }))
      }
      return out
    })
    this.arpNotes = computed(() => {
      const out = new Set<number>()
      const keysPad = this.store.state.value.keysPad
      if (keysPad === null) return out
      for (const k of this.liveVoices.value) {
        const p = k.split(':')
        if (!arpVoiceKey(p) || p[3] === 'n' || Number(p[1]) !== keysPad.group || Number(p[2]) !== keysPad.offset) continue
        out.add(Keys.ROOT_NOTE + Number(p[3]))
      }
      return out
    })
    const late = deps.liveAudio.late
    this.liveLate = late ?? this.slowMs
    this.delayMadeUpFor = deps.liveAudio.madeUpFor ?? signal(null)
    this.liveBluetooth = deps.liveAudio.bluetooth ?? signal(null)
    // Make up for Bluetooth delay: the setting, to Live's output.
    this.cleanups.push(effect(() => deps.liveAudio.makeUpDelay?.(this.settings.value.makeUpDelay)))
    this.liveEngine = deps.liveAudio.engine ?? signal(null)
    this.liveLatencyHint = deps.liveAudio.latencyHint ?? null
    this.liveVolume = deps.liveAudio.volume ?? signal(1)
    this.clickLevel = deps.liveAudio.clickLevel ?? signal(1)
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
    this.fx = new FxKeeper((what, index, x, y) => deps.liveAudio.control?.(what, index, x, y), deps.library, {
      setTimeout: (fn, ms) => deps.setTimeout(fn, ms),
      clearTimeout: (h) => deps.clearTimeout(h),
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
      shapeOf: (pad, keys) => this.shapeFor(pad, keys),
    })
    this.liveLatency = this.live.latency
    this.pattern = new PatternDesk({
      store: this.store,
      deps,
      prefs: deps.patternPrefs ?? new PatternPrefs(memoryStorage()),
      live: this.live,
      toast,
      stepWord: (n) => stepWord(n, n.semitones === null ? this.mirrorName(n.pad) : null, this.deps.settings.settings.keysNames),
      shapeOf: (pad, keys) => this.shapeFor({ group: Math.floor(pad / 12), offset: pad % 12 }, keys),
      noteNames: () => this.deps.settings.settings.keysNames,
      padName: (pad) => this.mirrorName(pad),
    })
    this.padEdit = new PadEditDesk({
      store: this.store,
      tasks: this.tasks,
      session: () => this.conn.session,
      connected: () => this.deviceReady,
      // TRIM's length and waveform load quietly: the sheet says nothing of a sample not known yet.
      padAudio: (pad) => this.live.padAudio(pad, true),
      prefs: deps.offlinePadSettings ?? new OfflinePadsPrefs(memoryStorage(), LIVE_PAD_SETTINGS_KEY),
      toast,
      setTimeout: (fn, ms) => deps.setTimeout(fn, ms),
      clearTimeout: (h) => deps.clearTimeout(h),
      changed: () => this.pattern.refreshPlan(),
    })
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
      fmtMonthDay: (ms) => this.fmtMonthDay(ms),
      deviceRead: () => {
        void this.offerOfflinePads()
        void this.sample.shownAgain()
      },
      transport: (playing) => (playing ? deps.liveAudio.transportStarted?.() : deps.liveAudio.transportStopped?.()),
      midi: (e) => this.pattern.midi(e),
      padsRead: (project, layout) => this.padEdit.padsRead(project, layout),
      padsOffline: () => void this.padEdit.padsOffline(),
      padAssigned: (t) => this.padEdit.forget(t),
    })
    this.sample = new SampleDesk({
      deps,
      live: this.live,
      settings: () => this.settingsSignal.peek(),
      changeSettings: (change) => this.changeSettings(change),
      toast,
      toastWith: (text, label, run) => this.toastWith(text, label, run),
      editTarget: (pad, quiet) => this.editTarget(pad, quiet),
      online: () => this.deviceReady && this.mirror.current !== null && this.mirror.offline === null,
      free: () => (this.deviceReady ? (this.store.get().device?.storage.free ?? null) : null),
      deviceSlots: () => this.store.get().browser.contents?.occupiedSlots ?? new Set(this.live.deviceSoundList().map((snd) => snd.slot)),
      padHasSound: (pad) => this.padSoundName(pad) !== null,
      playPad: (pad, hold, unsure, at) => void this.live.playPad(pad, hold, unsure, at),
      releasePad: (pad) => this.live.releasePad(pad),
      keepPad: (pad) => void this.live.keepPad(pad),
      cutPad: (pad) => this.live.cutPad(pad),
      makeRoom: () => {
        // The panels share the function keys' place: SAMPLE's closes STEP's and SCENE's.
        this.pattern.setStepOpen(false)
        this.pattern.setSceneOpen(false)
        this.closePadEdit()
        this.pattern.setClick(false)
        // PATTERN stops recording; PLAY goes on, for a take of what it plays.
        this.pattern.recordOff()
      },
      localChanged: (pads) => {
        const m = this.mirror.current
        if (m === null) return
        m.setLocal(pads)
        this.mirror.localChanged()
        this.pattern.refreshPlan()
      },
      forgetPadSettings: (t) => this.padEdit.forget(t),
      upload: (name, wav, t, slot, onProgress) => this.uploadRecording(name, wav, t, slot, onProgress),
      takesChanged: () => void this.loadTakes(),
      patterns: this.pattern,
      hasNotes: () => this.pattern.ui.peek().hasNotes.some(Boolean),
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
    // PATTERN: the kept patterns, the project Live shows (its own patterns) and the device's tempo.
    // FX: the kept settings, the project's own, and the tempo its delays and punch-ins follow.
    void this.pattern.load()
    void this.fx.load()
    let project: number | null = null
    let bpm: number | null = null
    let fxBpm: number | null = null
    let sku: string | null = null
    const fxTempo = (): void => {
      const t = patternBpm(this.store.get().mirror?.state.bpm, this.pattern.metronome.peek().bpm)
      if (t === fxBpm) return
      fxBpm = t
      deps.liveAudio.control?.(FxControl.TEMPO, 0, t, 0)
    }
    this.cleanups.push(
      this.store.subscribe((st) => {
        const p = st.mirror?.state.activeProject ?? null
        if (p !== null && p !== project) {
          project = p
          void this.pattern.switchProject(p)
          this.fx.desk.switchTo(p)
        }
        const b = st.mirror?.state.bpm ?? null
        if (b !== bpm) {
          bpm = b
          this.pattern.tempoChanged()
          fxTempo()
        }
        // A device connected: its kit, when its pack is saved, is Live's factory kit from now on.
        const k = st.device?.info.sku ?? null
        if (k !== sku) {
          sku = k
          if (k !== null) this.deviceKit(k)
        }
      }),
    )
    this.cleanups.push(this.pattern.metronome.subscribe(fxTempo))
    // The sidechain's source is in the pattern's voices' shapes.
    let duck: string | null = null
    this.cleanups.push(
      this.fx.desk.fx.subscribe((fx) => {
        const d = fx.sidechain.on ? `${fx.sidechain.group}:${fx.sidechain.pad}` : ''
        if (duck !== null && d !== duck) this.pattern.refreshPlan()
        duck = d
      }),
    )
    this.cleanups.push(() => this.pattern.dispose())
    this.cleanups.push(() => this.fx.dispose())
    if (audio.onTake) this.cleanups.push(audio.onTake((take, limit) => void this.takeDone(take, limit)))
    void this.loadTakes()
    // SAMPLE: recordings left from before this start that no pad change names go to Takes.
    this.cleanups.push(() => this.sample.dispose())
    void this.sample.moveStrays(deps.now())
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
    this.store.update((s) => ({
      ...s,
      folderPicked: lib.folderPicked,
      folderStatus: status,
      folderName: lib.target?.name ?? null,
      folderChecked: true,
    }))
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
   * library, and stops when they are deleted: it opens offline again, as it
   * does when the pack it shows is no longer the active kit's (FactoryKit:
   * replaced, or the EP-1320's deleted). Else the sounds it offers offline
   * follow the library ([MirrorController.refreshOffline]).
   */
  private factoryChanged(): void {
    const st = this.store.get()
    const mi = st.mirror
    if (mi === null || (this.conn.session !== null && st.device !== null)) return
    const pack = this.live.factoryPack()
    if ((pack !== null && mi.error === MirrorText.NOT_CONNECTED) || (mi.offline === MirrorText.FACTORY && pack?.id !== this.live.shownPackId)) {
      void this.mirror.openOffline()
    } else void this.mirror.refreshOffline()
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
      const first = !this.store.get().libraryLoaded
      this.store.update((s) => ({ ...s, backups: list, libraryLoaded: true, libraryChecked: true, spaceLeft }))
      // Connected before the library was first read: the device's kit, now that its pack can be seen.
      const sku = this.store.get().device?.info.sku
      if (first && sku !== undefined) this.deviceKit(sku)
      void this.runSearch()
      this.factoryChanged()
    } catch (e) {
      // The first run decides without the library (no backups, nothing to restore).
      if (gen === this.libraryGen && !this.disposed) this.store.update((s) => (s.libraryChecked ? s : { ...s, libraryChecked: true }))
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
      // The beat card sheet goes with Live.
      this.pattern.dismissBeat()
      this._beatPasting.value = false
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
    // SAMPLE closes (a take going on is kept), and the pattern, the arp and the click stop with the sound (Android's focus lost).
    this.sample.exit()
    this.pattern.stop()
    this.pattern.arpClear()
    this.pattern.setClick(false)
    // A punch-in lasts while it is held.
    this.fx.desk.punchAllUp()
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
    this.sample.exit()
    // The arp's notes go with the output; it stays on.
    this.pattern.arpClear()
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

  /** Try arc's Connect key: connects, never disconnects (a second tap while it connects does nothing). */
  async connectIfNeeded(): Promise<void> {
    if (this.conn.session !== null || this.store.get().busy) return
    await this.conn.connect()
  }

  refreshDevice(): Promise<void> {
    return this.conn.refreshDevice()
  }

  /** ?demo: whether the simulated EP-133 stands in for the device. */
  get demo(): boolean {
    return this.deps.demo === true
  }

  /** ?demo: the simulated EP-133 plays a pad (Try arc's Pad step); nothing elsewhere. */
  demoPress(): void {
    this.deps.demoPress?.()
  }

  /** dropSession's controller part (the session is already closed). */
  private onDropped(): void {
    this.mirror.stop()
    // Asked whether to write the offline pad changes: they stay for the next connection.
    if (this.store.get().offlinePrompt !== null) this.store.update((st) => ({ ...st, offlinePrompt: null }))
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

  /** The day alone, "Oct 5" (in the browser's order). */
  fmtMonthDay(ms: number): string {
    return formatDate(ms, MONTH_DAY_PATTERN)
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
    this.pattern.arpClear()
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
    // Write needs the mirror's read: the next one asks again.
    this.store.update((st) => (st.offlinePrompt === null ? st : { ...st, offlinePrompt: null }))
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
    this.pattern.arpClear()
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
    const pressedAt = pressTime(at, this.deps.perfNow())
    const k = padKey(pad)
    // SAMPLE takes the press: held, it records into the pad (a screen reader's click latches a take).
    if (this.sample.open) {
      if (hold) this.sample.padDown(pad, pressedAt, unsure)
      else this.sample.latchTake(pad, pressedAt)
      return Promise.resolve()
    }
    // The order a press goes: STEP, ERASE, CORRECT, then play.
    if (this.pattern.stepping) {
      // Placed and sounded once it is a press, not a scroll ([keepPad]).
      if (hold && unsure) {
        this.pressUnsure.set(k, { kind: 'step', at: pressedAt })
        return Promise.resolve()
      }
      const done = this.stepPadDown(pad, hold, at)
      // A screen reader's click: a tap.
      if (hold) this.pressTaken.set(k, 'step')
      else this.pattern.stepUp(padVoice(pad))
      return done
    }
    if (!this.pattern.erasing && this.pattern.correcting) {
      if (!hold) {
        this.pattern.correctPadDown(pad, pressedAt)
        this.pattern.correctPadUp(pad, pressedAt)
      } else if (unsure) {
        this.pressUnsure.set(k, { kind: 'correct', at: pressedAt })
      } else {
        this.pressTaken.set(k, 'correct')
        this.pattern.correctPadDown(pad, pressedAt)
      }
      return Promise.resolve()
    }
    // The PAD flow of SCENE's CLIP row waiting for a pad: the tap is its, neither played nor recorded
    // (one a scroll may yet take, once kept: [keepPad]).
    if (!this.pattern.erasing && this.pattern.scenePadTap(pad, padVoice(pad), hold && unsure)) return Promise.resolve()
    // ERASE takes the press: nothing sounds, the pad's notes go (a screen reader's click is a tap).
    if (this.pattern.erasing) {
      if (!hold) {
        this.pattern.erasePadDown(pad, pressedAt)
        this.pattern.erasePadUp(pad, pressedAt)
      } else if (unsure) {
        this.eraseUnsure.set(padKey(pad), pressedAt)
      } else {
        this.pattern.erasePadDown(pad, pressedAt)
      }
      return Promise.resolve()
    }
    // The arp on (RPT): the press holds the pad for note repeat, not played or recorded itself.
    // One a scroll may yet take becomes the KEYS sound, and starts RECORD armed, once kept ([keepPad]).
    if (this.pattern.arpTakes(hold)) {
      if (!unsure) this.live.selectKeysPad(pad)
      this.pattern.arpPress(padVoice(pad), arpNote(pad, null), false, pressedAt, hold, unsure)
      return Promise.resolve()
    }
    const done = this.live.playPad(pad, hold, unsure, at)
    this.pattern.press(pad, null, padVoice(pad), pressedAt, hold)
    return done
  }

  /**
   * [pad]'s sound heard whole, whatever the pads do now (SAMPLE's Play, a
   * screen reader's custom action on Android): not recorded into, not erased,
   * not put on the pattern.
   */
  hearPad(pad: PhysicalPad): Promise<void> {
    return this.live.playPad(pad, false)
  }

  /**
   * How [pad] plays on the phone: its sound settings as known, made a voice
   * shape; unknown, as a pad always has. KEYS ([keys]) plays each note on its
   * own, so LEGATO's one voice across notes becomes a held note there. Either
   * way it is on its group's FX bus, and ducks the sidechain's groups when it
   * is the source (KEYS' notes too, when their pad is).
   */
  private shapeFor(pad: { readonly group: number; readonly offset: number }, keys = false): Partial<VoiceShape> {
    const duck = duckSource(this.fx.desk.fx.peek(), pad)
    const s = this.padSettingsOf(pad)
    if (s === null) return duck ? { bus: pad.group, duckSource: true } : { bus: pad.group }
    return voiceShape(s, pad.group, keys, duck)
  }

  /** [pad]'s sound settings as arc knows them (Live's project), null when unknown. */
  private padSettingsOf(pad: { readonly group: number; readonly offset: number }): PadSettings | null {
    return this.padEdit.settingsOf(this.mirror.current?.target(pad) ?? null)
  }

  /**
   * The FX sheet's cap: [pad] plays as Live plays it, through the effects,
   * until [releaseTry]; a try, so never a pattern's note, nor ERASE's.
   */
  tryPad(pad: PhysicalPad, at?: number): Promise<void> {
    return this.live.playPad(pad, true, false, at)
  }

  /** The finger left the FX sheet's cap. */
  releaseTry(pad: PhysicalPad): void {
    this.live.releasePad(pad)
  }

  /**
   * A press in the open STEP panel on [pad]: placed on the cursor's step
   * with the panel's RECORD held, picked with NUDGE waiting, and sounding
   * unless it was picked; never recorded into the pattern.
   */
  private stepPadDown(pad: PhysicalPad, hold: boolean, at?: number): Promise<void> {
    const plays = this.pattern.stepDown(padVoice(pad), { pad, semitones: null })
    return plays ? this.live.playPad(pad, hold, false, at) : Promise.resolve()
  }

  /** A long press on [pad] in the STEP panel: picked for − / + (every pitch on it); false when it has no note on the step. */
  stepPadPick(pad: PhysicalPad): boolean {
    return this.pattern.stepPick({ pad, semitones: null })
  }

  /** KEYS in the STEP panel: a long press on MIDI [note] of the KEYS sound picks that note, as [stepPadPick]. */
  stepNotePick(note: number): boolean {
    const pad = this.store.get().keysPad
    return pad !== null && this.pattern.stepPick({ pad, semitones: note - Keys.ROOT_NOTE })
  }

  /** The unsure press on the pad was a press after all: it becomes the KEYS sound (and one not in memory loads). */
  keepPad(pad: PhysicalPad): Promise<void> {
    if (this.sample.open) {
      this.sample.padKept(pad)
      return Promise.resolve()
    }
    // One the PAD flow was waiting for: its tap.
    if (this.pattern.sceneTapKept(pad, padVoice(pad))) return Promise.resolve()
    // One the arp holds: neither played nor recorded itself.
    if (this.pattern.arpKeep(padVoice(pad))) {
      this.live.selectKeysPad(pad)
      return Promise.resolve()
    }
    const k = padKey(pad)
    const u = this.pressUnsure.get(k)
    if (u !== undefined) {
      this.pressUnsure.delete(k)
      this.pressTaken.set(k, u.kind)
      if (u.kind === 'correct') {
        this.pattern.correctPadDown(pad, u.at)
        return Promise.resolve()
      }
      return this.stepPadDown(pad, true, u.at)
    }
    const erasedAt = this.eraseUnsure.get(padKey(pad))
    if (erasedAt !== undefined) {
      this.eraseUnsure.delete(padKey(pad))
      this.pattern.erasePadDown(pad, erasedAt)
      return Promise.resolve()
    }
    return this.live.keepPad(pad)
  }

  /** The finger left the pad: its sound fades out. [at]: the lift's event timeStamp, for the note's gate. */
  releasePad(pad: PhysicalPad, at?: number): void {
    if (this.sample.open) return this.sample.padUp(pad, pressTime(at, this.deps.perfNow()))
    // Unsure for the PAD flow and lifted inside the scroll window: its tap.
    if (this.pattern.sceneTapKept(pad, padVoice(pad))) return
    // One the arp holds, unsure and lifted inside the scroll window, was a tap; its note goes with the finger (unless latched).
    if (this.pattern.arpKeep(padVoice(pad))) this.live.selectKeysPad(pad)
    this.pattern.arpRelease(padVoice(pad))
    const releasedAt = pressTime(at, this.deps.perfNow())
    const k = padKey(pad)
    // Unsure in STEP or CORRECT and lifted inside the scroll window: a tap.
    const u = this.pressUnsure.get(k)
    if (u !== undefined) {
      this.pressUnsure.delete(k)
      if (u.kind === 'correct') {
        this.pattern.correctPadDown(pad, u.at)
        this.pattern.correctPadUp(pad, releasedAt)
      } else {
        void this.stepPadDown(pad, false, u.at)
        this.pattern.stepUp(padVoice(pad))
      }
      return
    }
    const taken = this.pressTaken.get(k)
    if (taken !== undefined) {
      this.pressTaken.delete(k)
      if (taken === 'correct') {
        this.pattern.correctPadUp(pad, releasedAt)
      } else {
        this.live.releasePad(pad)
        this.pattern.stepUp(padVoice(pad))
      }
      return
    }
    // Unsure in ERASE and lifted inside the scroll window: a tap.
    const erasedAt = this.eraseUnsure.get(padKey(pad))
    if (erasedAt !== undefined) {
      this.eraseUnsure.delete(padKey(pad))
      this.pattern.erasePadDown(pad, erasedAt)
    }
    this.pattern.erasePadUp(pad, releasedAt)
    this.live.releasePad(pad)
    this.pattern.release(padVoice(pad), releasedAt)
  }

  /** The press on the pad turned into a scroll (the all-groups page): its sound ends at once. */
  cutPad(pad: PhysicalPad): void {
    if (this.sample.open) return this.sample.padCut(pad)
    if (this.pattern.sceneTapCut(padVoice(pad))) return
    // Nor does it repeat.
    this.pattern.arpCut(padVoice(pad))
    const k = padKey(pad)
    if (this.pressUnsure.delete(k)) return
    const taken = this.pressTaken.get(k)
    if (taken !== undefined) {
      this.pressTaken.delete(k)
      if (taken === 'correct') this.pattern.correctPadUp(pad, this.deps.perfNow())
      else {
        this.live.cutPad(pad)
        this.pattern.stepUp(padVoice(pad))
      }
      return
    }
    this.eraseUnsure.delete(padKey(pad))
    this.pattern.eraseCut(pad)
    this.live.cutPad(pad)
    this.pattern.cut(padVoice(pad))
  }

  /**
   * PROJECT's tap: connected, the EP-133 switches to the next project and
   * Live follows it; offline, Live shows the next of its views (the last
   * read's project and the factory pack's), in arc only.
   */
  stepProject(): void {
    this.mirror.stepProject()
  }

  /** PROJECT held, project [n] (1..9) picked on the pads or the sheet: as [stepProject] would go there. */
  selectProject(n: number): void {
    this.mirror.selectProject(n)
  }

  /** The sound KEYS plays: the pad last tapped, or last played on the device in the pads view. */
  selectKeysPad(pad: PhysicalPad): void {
    this.live.selectKeysPad(pad)
  }

  /** Plays MIDI [note] on the KEYS sound (a grid key or a piano key) until [releaseNote]; [hold] false plays to the end. Call from the press ([at]: its timeStamp). */
  playNote(note: number, hold = true, at?: number): Promise<void> {
    const pressedAt = pressTime(at, this.deps.perfNow())
    const pad = this.store.get().keysPad
    // In the STEP panel a key places, picks or sounds its note there.
    if (this.pattern.stepping) {
      if (pad === null) {
        this.toastOnce(MirrorText.PICK_SOUND)
        return Promise.resolve()
      }
      const plays = this.pattern.stepDown(noteVoice(note), { pad, semitones: note - Keys.ROOT_NOTE })
      const done = plays ? this.live.playNote(note, hold, at) : Promise.resolve()
      // A screen reader's click: a tap.
      if (hold) this.pressTaken.set(1000 + note, 'step')
      else this.pattern.stepUp(noteVoice(note))
      return done
    }
    // CORRECT while playing: a key corrects its note on the KEYS sound, silently.
    if (!this.pattern.erasing && this.pattern.correcting) {
      if (pad !== null) {
        this.pattern.correctPadDown(pad, pressedAt, note - Keys.ROOT_NOTE)
        if (!hold) this.pattern.correctPadUp(pad, pressedAt, note - Keys.ROOT_NOTE)
        else this.pressTaken.set(1000 + note, 'correct')
      }
      return Promise.resolve()
    }
    // ERASE takes the note: its notes on the KEYS sound go.
    if (this.pattern.erasing) {
      if (pad !== null) {
        this.pattern.erasePadDown(pad, pressedAt, note - Keys.ROOT_NOTE)
        if (!hold) this.pattern.erasePadUp(pad, pressedAt, note - Keys.ROOT_NOTE)
      }
      return Promise.resolve()
    }
    // The arp on: the note joins the arp's, neither played nor recorded itself.
    if (this.pattern.arpTakes(hold)) {
      if (pad === null) this.toastOnce(MirrorText.PICK_SOUND)
      else this.pattern.arpPress(noteVoice(note), arpNote(pad, note - Keys.ROOT_NOTE), true, pressedAt, hold)
      return Promise.resolve()
    }
    const done = this.live.playNote(note, hold, at)
    if (pad !== null) this.pattern.press(pad, note - Keys.ROOT_NOTE, noteVoice(note), pressedAt, hold)
    return done
  }

  /** The debug screen's latencyHint choice: Live's output reopens at the new hint. */
  setLiveLatencyHint(choice: WebLatencyHint): void {
    this.deps.liveAudio.setLatencyHint?.(choice)
  }

  /** Live's VOLUME (0..1): the speakers' share of the mix, kept in this browser. */
  setLiveVolume(v: number): void {
    this.deps.liveAudio.setOutputVolume?.(v)
  }

  /**
   * TEMPO's click level (0..1, heard at its square; 0 silent): kept in this
   * browser. Whether the click is on stays [pattern]'s setClick: the caller
   * turns it on or off where the level leaves or reaches 0, if it wants to.
   */
  setClickLevel(v: number): void {
    this.deps.liveAudio.setClickLevel?.(v)
  }

  /** KEYS [note] held at [pressure] (the pointer's own, while the arp is on): its velocity, on a device that tells pressure. */
  notePressure(note: number, pressure: number): void {
    this.pattern.arpPressure(noteVoice(note), pressure)
  }

  /** [pad] held at [pressure] (the pointer's own, while note repeat is on): its velocity, on a device that tells pressure. */
  padPressure(pad: PhysicalPad, pressure: number): void {
    this.pattern.arpPressure(padVoice(pad), pressure)
  }

  /** The latency test's Reset: every engine's times go (the engines tried keep their rows). */
  resetLatency(): void {
    this.live.resetLatency()
  }

  /** The last finger left the note: it fades out. */
  releaseNote(note: number, at?: number): void {
    // A note the arp holds goes with the finger (unless latched).
    this.pattern.arpRelease(noteVoice(note))
    const pad = this.store.get().keysPad
    const taken = this.pressTaken.get(1000 + note)
    if (taken !== undefined) {
      this.pressTaken.delete(1000 + note)
      if (taken === 'correct') {
        if (pad !== null) this.pattern.correctPadUp(pad, pressTime(at, this.deps.perfNow()), note - Keys.ROOT_NOTE)
      } else {
        this.pattern.stepUp(noteVoice(note))
      }
      // A key held from before still lets go of its note.
      this.live.releaseNote(note)
      return
    }
    if (pad !== null) this.pattern.erasePadUp(pad, pressTime(at, this.deps.perfNow()), note - Keys.ROOT_NOTE)
    this.live.releaseNote(note)
    this.pattern.release(noteVoice(note), pressTime(at, this.deps.perfNow()))
  }

  // ---------- Live's EDIT: another sound on a pad (an addition, see device.assignPad) ----------

  /**
   * The device's sounds as Live knows them, by slot: the Device tab's list
   * when it has been read, else the one Live's own read made. For the pad
   * sheet and the Sounds tab.
   */
  liveSounds(): readonly SoundEntry[] {
    // Offline: the list the pads shown come from (the last read's, or the factory pack's).
    const off = this.offlineSounds()
    if (off !== null) return (off.base === SoundSource.FACTORY ? off.factory : off.device) ?? []
    return this.store.get().browser.contents?.sounds ?? this.live.deviceSoundList()
  }

  /** The sounds Live offers without the device, while it shows the last read (MirrorUi.offlineSounds). */
  private offlineSounds(): OfflineSounds | null {
    if (this.mirror.offline === null) return null
    return this.store.get().mirror?.offlineSounds ?? null
  }

  /**
   * The name of the sound on [pad] now, as its pad record says (the mirror's
   * own name for it waits for a learned link); null when unknown or empty.
   * Offline, its change in arc first.
   */
  padSoundName(pad: PhysicalPad): string | null {
    const t = this.editTarget(pad, true)
    const slot = t?.slot ?? null
    if (slot === null) return null
    const local = this.mirror.offline?.localOf(pad) ?? null
    if (local !== null) return local.name
    return this.soundName(slot)
  }

  /** The list [pad]'s sound comes from offline: its change's, else the pads' own; null when connected. */
  padSource(pad: PhysicalPad): SoundSource | null {
    const off = this.offlineSounds()
    if (off === null) return null
    return this.mirror.offline?.localOf(pad)?.source ?? off.base
  }

  /**
   * Offline, the slot the last read has on [pad], under any change in arc:
   * the pad sheet keeps it pickable, to take the change back. Null when connected.
   */
  padReadSlot(pad: PhysicalPad): number | null {
    const m = this.mirror.offline
    const t = m !== null ? this.editTarget(pad, true) : null
    return m === null || t === null ? null : m.slotAt(t.group, t.pad)
  }

  /** A device sound's name for a toast: its name, else its slot number. */
  private soundName(slot: number): string {
    return this.liveSounds().find((snd) => snd.slot === slot)?.name ?? FeatureText.slot(slot)
  }

  /** Whether the EP-133 is connected and read (the pads can be written). */
  private get deviceReady(): boolean {
    return this.conn.session !== null && this.store.get().device !== null
  }

  /**
   * Where [pad]'s sound is set now (its project, pad file and slot), or
   * null, saying why, when it can't be changed: not connected (and no last
   * read shown, where a change stays in arc), or the active project not read yet.
   */
  editTarget(pad: PhysicalPad, quiet = false): PadTarget | null {
    if (!this.deviceReady && this.mirror.offline === null) {
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

  /**
   * EDIT's sheet opened on [pad]: its sound settings show as arc knows them
   * and, connected, are read from the EP-133 (PadEditDesk.open); none for a
   * pad that can't be changed or has no sound.
   */
  openPadEdit(pad: PhysicalPad): void {
    const t = this.editTarget(pad, true)
    if (t === null) this.padEdit.close()
    else this.padEdit.open(pad, t)
  }

  /** EDIT's sheet closed: a turn not yet written still goes on the device. */
  closePadEdit(): void {
    this.padEdit.close()
  }

  /** A knob turned on the open pad sheet: the pad plays so at once, and the EP-133 gets it once the turning rests. */
  adjustPad(settings: PadSettings): void {
    this.padEdit.adjust(settings)
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
   * sound it had is known). Offline, [slot] of [source]'s list goes on the
   * pad in arc only ([assignOffline]). Resolves true when the pad took it.
   */
  async assignPad(pad: PhysicalPad, slot: number, source: SoundSource = SoundSource.DEVICE): Promise<boolean> {
    const t = this.editTarget(pad)
    if (t === null) return false
    if (!this.deviceReady) return this.assignOffline(pad, t, slot, source)
    // The factory list is only offered offline: its slot isn't the device's sound.
    if (source !== SoundSource.DEVICE) return false
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

  /** An offline change's kit: a factory sound's (the factory list's, MirrorUi.kit), when it isn't the EP-133's (OfflinePad.kit). */
  private padKit(source: SoundSource): { kit?: FactoryKitId } {
    const kit = FactoryKit.ofId(this.store.get().mirror?.kit) ?? this.live.factoryKit()
    return source === SoundSource.FACTORY && kit !== FactoryKit.EP133 ? { kit: kit.id } : {}
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

  /**
   * Offline: [slot] of [source]'s list on [pad] (its target [t]) in arc
   * only, until the EP-133 connects. A device sound arc can't play is
   * refused, but the read's own sound back on the pad (playable or not)
   * drops the change. No UNDO: the sheet puts any sound back.
   */
  private async assignOffline(pad: PhysicalPad, t: PadTarget, slot: number, source: SoundSource): Promise<boolean> {
    const m = this.mirror.offline
    const off = this.offlineSounds()
    const snd = (source === SoundSource.FACTORY ? off?.factory : off?.device)?.find((e) => e.slot === slot)
    const readSlot = m?.slotAt(t.group, t.pad) ?? null
    const own = source === SoundSource.DEVICE && slot === readSlot
    if (m === null || off === null || snd === undefined || (source === SoundSource.DEVICE && !own && off.unavailable.has(slot))) {
      this.toast(MirrorText.NEEDS_DEVICE)
      return false
    }
    const pads = await this.live.loadOfflinePads()
    if (this.mirror.offline !== m) return false
    const next =
      own
        ? OfflinePads.drop(pads, t.project, t.group, t.pad)
        : OfflinePads.put(pads, { project: t.project, group: t.group, pad: t.pad, slot, name: snd.name, source, ...this.padKit(source) })
    this.live.setOfflinePads(next)
    m.setLocal(next)
    // The new sound comes with its own settings, as on the device.
    this.padEdit.forget(t)
    this.mirror.localChanged()
    this.toast(MirrorText.assignedOffline(pad, snd.name))
    return true
  }

  /** Reset pads: the offline changes go (recordings to Takes), and the pads show what the last read had. */
  async resetOfflinePads(): Promise<void> {
    const moved = await this.dropOfflinePads()
    this.padEdit.saveOffline(OfflinePadSettings.EMPTY)
    void this.padEdit.padsOffline()
    const m = this.mirror.offline
    if (m !== null) {
      m.setLocal(await this.live.loadOfflinePads())
      this.mirror.localChanged()
      this.pattern.refreshPlan()
    }
    this.toast(MirrorText.PADS_RESET + samplesMoved(moved))
  }

  /** Drops the offline pad changes but the recordings uploading now, the other recordings moved to Takes; how many were. */
  private async dropOfflinePads(): Promise<number> {
    const uploading = this.sample.uploadingNow()
    const list = (await this.live.loadOfflinePads()).list
    const going = (p: OfflinePad): boolean => p.file != null && uploading.has(p.file)
    this.live.setOfflinePads({ list: list.filter(going) })
    return this.sample.recordingsToTakes(list.filter((p) => !going(p)))
  }

  /**
   * SAMPLE's upload of a recording kept: [wav] into a free slot ([slot] when
   * the review picked one), then onto [t]'s pad, while Live plays on, its
   * progress to [onProgress]. The pad's copy is kept, then the mirror's
   * names and the pad follow. The slot, or null once a toast said why not.
   */
  private async uploadRecording(name: string, wav: Uint8Array, t: PadTarget, slot: number | null, onProgress: (fraction: number) => void): Promise<number | null> {
    const s = this.conn.session
    if (s === null) {
      this.toast(MirrorText.EDIT_OFFLINE)
      return null
    }
    let error: string | null = null
    let into: number | null = null
    // After whatever holds the device, waiting again when something took it first.
    while (into === null && error === null && this.conn.session === s) {
      await this.store.waitFor((st) => !st.busy)
      const occupied = this.store.get().browser.contents?.occupiedSlots ?? new Set(this.live.deviceSoundList().map((snd) => snd.slot))
      into = await this.tasks.exclusive('upload', true, async (ss) => {
        try {
          return await uploadToPad(ss, name, wav, occupied, t, null, { onProgress: (p) => onProgress(p.fraction) }, slot)
        } catch (e) {
          error = errorText(e)
          return null
        }
      })
    }
    if (error !== null) this.toast(MirrorText.uploadFailed(error), true)
    if (into === null) {
      if (this.conn.session !== s) this.toast(MirrorText.EDIT_OFFLINE)
      return null
    }
    // The new sound's name and size, and the space left (SAMPLE's "Disk low").
    await this.refreshAll(true)
    const e = this.store.get().browser.contents?.sounds.find((snd) => snd.slot === into)
    // Kept before the pad's copy is looked for, so the copy never reads it back.
    if (e !== undefined) {
      try {
        const w = decodeWav(wav)
        await this.live.keepPadSound(into, e.name, e.size, w.pcm, w.channels, w.sampleRate)
      } catch {
        // Its copy is read from the device instead.
      }
    }
    const m = this.mirror.current
    this.mirror.assigned({ ...t, slot: t.slot ?? m?.slotAt(t.group, t.pad) ?? null }, into)
    return into
  }

  /** The EP-133 was read: with offline pad changes kept, it asks whether to write them (UiState.offlinePrompt). */
  async offerOfflinePads(): Promise<void> {
    // Still writing them (Live left and came back meanwhile): not asked again.
    if (this.offlineWrite !== null) return
    // Recordings uploading now aren't asked about: they are on their way already.
    const uploading = this.sample.uploadingNow()
    const pads = (await this.live.loadOfflinePads()).list.filter((p) => p.file == null || !uploading.has(p.file))
    // The recordings counted apart from the other changes (ArcController's samples / changes).
    const samples = pads.filter((p) => p.source === SoundSource.RECORDED).length
    const changes = pads.length - samples + (await this.padEdit.offlineCount())
    if (changes + samples === 0 || !this.deviceReady) return
    this.store.update((st) => ({ ...st, offlinePrompt: { changes, samples } }))
  }

  /**
   * Write: the offline changes that still fit go on the EP-133 one by one
   * (OfflinePads.fits: made on its active project, the same sound still in
   * that slot); the rest are skipped. Then they are cleared, and the toast
   * counts both. The connection going meanwhile keeps the ones not written
   * yet, for the next read to ask about. A Write while one runs is the
   * same one.
   */
  writeOfflinePads(): Promise<void> {
    this.store.update((st) => ({ ...st, offlinePrompt: null }))
    if (this.offlineWrite !== null) return this.offlineWrite
    const w = this.writeOfflinePadsNow().finally(() => {
      if (this.offlineWrite === w) this.offlineWrite = null
    })
    this.offlineWrite = w
    return w
  }

  private async writeOfflinePadsNow(): Promise<void> {
    const s = this.conn.session
    // The mirror's read is what the changes are checked against: wait for it.
    await this.store.waitFor((st) => st.mirror?.loading !== true)
    const m = this.mirror.current
    if (s === null || this.conn.session !== s || m === null || this.mirror.offline !== null || !this.deviceReady) {
      this.toast(MirrorText.EDIT_OFFLINE)
      return
    }
    // Recordings uploading now are left to their upload (SampleDesk).
    const uploading = this.sample.uploadingNow()
    const pads = (await this.live.loadOfflinePads()).list.filter((p) => p.file == null || !uploading.has(p.file))
    let written = 0
    let skipped = 0
    // Recordings that couldn't go on: to Takes, never dropped.
    const unplaced: OfflinePad[] = []
    // What the connection going keeps: the changes not written yet (and what came since).
    const keepUnwritten = async (i: number): Promise<void> => {
      const done = pads.slice(0, i)
      this.live.setOfflinePads({ list: (await this.live.loadOfflinePads()).list.filter((x) => !done.some((d) => sameChange(d, x))) })
      await this.sample.recordingsToTakes(unplaced)
    }
    for (const [i, p] of pads.entries()) {
      // Replaced meanwhile by a take kept on its pad (which goes up on its own, the old one into Takes).
      if (!(await this.live.loadOfflinePads()).list.some((x) => sameChange(x, p))) continue
      const names = new Map(this.liveSounds().map((snd) => [snd.slot, snd.name]))
      if (!OfflinePads.fits(p, m.snapshot(this.deps.perfNow()).activeProject, names)) {
        skipped++
        if (p.source === SoundSource.RECORDED) unplaced.push(p)
        continue
      }
      // A recording: never on the device yet, whatever the pad has now it goes on it.
      if (p.source === SoundSource.RECORDED) {
        const into = this.conn.session === s ? await this.sample.uploadRecorded(p, physicalPadOf(m, p.group, p.pad)) : null
        if (into !== null) written++
        else if (this.conn.session !== s) return keepUnwritten(i)
        else {
          skipped++
          unplaced.push(p)
        }
        continue
      }
      const now = m.slotAt(p.group, p.pad)
      if (now === p.slot) {
        written++
        continue
      }
      // One write at a time, each after whatever holds the device.
      await this.store.waitFor((st) => !st.busy)
      const t: PadTarget = { project: p.project, group: p.group, pad: p.pad, slot: now }
      const r = this.conn.session === s ? await this.writePad(t, p.slot) : null
      if (r !== null && r.error === null) {
        this.mirror.assigned(t, p.slot)
        written++
      } else if (this.conn.session !== s) {
        // The connection went: this change and the rest are kept.
        return keepUnwritten(i)
      } else {
        if (r !== null && r.error !== null) this.toast(MirrorText.assignFailed(r.error), true)
        skipped++
      }
    }
    // Changes made meanwhile (a recording kept) stay for their own upload or the next question.
    this.live.setOfflinePads({ list: (await this.live.loadOfflinePads()).list.filter((x) => !pads.some((d) => sameChange(d, x))) })
    await this.sample.recordingsToTakes(unplaced)
    // Then the settings turned offline, on the pads of the project they were turned in that still
    // hold the sound they were turned for: only what was turned changes, the rest is the device's now.
    const turned = await this.padEdit.writeOffline(s, m.snapshot(this.deps.perfNow()).activeProject, (g, p) => m.slotAt(g, p))
    if (turned.lost) return
    this.toast(MirrorText.offlineWritten(written + turned.written, skipped + turned.skipped))
  }

  /** Discard: the offline changes go; the EP-133 keeps what it has. */
  async discardOfflinePads(): Promise<void> {
    this.store.update((st) => ({ ...st, offlinePrompt: null }))
    const moved = await this.dropOfflinePads()
    this.padEdit.saveOffline(OfflinePadSettings.EMPTY)
    this.toast(MirrorText.OFFLINE_DISCARDED + samplesMoved(moved))
  }

  /**
   * Previews [slot] of [source]'s list: connected, a device sound as
   * [playDeviceSound] plays it; offline, from arc's copies, a backup or the
   * factory pack (cached with the previews), else a toast says there's no
   * copy. Call from a tap.
   */
  async playLiveSound(slot: number, source: SoundSource): Promise<void> {
    if (this.deviceReady && source === SoundSource.DEVICE) return this.playDeviceSound(slot)
    this.deps.player.resumeInGesture()
    const token = ++this.playToken
    const off = this.offlineSounds()
    const name = (source === SoundSource.FACTORY ? off?.factory : off?.device)?.find((e) => e.slot === slot)?.name
    if (name === undefined) return
    // A factory sound's preview is its pack's: the other kit's in that slot is another sound.
    const key = `${PAD_PREVIEW}${source}:${slot}:${name}` + (source === SoundSource.FACTORY ? `:${this.live.factoryPack()?.id ?? ''}` : '')
    let d = this.previews.get(key)
    if (d === null) {
      try {
        d = await this.live.offlineSound(slot, name, source === SoundSource.FACTORY)
      } catch {
        d = null
      }
      if (d !== null) this.previews.put(key, d)
    }
    if (token !== this.playToken) return
    if (d === null) {
      this.toast(WebText.LIVE_NO_COPY)
      return
    }
    await this.startSound(`${source}:${slot}`, d.pcm, d.channels, d.sampleRate)
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
    if (files.length === 0) return
    // Offline a pad changes in arc only: an upload needs the EP-133.
    if (!this.deviceReady) {
      this.toast(MirrorText.EDIT_OFFLINE)
      return
    }
    if (this.editTarget(pad) === null) return
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
    if (!this.deviceReady) {
      this.toast(MirrorText.EDIT_OFFLINE)
      return
    }
    if (this.editTarget(pad) === null) return
    const files = await this.deps.files.pick({ accept: WAV_ACCEPT, multiple: false })
    await this.uploadForPad(pad, files)
  }

  /** Space taken by Live's copies of the device's sounds, in bytes (for Settings). */
  padSoundsSize(): Promise<number> {
    return this.live.padSoundsSize()
  }

  /** Clears Live's copies of the device's sounds (Settings). */
  async clearPadSounds(): Promise<void> {
    this.previews.clear(PAD_PREVIEW)
    await this.live.clearPadSounds()
    // Offline, the device sounds only those copies had are dimmed now.
    await this.mirror.refreshOffline()
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
      const pak = await openPak(bytes)
      const d = describePak(pak)
      // An EP-1320 or EP-40 factory pack (someone's shared one, or one saved from the tool) is kept as that kit's straight away.
      const imported = FactorySounds.importKit(pak)
      if (imported !== null) {
        const kit = await this.saveKit(
          imported,
          bytes,
          d,
          d.generatedAt ?? (lastModified !== null && lastModified !== 0 ? lastModified : this.deps.now()),
          BackupDevice(d.device.product, d.device.sku, '', d.device.osVersion),
        )
        this.store.update((st) => ({ ...st, freshId: kit.record.id }))
        this.toastSaved(kitSaved(imported, kit.record.soundCount), kit.copyError)
        // As with Use as factory sounds: else, with no EP-133 pack beside it, nothing would offer it.
        this.setFactoryKit(imported)
        return
      }
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
   * Downloads [kit]'s factory sounds (the EP-133's or the EP-40's) from
   * teenage engineering's EP Sample Tool and keeps them in the library
   * (FactorySounds), as a task: the progress sheet shows how much has come,
   * and Cancel stops it. The EP-40's are Live's kit from then on.
   */
  async getFactorySounds(kit: FactoryKit = FactoryKit.EP133): Promise<void> {
    const net = this.deps.factory
    // A downloadable kit only: the EP-1320's has none (useAsFactory).
    const dl = FactorySounds.download(kit)
    if (net === undefined || dl === null || FactorySounds.inLibrary(this.store.get().backups, kit) !== null) return
    // Tapped while something else runs (a read as the page starts, a transfer): it goes next, not never.
    if (this.store.get().busy) await this.store.waitFor((st) => !st.busy)
    if (FactorySounds.inLibrary(this.store.get().backups, kit) !== null) return
    const saved = await this.tasks.runTask(FeatureText.GETTING_FACTORY, async (onProgress, signal) => {
      try {
        const path = await FactorySounds.locate((p) => net.text(p, signal), kit)
        const bytes = await net.bytes(path, signal, (done, total) => {
          const all = Math.max(total ?? dl.knownSize, done)
          onProgress({ fraction: done / all, label: FeatureText.factoryProgress(done, all) })
        })
        const pak = await openPak(bytes)
        if (!FactorySounds.isFactory(pak, kit)) throw new Error(kit === FactoryKit.EP40 ? FeatureText.NOT_FACTORY_40 : FeatureText.NOT_FACTORY)
        const d = describePak(pak)
        return await this.deps.library.save(
          this.record(
            kitTitle(kit),
            d.generatedAt ?? this.deps.now(),
            kit.source,
            dl.fileName,
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
    this.toastSaved(kitSaved(kit, saved.record.soundCount), saved.copyError)
    // The EP-133's leave the kit as it is; the EP-40's were asked for to be played.
    if (kit === FactoryKit.EP40) this.setFactoryKit(kit)
  }

  /** The factory kit Live plays offline (FactoryKit): the one chosen while its pack is saved, else the EP-133's. */
  get factoryKit(): FactoryKit {
    return this.live.factoryKit()
  }

  /**
   * Live offline plays [kit]'s factory sounds from now on (kept in the
   * settings), and opens again on its first project.
   */
  setFactoryKit(kit: FactoryKit): void {
    if (kit.id === this.deps.settings.settings.factoryKit) return
    this.changeSettings((s) => ({ ...s, factoryKit: kit.id }))
    this.mirror.kitChanged()
  }

  /**
   * Connected to a device whose kit's pack is saved (its sku, FactoryKit.ofSku)
   * and isn't the one chosen: that kit is chosen, so Live offline opens on
   * the kit of the device used last.
   */
  private deviceKit(sku: string): void {
    const kit = FactoryKit.ofSku(sku)
    if (kit === null || kit.id === this.deps.settings.settings.factoryKit || FactorySounds.inLibrary(this.store.get().backups, kit) === null) return
    this.setFactoryKit(kit)
  }

  /**
   * Copies [b], a backup of an EP-1320 Medieval, into the library as the
   * EP-1320's factory sounds (FactoryKit.EP1320), as a task: teenage
   * engineering offers no download for it. The backup stays as it is; an
   * older copy is replaced, and Live plays the EP-1320's kit from now on.
   */
  async useAsFactory(b: BackupRecord): Promise<void> {
    // A factory pack already (either kit's): nothing to copy.
    if (FactorySounds.isFactorySource(b.source)) return
    // Tapped while something else runs: it goes next, not never.
    if (this.store.get().busy) await this.store.waitFor((st) => !st.busy)
    const saved = await this.tasks.runTask(
      FeatureText.SAVING_FACTORY,
      async () => {
        const bytes = await this.deps.library.bytes(b.id)
        const pak = await openPak(bytes)
        if (!FactorySounds.fitsKit(pak, FactoryKit.EP1320)) throw new Error(FeatureText.NOT_MEDIEVAL)
        const d = describePak(pak)
        return this.saveKit(FactoryKit.EP1320, bytes, d, this.deps.now(), BackupDevice(d.device.product, d.device.sku, '', d.device.osVersion))
      },
      { device: false },
    )
    if (saved === null) return
    this.store.update((st) => ({ ...st, freshId: saved.record.id }))
    this.toastSaved(FeatureText.factory1320Saved(saved.record.soundCount), saved.copyError)
    this.setFactoryKit(FactoryKit.EP1320)
  }

  /**
   * Saves [bytes] as [kit]'s factory pack (the EP-1320's: a copy of a backup,
   * or an imported pack; the EP-40's: an imported pack), then deletes any
   * older one of that kit.
   */
  private async saveKit(
    kit: FactoryKit,
    bytes: Uint8Array,
    d: PakDescription,
    createdAt: number,
    device: BackupDevice,
  ): Promise<{ record: BackupRecord; copyError: string | null }> {
    const older = this.store.get().backups.filter((r) => r.source === kit.source)
    const saved = await this.deps.library.save(
      this.record(kitTitle(kit), createdAt, kit.source, kitFileName(kit), device, d),
      bytes,
      d.soundNames,
    )
    for (const r of older) {
      try {
        await this.deps.library.delete(r.id)
      } catch {
        // Kept: the newest of a kit is the one Live plays.
      }
    }
    return saved
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

  setSkin(s: SkinChoice): void {
    this.changeSettings((cur) => ({ ...cur, skin: s }))
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
  /**
   * The mic key in Live's top bar: SAMPLE opens (from KEYS too: Live goes to
   * the pads for it), or closes while it is open. Call from the tap: the
   * output wakes in it.
   */
  toggleSample(): void {
    if (this.sample.open) return this.sample.exit()
    this.deps.liveAudio.resumeInGesture()
    if (this.settingsSignal.peek().liveKeys) this.setLiveKeys(false)
    this.sample.enter()
  }

  /** The review sheet's play key: the part kept, as KEEP would put it on the pad. Call from the tap. */
  playReview(): void {
    const r = this.sample.reviewSound()
    if (r === null) return
    void this.playNow(REVIEW_KEY, new Uint8Array(r.pcm.buffer, r.pcm.byteOffset, r.pcm.byteLength), r.channels, r.rate)
  }

  /** The review's sound stops (its key again, or the sheet closing). */
  stopReview(): void {
    if (this.deps.player.playing.peek() === REVIEW_KEY) this.deps.player.stop()
  }

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
    // The arp's line names its notes so.
    this.pattern.refreshArp()
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
  /** Make up for Bluetooth delay (Settings → Live). */
  setMakeUpDelay(on: boolean): void {
    this.changeSettings((s) => ({ ...s, makeUpDelay: on }))
  }

  setHaptics(on: boolean): void {
    this.changeSettings((s) => ({ ...s, haptics: on }))
  }

  /** The guide overlay was shown (it opens by itself only once, also across reinstalls). */
  setGuideSeen(): void {
    this.changeSettings((s) => ({ ...s, guideSeen: true }))
  }

  /** Try arc's progress (Tour.encode), as it ticks. */
  setTourSteps(steps: string): void {
    const before = this.deps.settings.settings
    this.changeTour(() => this.deps.settings.update((s) => ({ ...s, tourSteps: steps })) !== before)
  }

  /** Done, Not now or ×: the tour never starts by itself again, and neither does the guide overlay. */
  finishTour(): void {
    const before = this.deps.settings.settings
    this.changeTour(() => this.deps.settings.update((s) => ({ ...s, tourDone: true, guideSeen: true })) !== before)
  }

  /** Try arc again: the steps start over; tourDone stays as it is (never written back to false). */
  restartTour(): void {
    this.changeTour(() => this.deps.settings.clear('tourSteps'))
  }

  /** The tour's settings reach library.json only once there is a library (Tour.syncsIndex). */
  private changeTour(change: () => boolean): void {
    if (!change()) return
    const st = this.store.get()
    if (Tour.syncsIndex(st.folderPicked, st.backups.length)) void this.syncIndex()
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

  // ---------- takes: Live recorded (an addition) ----------

  /** Whether TAKE can work here: an output that records, and somewhere to keep takes. */
  get canRecord(): boolean {
    return this.deps.takes !== undefined && this.deps.liveAudio.arm !== undefined
  }

  /** Whether a take's Share is offered (only where the browser can share a file). */
  get canShareTakes(): boolean {
    return this.deps.share.canShareFiles?.() === true
  }

  /** Whether a take's Voice is offered: it is shared, and needs an Opus encoder. */
  get canShareVoice(): boolean {
    return this.canShareTakes && this.deps.voice !== undefined
  }

  private async loadTakes(): Promise<void> {
    const store = this.deps.takes
    if (!store) return
    let takes: TakeInfo[] = []
    try {
      takes = await store.list()
    } catch {
      // As Kotlin's getOrDefault(emptyList()).
    }
    this.store.update((st) => ({ ...st, takes }))
  }

  /** TAKE (REC before RECORD was the pattern's): arms a take (the next sound starts it), or stops the one going. Call from a tap. */
  toggleRec(): void {
    const audio = this.deps.liveAudio
    if (this.rec.peek().kind !== 'idle') {
      audio.stopRecording?.()
      return
    }
    if (!this.canRecord || audio.arm?.() !== true) this.toast(MirrorText.NO_OUTPUT, true)
  }

  /** TAKE (REC's new name, in Live tools): as [toggleRec]. */
  toggleTake(): void {
    this.toggleRec()
  }

  /** A take ended: saved, nothing played, or not kept. */
  private async takeDone(take: RecordedTake | null, limit: boolean): Promise<void> {
    const store = this.deps.takes
    if (!take || !store) return
    try {
      const t = await store.add(take, this.deps.now())
      this.trafficLog.note(`take ${t.name}: ${take.seconds.toFixed(1)} s`)
      await this.loadTakes()
      this.toast(limit ? MirrorText.takeAtLimit(take.seconds) : MirrorText.takeSaved(take.seconds))
    } catch (e) {
      this.toast(MirrorText.takeFailed(errorText(e)), true)
    }
  }

  /** The player's key for a take, to show Stop on its row. */
  takeKey(t: TakeInfo): string {
    return 'take:' + t.name
  }

  private async takeBytes(t: TakeInfo): Promise<Uint8Array> {
    const wav = await this.deps.takes?.read(t.name)
    if (!wav) throw new Error(`${t.name}: not found`)
    return new Uint8Array(await wav.arrayBuffer())
  }

  /** Plays a take here (a list's single sound: it stops the one before). Call from a tap. */
  async playTake(t: TakeInfo): Promise<void> {
    this.deps.player.resumeInGesture()
    const token = ++this.playToken
    let w
    try {
      w = decodeWav(await this.takeBytes(t))
    } catch (e) {
      this.toast(errorText(e), true)
      return
    }
    if (token !== this.playToken) return
    await this.startSound(this.takeKey(t), w.pcm, w.channels, w.sampleRate)
  }

  async deleteTake(t: TakeInfo): Promise<void> {
    if (this.deps.player.playing.peek() === this.takeKey(t)) this.stopPlayback()
    try {
      await this.deps.takes?.delete(t.name)
    } catch (e) {
      this.toast(errorText(e), true)
    }
    await this.loadTakes()
  }

  /** Saves a take's WAV. Call from a tap. */
  saveTake(t: TakeInfo): Promise<void> {
    return this.saveFile(t.name, () => this.takeBytes(t), WAV_MIME)
  }

  /** Shares a take's WAV. Call from a tap. */
  async shareTake(t: TakeInfo): Promise<void> {
    try {
      const r = await this.deps.share.share(t.name, () => this.takeBytes(t), WAV_MIME, t.name)
      if (r === 'saved') this.toast(WebText.savedInstead(t.name))
    } catch {
      this.toast(MirrorText.SHARE_TAKE_FAILED, true)
    }
  }

  /** A take as a voice message (Ogg Opus, mono): the bytes VOICE shares. Rejects when it can't be made. */
  async takeVoice(t: TakeInfo): Promise<Uint8Array> {
    const voice = this.deps.voice
    if (!voice) throw new Error(MirrorText.NO_VOICE_ENCODER)
    const w = decodeWav(await this.takeBytes(t))
    const pcm = voicePcm(w.pcm, w.channels, w.sampleRate)
    let made: { packets: Uint8Array[]; config: Uint8Array | null }
    try {
      made = await voice.encodeOpus(new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1))
    } catch {
      throw new Error(MirrorText.VOICE_FAILED)
    }
    return oggOpusFile(made.packets, 1, preSkipOf(made.config), w.sampleRate, pcm.length >> 1)
  }

  /** VOICE: shares a take as Ogg Opus, which Telegram sends as a voice message; no text, which it would add as a caption. Call from a tap. */
  async shareTakeVoice(t: TakeInfo): Promise<void> {
    const name = MirrorText.voiceFileName(t.name)
    try {
      const r = await this.deps.share.share(name, () => this.takeVoice(t), OGG_MIME, name, '')
      if (r === 'saved') this.toast(WebText.savedInstead(name))
    } catch (e) {
      const m = errorText(e)
      this.toast(m === MirrorText.NO_VOICE_ENCODER || m === MirrorText.VOICE_FAILED ? m : MirrorText.SHARE_TAKE_FAILED, true)
    }
  }

  /**
   * Proposes a take for upload to a free slot: the Device tab's upload sheet,
   * with its trim. The UI switches to Device, which reads the device as it
   * opens; the free slot is picked once that read is in (10 s at most).
   */
  async takeToDevice(t: TakeInfo): Promise<void> {
    let bytes: Uint8Array
    try {
      bytes = await this.takeBytes(t)
    } catch (e) {
      this.toast(errorText(e), true)
      return
    }
    let contents = this.store.get().browser.contents
    if (contents === null) {
      contents = await Promise.race([
        this.store.waitFor((st) => st.browser.contents !== null).then((st) => st.browser.contents),
        new Promise<null>((r) => this.deps.setTimeout(() => r(null), 10_000)),
      ])
    }
    const w = decodeWav(bytes)
    const slot = nextFree(contents?.occupiedSlots ?? new Set<number>(), new Set<number>())
    const item: UploadDraftItem = { fileName: t.name, name: nameFor(t.name), slot, wav: bytes, error: null, trim: null, sampleRate: w.sampleRate }
    this.store.update((st) => ({ ...st, browser: { ...st.browser, draft: [item] } }))
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

  // ---------- BEAT CARDS: Live tools' CLAUDE section (MainActivity's shareBeat, clipboardText, copyProblems) ----------

  private readonly _beatPasting = signal(false)
  /** PASTE BEAT found the clipboard closed to the page: a box waits for a paste (web delta). */
  readonly beatPasting: ReadonlySignal<boolean> = this._beatPasting

  /**
   * SHARE (the scene playing when [group] is null): the card's prompt and text
   * through the share sheet, or, where the browser has none, copied to the
   * clipboard with a toast saying so. Nothing when there are no notes.
   */
  async shareBeat(group: number | null): Promise<void> {
    const share = this.pattern.beatShare(group, this.live.factoryKit())
    if (share === null) return
    await this.sendText(share.subject, share.text)
  }

  /** Learn with Claude where there is no link to follow: the starter prompt, shared or copied. */
  async learnWithClaude(): Promise<void> {
    await this.sendText(ClaudeText.LEARN_TITLE, WebText.LEARN_PROMPT)
  }

  private async sendText(subject: string, text: string): Promise<void> {
    try {
      const r = (await this.deps.share.shareText?.(subject, text)) ?? 'unsupported'
      if (r !== 'unsupported') return
      const cb = this.deps.clipboard
      if (!cb) throw new Error(ClaudeText.NO_APP)
      await cb.writeText(text)
      this.toast(WebText.CARD_COPIED)
    } catch (e) {
      this.toast(errorText(e), true)
    }
  }

  /**
   * PASTE BEAT: the clipboard's text, read as a beat card (its sheet opens, or
   * a toast says there is no card). Where the page can't read the clipboard
   * (the browser has no readText, or says no), a box waits for a paste
   * instead ([beatPasting]).
   */
  async pasteBeat(): Promise<void> {
    const read = this.deps.clipboard?.readText
    if (read) {
      try {
        const text = await read.call(this.deps.clipboard)
        this._beatPasting.value = false
        await this.pattern.receiveBeat(text)
        return
      } catch {
        // Denied: the paste box below.
      }
    }
    this._beatPasting.value = true
  }

  /** A text pasted on Live, or into PASTE BEAT's box: a beat card's sheet opens, else the toast says there is none. */
  async receiveBeat(text: string | null): Promise<void> {
    this._beatPasting.value = false
    await this.pattern.receiveBeat(text)
  }

  /** Open a card file (the link under PASTE BEAT): a .txt or .md with Claude's card in it, from the file picker. */
  async openBeatFile(): Promise<void> {
    const files = await this.deps.files.pick({ accept: '.txt,.md,.markdown,text/plain,text/markdown' })
    const file = files[0]
    if (file) await this.receiveBeatFile(file)
  }

  /** A card file picked or dropped on the page: its text, as receiveBeat takes it; one longer than a card has none. */
  async receiveBeatFile(file: { readonly size: number; text(): Promise<string> }): Promise<void> {
    const text = file.size <= BeatCards.MAX_CARD_FILE ? await file.text().catch(() => null) : null
    await this.receiveBeat(text)
  }

  /** PASTE BEAT's box closed without a paste. */
  cancelBeatPaste(): void {
    this._beatPasting.value = false
  }

  /** COPY PROBLEMS: what the sheet lists, for Claude to read when pasted back into the chat. */
  async copyProblems(problems: readonly CardProblem[]): Promise<void> {
    try {
      const cb = this.deps.clipboard
      if (!cb) throw new Error(ClaudeText.NO_APP)
      await cb.writeText(ClaudeText.problemsReport(problems))
      this.toast(ClaudeText.PROBLEMS_COPIED)
    } catch (e) {
      this.toast(errorText(e), true)
    }
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

/** The key the review sheet's take plays under (SoundPlayer.playing). */
export const REVIEW_KEY = 'sample:review'

/** " 2 samples kept in Takes." after a toast, when [n] recordings went there. */
function samplesMoved(n: number): string {
  return n > 0 ? ' ' + MirrorText.samplesToTakes(n) : ''
}

/** Whether two offline changes are the same one (OfflinePad's equality). */
function sameChange(a: OfflinePad, b: OfflinePad): boolean {
  return (
    a.project === b.project &&
    a.group === b.group &&
    a.pad === b.pad &&
    a.slot === b.slot &&
    a.name === b.name &&
    a.source === b.source &&
    (a.file ?? null) === (b.file ?? null)
  )
}

/** [kit]'s factory pack's title in the library. */
function kitTitle(kit: FactoryKit): string {
  return kit === FactoryKit.EP1320 ? FeatureText.FACTORY_TITLE_1320 : kit === FactoryKit.EP40 ? FeatureText.FACTORY_TITLE_40 : FeatureText.FACTORY_TITLE
}

/** [kit]'s factory pack's file name in the library. */
function kitFileName(kit: FactoryKit): string {
  return FactorySounds.download(kit)?.fileName ?? FactorySounds.FILE_NAME_1320
}

/** The toast once [kit]'s factory pack is saved, with its [sounds]. */
function kitSaved(kit: FactoryKit, sounds: number): string {
  return kit === FactoryKit.EP1320
    ? FeatureText.factory1320Saved(sounds)
    : kit === FactoryKit.EP40
      ? FeatureText.factory40Saved(sounds)
      : FeatureText.factorySaved(sounds)
}
