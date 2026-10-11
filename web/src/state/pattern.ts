// Port of app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt (PATTERN: record and play on the phone)
//
// Live's pattern: the transport (RECORD, PLAY, the count-in), recording the
// pads and KEYS notes played into the project's patterns on TIMING's grid,
// the sequencer playing them on Live's output (PatternScheduler, in its
// worklet), the sheet's edits (length, ×2, CLEAR, UNDO) and its settings, and
// every project's patterns kept.
//
// Web deltas:
// - A class of its own over a [PatternHost], as LiveSounds is; the
//   controller hands it the presses and releases, and shows its [ui].
// - The patterns are kept in the library database's kv store
//   (Library.readPatterns / writePatterns), Android's files/patterns.json.
// - The settings are PatternPrefs (localStorage), not AppSettings.
// - No arp, SAMPLE's PTN take or Bluetooth delay make-up yet: the tick heard
//   is the tick stamped.
// - SCENES (ScenePlan.kt's SceneDesk) are this desk's too: ArcController's
//   SCENES section lives here, a pick's tick no earlier than the
//   sequencer's free tick as the output's stamps last told it.
// - STEP (StepPlan.kt's StepDesk) and CORRECT are this desk's, as ERASE is:
//   ArcController's STEP section lives here, the controller routing the
//   presses to it.
// - The follow loop is a timer (setTimeout), not a coroutine; the click for
//   the count-in is the sequencer's own (PatternScheduler).
// - Times are performance.now() milliseconds where Kotlin's are System.nanoTime.

import { signal, type ReadonlySignal, type Signal } from '@preact/signals'
import { physicalPad, type PhysicalPad } from '../core/features/padNotes'
import { Pattern, Patterns, ProjectPatterns, ProjectSeq, Seq, TimingSettings, type Timing } from '../core/features/pattern'
import { PatternRecorder } from '../core/features/patternRecorder'
import { frameAt } from '../core/features/sampleTiming'
import { Steps } from '../core/features/steps'
import type { SwitchTime } from '../core/features/scenes'
import { NoteNames, ROOT_NOTE } from '../core/features/keys'
import { PhaseAnchors, passOf, positionOf, tickAt as clockTickAt, msOf, type PatternPosition } from '../core/features/sequencer'
import { Transport, type TransportAction } from '../core/features/transport'
import { ClockFollow, TapTempo, Tempo, type Beat, type BeatGrid } from '../core/features/tempo'
import type { MidiEvent } from '../core/protocol/midiInput'
import { ArpSettings, type ArpNote, type ArpOrder } from '../core/features/arp'
import { OutputDelay } from '../core/features/outputDelay'
import { BeatCards, type CardRead } from '../core/features/beatCard'
import { ClaudeText } from '../core/text/claudeText'
import { FeatureText } from '../core/text/featureText'
import { MirrorText } from '../core/text/mirrorText'
import type { PatternPrefs, PatternSettings } from '../platform/storage/settings'
import type { VoiceShape } from '../core/formats/voiceMixer'
import type { ArpStep, Deps, LiveTimeline } from './deps'
import type { LiveSounds } from './live'
import { sameShape } from './padShape'
import {
  ERASE_TAP_MS,
  PATTERN_UI,
  countInBeat,
  heldNotesEnded,
  patternBpm,
  patternShown,
  patternVoices,
  pressPlace,
  pressSkip,
  pressTickAt,
  sameVoices,
  withoutNote,
  type PatternUiState,
} from './patternPlan'
import { ARP_PRESSURE_MS, ARP_UI, ArpDesk, type ArpUi } from './arpPlan'
import { applyBeat, beatImportUi, beatImported, beatShare, type BeatApplied, type BeatImportUi, type BeatShare } from './beatPlan'
import { ClipMode, PadStage, SCENE_UI, SceneDesk, type SceneUi } from './scenePlan'
import { CORRECT_SHOWN_MS, STEP_UI, StepDesk, arpTakesPress, auditionMs, stepOpens, stepWord, type StepNote, type StepUi } from './stepPlan'
import type { Store } from './store'
import type { UiState } from './types'

/** A count-in's bar 1 starts this much later still: time for the click to start before its first beat. */
export const COUNT_IN_LEAD_MS = 150

/** The transport's loop wakes at least this often (ms). */
export const PATTERN_LOOP_MS = 100

/** And this often while ERASE is held on a pad, so the notes go before the sequencer sends them. */
export const PATTERN_ERASE_MS = 20

/** How often the click looks whether the EP-133's clock came or went (ms). */
const CLICK_WATCH_MS = 500


/** A pick waiting takes over once the playhead heard is this far past its tick (Kotlin SCENE_GRACE_NS). */
const SCENE_GRACE_MS = 100

/** How far ahead of the mix the sequencer sends notes (PatternScheduler's LOOKAHEAD_MS). */
const LOOKAHEAD_MS = 50

export { ERASE_TAP_MS }

/** A pad (a KEYS note on it: [semitones]) held in ERASE from [downAt]; [from] is the tick it has erased to, once it holds. */
interface EraseHold {
  readonly pad: PhysicalPad
  readonly semitones: number | null
  readonly downAt: number
  from: number | null
}

const eraseKey = (pad: PhysicalPad, semitones: number | null): string => `${pad.group}:${pad.offset}:${semitones ?? 'n'}`

export interface PatternHost {
  store: Store<UiState>
  deps: Pick<Deps, 'liveAudio' | 'library' | 'perfNow' | 'setTimeout' | 'clearTimeout'>
  prefs: PatternPrefs
  live: Pick<LiveSounds, 'patternVoice' | 'loadForPattern' | 'audition' | 'auditionsEnd'>
  toast(text: string, error?: boolean): void
  /** How [pad]'s (pad key) voices play: its sound settings and FX bus; [keys]: its KEYS notes. */
  shapeOf?(pad: number, keys: boolean): Partial<VoiceShape>
  /** A note as STEP's status line names it (stepWord: the KEYS note, the pad's sound, else the pad). */
  stepWord?(n: StepNote): string
  /** How KEYS names its notes (the arp's line); letters when not given. */
  noteNames?(): NoteNames
  /** [pad]'s sound name as Live shows it (a beat card's rows), or null. */
  padName?(pad: PhysicalPad): string | null
}

/** The plan last handed to the sequencer, to tell when a new one changes anything. */
interface SentPlan {
  readonly patterns: ProjectPatterns
  readonly skip: ReadonlyMap<number, number>
  readonly bpm: number
  readonly voices: ReadonlyMap<number, string>
  readonly shapes: ReadonlyMap<number, Partial<VoiceShape>>
  readonly keysShapes: ReadonlyMap<number, Partial<VoiceShape>>
  readonly queued: ReadonlyMap<number, { readonly pattern: Pattern; readonly atTick: number }>
  readonly phase: PhaseAnchors
}

export class PatternDesk {
  private readonly _ui: Signal<PatternUiState>
  /** PATTERN, for Live's line and the pattern sheet; where it is in the loop is [position]. */
  readonly ui: ReadonlySignal<PatternUiState>
  private settings: PatternSettings
  // Every project's patterns, read once; something recorded before they were read is newer than what was kept.
  private patterns: Patterns = Patterns.EMPTY
  private loaded = false
  private touched = false
  private saving: Promise<void> = Promise.resolve()
  // The project the patterns are (0: none known yet), its sequencer, and the patterns its scene plays.
  private project = 0
  private seq: ProjectSeq = ProjectSeq.DEFAULT
  private current: ProjectPatterns = ProjectSeq.playing(ProjectSeq.DEFAULT)
  // A recorder (and its UNDO) for each project this session.
  private readonly recorders = new Map<number, PatternRecorder>()
  private readonly transport = new Transport()
  // The pads and notes held while recording, by their voice's key: their notes, for the gate.
  private readonly held = new Map<string, number>()
  private countedIn = false
  // A held note's start moved off where it was heard (pressPlace): its release moves as far.
  private readonly shifts = new Map<number, number>()
  // The pass of each note recorded that was heard live as it was played (by its id): not played again.
  private skip: ReadonlyMap<number, number> = new Map()
  // The groups recorded into since the punch-in: each of their passes is an UNDO step.
  private readonly groups = new Set<number>()
  // Pad sounds loading for the patterns, and those found nowhere (asked again at the next PLAY).
  private readonly loading = new Set<number>()
  private readonly tried = new Set<number>()
  private loop: unknown = null
  // The press a pad started this run with (tick 0 there), for the presses before its timeline is out.
  private pressAt: number | null = null
  // The timeline of the run before the transport last started: not this run's.
  private stale: LiveTimeline | null = null
  private sent: SentPlan | null = null
  // ERASE held on pads while playing, by eraseKey.
  private readonly eraseHolds = new Map<string, EraseHold>()
  private readonly cleanups: (() => void)[] = []
  // TEMPO: the click (on or off, never kept) and the phone's tempo; the EP-133's clock followed; tap tempo.
  private readonly _metronome: Signal<Metronome>
  /** TEMPO's click: on or off, and the phone's tempo (Kotlin MetronomeUi). */
  readonly metronome: ReadonlySignal<Metronome>
  private readonly _beats = signal<Beat | null>(null)
  /** Each beat for TEMPO's light, with when it is heard: the click's while it sounds, else the EP-133's from its clock. */
  readonly beats: ReadonlySignal<Beat | null> = this._beats
  private readonly clockFollow = new ClockFollow()
  // STEP: the panel and CORRECT (StepPlan.kt's StepDesk), what Live shows of them, and the line's count going.
  private readonly stepDesk: StepDesk
  private readonly _step: Signal<StepUi> = signal(STEP_UI)
  /** STEP as Live shows it: the panel, its cursor's step, CORRECT and the status line. */
  readonly step: ReadonlySignal<StepUi> = this._step
  private stepShown: unknown = null
  // SCENES: the scenes, the picks waiting and the CLIP row (ScenePlan.kt's SceneDesk), what Live shows of them,
  // and the pads whose unsure press the PAD flow waits to take.
  private readonly sceneDesk: SceneDesk
  private readonly _scene: Signal<SceneUi> = signal(SCENE_UI)
  /** SCENES as Live shows them: the scene, its groups' patterns and what waits, the panel and its CLIP row. */
  readonly scene: ReadonlySignal<SceneUi> = this._scene
  private readonly sceneTaps = new Set<string>()
  private readonly taps = new TapTempo()

  constructor(private readonly host: PatternHost) {
    this.settings = host.prefs.load()
    this._ui = signal(this.withSettings(PATTERN_UI))
    this.ui = this._ui
    this._metronome = signal<Metronome>({ on: false, bpm: this.settings.liveTempo })
    this.stepDesk = new StepDesk((n) => host.stepWord?.(n) ?? stepWord(n, null, NoteNames.LETTERS))
    this.sceneDesk = new SceneDesk((pad) => host.stepWord?.({ pad, semitones: null }) ?? stepWord({ pad, semitones: null }, null, NoteNames.LETTERS))
    this.metronome = this._metronome
    const audio = host.deps.liveAudio
    if (audio.onSeqMissing) this.cleanups.push(audio.onSeqMissing(() => this.refreshPlan()))
    // A step the arp played while the pattern runs: recorded here.
    if (audio.onArpStep) this.cleanups.push(audio.onArpStep((step) => this.recordArpStep(step)))
    this._arp.value = this.arpDesk.ui(this.settings.arpOn, this.settings.arp, this.settings.timing, this.noteNames())
    if (audio.onBeat) this.cleanups.push(audio.onBeat((b) => (this._beats.value = b)))
    // The output went (Live left the screen long, or a new output): the transport stops with it.
    if (audio.timeline) {
      this.cleanups.push(
        audio.timeline.subscribe((tl) => {
          if (!this.running()) return
          if (tl !== null && (this.stale === null || tl.clock !== this.stale.clock)) this.sawTimeline = true
          else if (tl === null && this.sawTimeline) this.stop()
        }),
      )
    }
  }

  /** Whether this desk can play at all: Live's output has a sequencer. */
  get available(): boolean {
    return this.host.deps.liveAudio.seqPlay !== undefined
  }

  dispose(): void {
    this.cancelArpPressure()
    this.stopLoop()
    this.cancelCorrectedShown()
    this.watchClick(false)
    for (const c of this.cleanups.splice(0)) c()
  }

  /** The patterns kept, read once; what was recorded before they were read is kept over them. */
  async load(): Promise<void> {
    if (this.loaded) return
    let read: Patterns
    try {
      const json = await this.host.deps.library.readPatterns()
      read = json === null ? Patterns.EMPTY : (Patterns.fromJson(json) ?? Patterns.EMPTY)
    } catch {
      read = Patterns.EMPTY
    }
    if (this.loaded) return
    this.loaded = true
    if (this.touched) {
      this.patterns = Patterns.put(read, this.project, this.seq)
      this.save()
      return
    }
    this.patterns = read
    this.useSeq(Patterns.of(read, this.project))
    this.refreshPlan()
    this.show()
  }

  /** Keeps every project's patterns (none forgets them). */
  private save(): void {
    if (!this.loaded) return
    const all = Patterns.put(this.patterns, this.project, this.seq)
    this.patterns = all
    const lib = this.host.deps.library
    this.saving = this.saving.then(async () => {
      // Newer patterns are on their way.
      if (this.patterns !== all) return
      try {
        await lib.writePatterns(all.projects.size === 0 ? null : Patterns.toJson(all))
      } catch {
        // Kept in memory for this session.
      }
    })
  }

  /** Waits for the patterns to be written (tests, the page going). */
  flush(): Promise<void> {
    return this.saving
  }

  /** Live shows [project]: the transport stops, the patterns are kept, and that project's come in. */
  async switchProject(project: number): Promise<void> {
    await this.load()
    if (project === this.project) return
    // The scene panel and its picks waiting are the other project's: dropped, not applied by the STOP.
    this.sceneDesk.reset()
    this.sceneTaps.clear()
    // The arp's notes were the other project's pads.
    this.arpClear()
    this.stop()
    this.closeStep()
    this.save()
    this.project = project
    this.stepDesk.project = project
    this.useSeq(Patterns.of(this.patterns, project))
    this.skip = new Map()
    this.tried.clear()
    this._ui.value = { ...this._ui.peek(), project }
    this.refreshPlan()
    this.show()
  }

  /** The device's tempo changed (or stopped coming): the plan follows. */
  tempoChanged(): void {
    this.refreshPlan()
    this.publishArp()
  }

  private get recorder(): PatternRecorder {
    let r = this.recorders.get(this.project)
    if (r === undefined) {
      r = new PatternRecorder()
      this.recorders.set(this.project, r)
    }
    return r
  }

  private useSeq(seq: ProjectSeq): void {
    this.seq = seq
    this.current = ProjectSeq.playing(seq)
    this.recorder.seq = seq
  }

  /** The project's patterns are [p] now: the sequencer and the line follow, and (not recording) they are kept. */
  private setPatterns(p: ProjectPatterns): void {
    if (p === this.current) return
    this.seq = ProjectSeq.withPlaying(this.seq, p)
    this.current = p
    this.recorder.seq = this.seq
    this.touched = true
    this.refreshPlan()
    this.show()
    if (!this.transport.state.recording) this.save()
  }

  private show(): void {
    this._ui.value = this.withSettings(patternShown(this._ui.peek(), this.current, this.transport.state, this.recorder.canUndo))
    this.publishStep()
    this.publishScene()
    // A beat card waiting on its sheet is planned into the patterns as they are now (another project, a pick, a recording).
    const waiting = this._beat.peek()
    if (waiting !== null) this.showBeat(waiting.read)
  }

  /** The project's sequencer is [seq] now (a scene or pattern picked, a scene edited): the plan and Live follow, and it is kept. */
  private setSeq(seq: ProjectSeq): void {
    if (seq === this.seq) return
    this.useSeq(seq)
    this.touched = true
    this.refreshPlan()
    this.show()
    if (!this.transport.state.recording) this.save()
  }

  private withSettings(ui: PatternUiState): PatternUiState {
    const s = this.settings
    return { ...ui, timing: TimingSettings.record(s.timing), timingSettings: s.timing, countInOn: s.countIn, autoLength: s.autoLength }
  }

  /** The pattern's tempo: the EP-133's while it sends its clock, else Live's own. */
  private bpm(): number {
    return patternBpm(this.host.store.get().mirror?.state.bpm, this.settings.liveTempo)
  }

  /**
   * Hands the sequencer what it plays: the patterns, the sounds of their pads
   * in memory, the passes heard live and the tempo. Not when nothing
   * changed. Pads whose sounds aren't in memory load quietly; the line counts them.
   */
  refreshPlan(): void {
    const audio = this.host.deps.liveAudio
    if (!audio.seqPlan) return
    const p = this.current
    // Where each pattern started, for the recording's ticks as for the sequencer's.
    const phase = this.sceneDesk.phase
    this.recorder.phase = phase
    // The picks waiting, as the patterns that take over: read from the sequencer as it stands.
    const queued = new Map<number, { readonly pattern: Pattern; readonly atTick: number }>()
    for (const [g, q] of this.sceneDesk.targets(this.seq)) queued.set(g, { pattern: ProjectSeq.pattern(this.seq, g, q.to), atTick: q.at })
    const pads = ProjectPatterns.usedPads(p)
    for (const [g, q] of queued) for (const n of Pattern.playable(q.pattern)) pads.add(g * 12 + n.offset)
    const { voices, missing } = patternVoices(pads, (pad) => this.host.live.patternVoice(pad))
    const bpm = this.bpm()
    const shapes = new Map<number, Partial<VoiceShape>>()
    const keysShapes = new Map<number, Partial<VoiceShape>>()
    const shapeOf = this.host.shapeOf
    if (shapeOf) {
      for (const pad of voices.keys()) {
        shapes.set(pad, shapeOf(pad, false))
        keysShapes.set(pad, shapeOf(pad, true))
      }
    }
    const old = this.sent
    if (
      old === null ||
      old.patterns !== p ||
      old.skip !== this.skip ||
      old.bpm !== bpm ||
      old.phase !== phase ||
      !sameQueued(old.queued, queued) ||
      !sameVoices(old.voices, voices) ||
      !sameShapes(old.shapes, shapes) ||
      !sameShapes(old.keysShapes, keysShapes)
    ) {
      this.sent = { patterns: p, skip: this.skip, bpm, voices, shapes, keysShapes, queued, phase }
      audio.seqPlan({ patterns: p, voices, skip: this.skip, bpm, phase, shapes, keysShapes, queued })
    }
    for (const pad of missing) this.loadPad(pad)
    if (this._ui.peek().missing !== missing.size) this._ui.value = { ...this._ui.peek(), missing: missing.size }
  }

  private loadPad(pad: number): void {
    if (this.loading.has(pad) || this.tried.has(pad)) return
    this.loading.add(pad)
    void this.host.live.loadForPattern(pad).then(
      (ok) => {
        this.loading.delete(pad)
        if (!ok) this.tried.add(pad)
        this.refreshPlan()
      },
      () => {
        this.loading.delete(pad)
        this.tried.add(pad)
      },
    )
  }

  // ---------- the timeline ----------

  private timeline(): LiveTimeline | null {
    const tl = this.host.deps.liveAudio.timeline?.peek() ?? null
    return tl !== null && this.running() && (this.stale === null || tl.clock !== this.stale.clock) ? tl : null
  }

  // This run's timeline was out: one going away after that is the output going.
  private sawTimeline = false

  /** The tick heard at [ms] in this run: by its timeline, or before that is out, from the pad's press that started it. */
  private tickAt(ms: number): number | null {
    const tl = this.timeline()
    if (tl !== null) return clockTickAt(tl.clock, frameAt(tl.frames, ms))
    return this.pressAt !== null && this.running() ? pressTickAt(ms, this.pressAt, this.sent?.bpm ?? this.bpm()) : null
  }

  /**
   * How late Live's output is heard now (ms): what is made up for
   * (OutputDelay); 0 wired, with the setting off, or closed.
   */
  private heardDelay(): number {
    return this.host.deps.liveAudio.delayMs ?? 0
  }

  /**
   * The tick the player hears at [ms], as [tickAt] but through the output's
   * delay: what the playhead shows and where a live press lands. The
   * pattern's clock is arc's own and its notes stay where they are; only
   * what is lined up with the ear moves.
   */
  private heardTickAt(ms: number): number | null {
    const d = this.heardDelay()
    const tl = this.timeline()
    if (tl !== null) return clockTickAt(tl.clock, frameAt(tl.frames, ms)) - OutputDelay.ticks(d, tl.clock.bpm)
    return this.pressAt !== null && this.running() ? pressTickAt(ms - d, this.pressAt, this.sent?.bpm ?? this.bpm()) : null
  }

  private running(): boolean {
    const ph = this.transport.state.phase
    return ph === 'COUNT_IN' || ph === 'PLAYING'
  }

  /**
   * Where the focus group's pattern is heard at [ms] (performance.now()),
   * for the line's counter and its loop hairline; null while stopped or
   * before the transport is first heard.
   */
  position(ms: number): PatternPosition | null {
    if (!this.running()) return null
    const tl = this.timeline()
    if (tl === null) return null
    const g = Math.min(Math.max(this._ui.peek().focusGroup, 0), 3)
    return positionOf(clockTickAt(tl.clock, frameAt(tl.frames, ms)) - OutputDelay.ticks(this.heardDelay(), tl.clock.bpm), ProjectPatterns.group(this.current, g), 0)
  }

  // ---------- the transport ----------

  /** RECORD goes down at [at]: armed or disarmed; running, recording on or off. */
  recordDown(at: number): void {
    this.act(() => this.transport.recordDown(at))
  }

  /** RECORD comes up at [at]: held a while after it punched in, recording stops with it. */
  recordUp(at: number): void {
    this.act(() => this.transport.recordUp(at))
  }

  /**
   * PLAY: stopped, the patterns play from bar 1; armed, they record too,
   * after a bar's count-in (the setting) unless RECORD is held as PLAY is
   * pressed ([recordHeld]); running, they stop.
   */
  play(recordHeld = false): void {
    this.act(() => this.transport.play(recordHeld, this.settings.countIn))
  }

  /** Stops the transport (and recording, kept), and disarms RECORD. */
  stop(): void {
    this.act(() => this.transport.stop())
  }

  /** Recording stops (kept); PLAY goes on (SAMPLE opening, for a take of what it plays). */
  recordOff(): void {
    this.act(() => this.transport.punchOut())
  }

  /**
   * A pad or KEYS note played at [at]: with RECORD armed, the recording
   * starts right there, bar 1 on the press. True when it did: that press is the run's first note.
   */
  private padDown(at: number): boolean {
    if (this.transport.state.phase !== 'ARMED') return false
    this.act(() => this.transport.padDown(at))
    return this.transport.state.recording
  }

  private act(step: () => TransportAction): void {
    const was = this.transport.state
    const a = step()
    switch (a.type) {
      case 'Start':
        // The transport leaves STOPPED: the panel folds, and its auditions go (the notes ring on the same keys).
        this.closeStep()
        this.host.live.auditionsEnd()
        this.start(a.countInBars, a.record, a.at)
        break
      case 'Stop':
        this.stopRun(was.recording)
        break
      case 'PunchIn':
        this.punchIn(was.phase === 'COUNT_IN')
        break
      case 'PunchOut':
        this.punchOut()
        break
      case 'None':
        break
    }
    // Armed, Live's output keeps its stamp, so a pad's press finds the frame it was heard at.
    this.host.deps.liveAudio.seqArm?.(this.transport.state.phase === 'ARMED')
    this.show()
  }

  private start(countInBars: number, record: boolean, at: number | null): void {
    const audio = this.host.deps.liveAudio
    // PLAY starts the passes from 0: what was heard live in another run is played again.
    this.skip = new Map()
    this.held.clear()
    this.shifts.clear()
    this.groups.clear()
    this.tried.clear()
    this.pressAt = at
    this.sawTimeline = false
    // Every pattern starts at bar 1.
    this.sceneDesk.restart()
    this.countedIn = countInBars > 0
    this.stale = audio.timeline?.peek() ?? null
    this._ui.value = { ...this._ui.peek(), countIn: null }
    if (record) this.setPatterns(this.recorder.punchIn(this.current, true, this.settings.autoLength))
    this.refreshPlan()
    if (!audio.seqPlay || !audio.seqPlay(countInBars, countInBars > 0 ? COUNT_IN_LEAD_MS : 0, at)) {
      this.transport.stop()
      this.host.toast(MirrorText.NO_OUTPUT, true)
      return
    }
    this.follow()
  }

  private stopRun(wasRecording: boolean): void {
    this.stopLoop()
    if (wasRecording) {
      const tick = this.tickAt(this.host.deps.perfNow()) ?? 0
      this.setPatterns(this.recorder.punchOut(heldNotesEnded(this.current, this.recorder, this.held.values(), tick), tick))
    }
    this.host.deps.liveAudio.seqStop?.()
    // A pick still waiting takes over at once, as every change does while stopped.
    this.sceneFlush()
    this.pressAt = null
    this.held.clear()
    this.shifts.clear()
    this.eraseHolds.clear()
    if (this.stepDesk.holding) {
      this.stepDesk.holdsEnd(this.recorder)
      this.stepCorrectedShown()
    }
    this.skip = new Map()
    this._ui.value = { ...this._ui.peek(), countIn: null }
    this.refreshPlan()
    this.save()
  }

  private punchIn(fromStop: boolean): void {
    this.groups.clear()
    this.setPatterns(this.recorder.punchIn(this.current, fromStop, this.settings.autoLength))
  }

  private punchOut(): void {
    const tick = this.tickAt(this.host.deps.perfNow()) ?? 0
    // A pad or key still held ends its note here: a lift after the punch-out records nothing.
    const p = heldNotesEnded(this.current, this.recorder, this.held.values(), tick)
    this.held.clear()
    this.shifts.clear()
    this.setPatterns(this.recorder.punchOut(p, tick))
    this.save()
  }

  /** While the transport runs: the count-in's beats as they are heard (then PLAYING), AUTO length and the passes. */
  private follow(): void {
    this.stopLoop()
    const { deps } = this.host
    const tickOnce = (): void => {
      this.loop = null
      if (!this.running()) return
      const tl = this.timeline()
      let wait = PATTERN_LOOP_MS
      if (tl !== null) {
        this.sawTimeline = true
        const now = deps.perfNow()
        const tick = clockTickAt(tl.clock, frameAt(tl.frames, now))
        this.followTick(tick)
        const next = msOf(tl.clock, (Math.floor(tick / Seq.PPQN) + 1) * Seq.PPQN, tl.frames)
        wait = Math.min(Math.max(Math.floor(next - now) + 1, 1), this.eraseHolds.size === 0 && !this.stepDesk.holding ? PATTERN_LOOP_MS : PATTERN_ERASE_MS)
      } else {
        wait = 20
      }
      if (this.running()) this.loop = deps.setTimeout(tickOnce, wait)
    }
    this.loop = deps.setTimeout(tickOnce, 0)
  }

  private followTick(tick: number): void {
    if (this.transport.state.phase === 'COUNT_IN') {
      if (tick < 0) {
        // The count-in's beat as it is heard.
        const tl = this.timeline()
        const beat = countInBeat(tl === null ? tick : tick - OutputDelay.ticks(this.heardDelay(), tl.clock.bpm))
        if (this._ui.peek().countIn !== beat) this._ui.value = { ...this._ui.peek(), countIn: beat }
        return
      }
      this.transport.countedIn()
      this.show()
    }
    const graced = this.tickAt(this.host.deps.perfNow() - SCENE_GRACE_MS)
    if (graced !== null) this.sceneDue(graced)
    if (this.transport.state.recording && tick >= 0) {
      this.markPasses(tick)
      this.setPatterns(this.recorder.grow(this.current, tick))
    }
    this.eraseHeld()
    this.correctHeld()
  }

  // ---------- ERASE ----------

  /** ERASE on or off: on, a pad tapped erases its notes, and one held while playing erases them as they pass. */
  setErase(on: boolean): void {
    if (!on) this.eraseHolds.clear()
    // ERASE and CORRECT take the same presses: one goes off as the other comes on.
    if (on && this.stepDesk.correct) this.setStepCorrect(false)
    if (on) this.endPadStage()
    if (this._ui.peek().erase === on) return
    this._ui.value = { ...this._ui.peek(), erase: on }
  }

  /** Whether ERASE takes the pads' presses (it is on). */
  get erasing(): boolean {
    return this._ui.peek().erase
  }

  /** A pad (a KEYS note on it: [semitones]) pressed in ERASE at [at]: what it erases is known as it is let go of, or held. */
  erasePadDown(pad: PhysicalPad, at: number, semitones: number | null = null): void {
    this.eraseHolds.set(eraseKey(pad, semitones), { pad, semitones, downAt: at, from: null })
    // Held while playing: the loop looks more often.
    if (this.running() && this.loop !== null) {
      this.stopLoop()
      this.follow()
    }
  }

  /**
   * The pad pressed in ERASE let go of at [releasedAt]. A tap, or any press
   * while not playing, erases its every note (a toast says so); held while
   * playing, it erased its notes as they passed, up to here.
   */
  erasePadUp(pad: PhysicalPad, releasedAt: number, semitones: number | null = null): void {
    const k = eraseKey(pad, semitones)
    const h = this.eraseHolds.get(k)
    if (h === undefined) return
    this.eraseHolds.delete(k)
    const tl = this.timeline()
    if (tl === null || this.transport.state.phase !== 'PLAYING' || (h.from === null && releasedAt - h.downAt < ERASE_TAP_MS)) {
      const p = this.recorder.erasePad(this.current, pad, semitones)
      if (p === this.current) return
      this.setPatterns(p)
      this.host.toast(MirrorText.erased(pad))
      return
    }
    const from = h.from ?? Math.max(this.heardTickAt(h.downAt) ?? 0, 0)
    const to = clockTickAt(tl.clock, frameAt(tl.frames, releasedAt))
    if (to > from) this.setPatterns(this.recorder.eraseRange(this.current, pad, semitones, from, to))
  }

  /** The press in ERASE turned into a scroll: it erases nothing. */
  eraseCut(pad: PhysicalPad, semitones: number | null = null): void {
    this.eraseHolds.delete(eraseKey(pad, semitones))
  }

  /**
   * The pads held in ERASE while playing erase their notes as the playhead
   * passes, from where each was pressed on, a lookahead ahead: the notes
   * about to be sent go before they are. A hold shorter than a tap erases
   * nothing here ([erasePadUp] takes the pad's every note).
   */
  private eraseHeld(): void {
    if (this.eraseHolds.size === 0 || this.transport.state.phase !== 'PLAYING') return
    const tl = this.timeline()
    if (tl === null) return
    const now = this.host.deps.perfNow()
    const to = clockTickAt(tl.clock, frameAt(tl.frames, now + LOOKAHEAD_MS))
    let p = this.current
    for (const h of this.eraseHolds.values()) {
      if (now - h.downAt < ERASE_TAP_MS) continue
      const from = h.from ?? Math.max(this.heardTickAt(h.downAt) ?? 0, 0)
      if (to <= from) continue
      p = this.recorder.eraseRange(p, h.pad, h.semitones, from, to)
      h.from = to
    }
    this.setPatterns(p)
  }

  private stopLoop(): void {
    if (this.loop !== null) this.host.deps.clearTimeout(this.loop)
    this.loop = null
  }

  /** The groups recorded into start a new pass at [tick]: their next note is an UNDO step of its own. */
  private markPasses(tick: number): void {
    const t = Math.floor(Math.max(tick, 0))
    for (const g of this.groups) {
      const pat = ProjectPatterns.group(this.current, g)
      if (!pat.open) this.recorder.passed(g, passOf(t, Pattern.lengthTicks(pat), 0))
    }
  }

  // ---------- recording the presses ----------

  /**
   * A pad (a KEYS note on it: [semitones]) pressed at [pressedAt], its voice
   * [key] sounding: armed, the recording starts on it; recording, a note in
   * the pattern on TIMING's grid, its gate held until [release] ([hold];
   * else a step of the grid).
   */
  press(pad: PhysicalPad, semitones: number | null, key: string, pressedAt: number, hold: boolean): void {
    const first = this.padDown(pressedAt)
    if (!this.transport.state.recording) return
    const stamped = this.tickAt(pressedAt)
    // The player reacts to what is heard, which Bluetooth plays late: the press is where it was heard
    // (before the run is heard, see OutputDelay.placed). The press that started the run is its tick 0.
    const heard = this.heardTickAt(pressedAt)
    if (stamped === null || heard === null) return
    // A pick whose tick the press is past takes over first: the note goes to the pattern playing then.
    this.sceneDue(heard)
    this.groups.add(pad.group)
    const tick = pressPlace(first, stamped, heard, this.countedIn)
    this.markPasses(tick)
    const now = this.tickAt(this.host.deps.perfNow()) ?? tick
    const r = this.recorder.noteOn(this.current, pad, semitones, tick, now, TimingSettings.record(this.settings.timing), this.settings.timing.swing)
    if (r.id === 0) return
    const skip = pressSkip(r.skipPass, first, this.pressAt !== null && this.timeline() === null)
    if (skip !== null) this.skip = new Map([...this.skip, [r.id, skip]])
    // The same key again before it was let go of (another finger): the first note's gate ends here.
    const before = this.held.get(key)
    this.held.delete(key)
    const p = before !== undefined ? this.recorder.noteOff(r.patterns, before, tick) : r.patterns
    if (before !== undefined) this.shifts.delete(before)
    if (hold) {
      this.held.set(key, r.id)
      // Its release follows the note: it is heard where it is let go, and moved as far as the start was.
      if (tick !== heard) this.shifts.set(r.id, tick - heard)
    }
    this._ui.value = { ...this._ui.peek(), focusGroup: pad.group }
    this.setPatterns(p)
  }

  /** Voice [key] let go of at [releasedAt]: the note it recorded, if any, ends its gate there. */
  release(key: string, releasedAt: number): void {
    const id = this.held.get(key)
    if (id === undefined) return
    this.held.delete(key)
    const shift = this.shifts.get(id) ?? 0
    this.shifts.delete(id)
    const heard = this.heardTickAt(releasedAt)
    if (heard === null) return
    this.setPatterns(this.recorder.noteOff(this.current, id, heard + shift))
  }

  /** The press on [key] was a scroll after all: the note it recorded goes. */
  cut(key: string): void {
    const id = this.held.get(key)
    if (id === undefined) return
    this.held.delete(key)
    this.setPatterns(withoutNote(this.current, id))
  }

  // ---------- STEP: the pattern a step at a time while stopped, and timing correct (an addition) ----------

  /** Whether the STEP panel is open: the pads and keys place, pick or sound there, and never record into the pattern. */
  get stepping(): boolean {
    return this.stepDesk.open
  }

  /** Whether CORRECT takes the pads' presses: on, while the pattern plays (and neither STEP nor ERASE does). */
  get correcting(): boolean {
    return this.stepDesk.correct && this.transport.state.phase === 'PLAYING' && !this.stepDesk.open && !this.erasing
  }

  /**
   * The STEP panel opened ([on]) on [group] (Live's one group shown, or the
   * KEYS sound's), or closed (✕). It opens only while stopped (armed, RECORD
   * is disarmed first, as STOP does), and ERASE goes off. Closing lets go of
   * the pick, NUDGE, the panel's RECORD and its status; CORRECT stays.
   */
  setStepOpen(on: boolean, group: number = this.stepDesk.group): void {
    if (!on) {
      this.closeStep()
      return
    }
    if (this.stepDesk.open) {
      this.setStepGroup(group)
      return
    }
    if (!stepOpens(this.transport.state.phase)) return
    if (this.transport.state.phase === 'ARMED') this.stop()
    this.setErase(false)
    this.closeScene()
    this.arpClear()
    this.stepDesk.openOn(this.project, group)
    this.publishStep()
  }

  /** Live shows [group] now (another group, or the KEYS sound's): the panel steps through it, at that group's cursor. */
  setStepGroup(group: number): void {
    this.stepDesk.setGroup(group)
    this.publishStep()
  }

  /** The panel's RECORD goes down: while it is held, a pad or key tapped goes on the cursor's step. Not the transport's RECORD. */
  stepRecordDown(): void {
    this.stepAct(() => this.stepDesk.record(true))
  }

  /** The panel's RECORD comes up: a tap only sounds again. */
  stepRecordUp(): void {
    this.stepAct(() => this.stepDesk.record(false))
  }

  /** The panel's PLAY: the panel folds and the patterns play from bar 1 (CORRECT stays as it is). */
  stepPlay(): void {
    this.closeStep()
    this.play()
  }

  /**
   * A press in the open panel on [note] by voice [key], at the touch's
   * [pressure] (NaN: none told): with the panel's RECORD held it goes on the
   * cursor's step; with NUDGE waiting it is picked instead; else it only
   * sounds, and with CORRECT on its notes go onto the grid as it lets go.
   * True when it sounds (the caller plays it, never into the pattern).
   */
  stepDown(key: string, note: StepNote, pressure = Number.NaN): boolean {
    if (!this.stepDesk.open) return false
    const r = this.stepDesk.press(key, note, pressure, this.current, this.recorder, this.settings.timing)
    this.setPatterns(r.patterns)
    this.publishStep()
    return r.plays
  }

  /** The finger on voice [key] in the panel let go of: CORRECT's tap, or the end of − / +'s shift. */
  stepUp(key: string): void {
    if (!this.stepDesk.open) return
    this.setPatterns(this.stepDesk.release(key, this.current, this.recorder, this.settings.timing))
    this.publishStep()
  }

  /**
   * A long press on [note] in the panel: picked for − / + to nudge, when it
   * has a note on the cursor's step; picked already, it is let go of. False
   * when it has none there, and with CORRECT on.
   */
  stepPick(note: StepNote): boolean {
    if (!this.stepDesk.open) return false
    const picked = this.stepDesk.pick(note, this.current, this.recorder, this.settings.timing)
    this.publishStep()
    return picked
  }

  /**
   * The panel's − ([dir] -1) or + (1): with CORRECT on and a pad held, its
   * notes a tick earlier or later; else, a note picked, it is nudged and the
   * cursor follows it; else the cursor moves a step, wrapping round the
   * pattern, and its notes sound.
   */
  stepBy(dir: number): void {
    if (!this.stepDesk.open) return
    const r = this.stepDesk.minusPlus(dir, this.current, this.recorder, this.settings.timing)
    this.setPatterns(r.patterns)
    this.publishStep()
    if (r.audition) this.auditionStep()
  }

  /** The strip's step [step] tapped: the cursor jumps there and its notes sound; the pick goes. */
  stepJump(step: number): void {
    if (!this.stepDesk.open) return
    this.stepDesk.jump(step, this.current, this.recorder, this.settings.timing)
    this.publishStep()
    this.auditionStep()
  }

  /** BAR's page [bar] (from 0) tapped: the cursor jumps to that bar's first step, as [stepJump]. */
  stepPageTo(bar: number): void {
    if (!this.stepDesk.open) return
    this.stepDesk.page(bar, this.current, this.recorder, this.settings.timing)
    this.publishStep()
    this.auditionStep()
  }

  /** VEL's knob: every note on the cursor's step at [velocity], 1..127. A turn is one UNDO step ([stepKnobEnd]). */
  setStepVelocity(velocity: number): void {
    this.stepAct(() => this.setPatterns(this.stepDesk.velocity(velocity, this.current, this.recorder, this.settings.timing)))
  }

  /** LEN's knob: every note on the cursor's step [ticks] long, snapped to STEP_GATES. A turn is one UNDO step. */
  setStepGate(ticks: number): void {
    this.stepAct(() => this.setPatterns(this.stepDesk.gate(ticks, this.current, this.recorder, this.settings.timing)))
  }

  /** VEL's or LEN's knob let go of: the next turn is an UNDO step of its own. */
  stepKnobEnd(): void {
    this.recorder.endRun()
  }

  /** NUDGE latched ([on]): a tap picks its pad, as a long press does; off, the pick goes. CORRECT goes off with it on. */
  setStepNudge(on: boolean): void {
    this.stepAct(() => this.stepDesk.nudge(on, this.recorder))
  }

  /**
   * CORRECT on or off (timing correct, SHIFT + TIMING on the device): in the
   * panel a pad tapped puts its every note on TIMING's grid and swing; while
   * playing a pad held puts its notes on the grid as they play, the line
   * counting them. NUDGE and the pick go either way; ERASE goes off with it on.
   */
  setStepCorrect(on: boolean): void {
    if (on) this.setErase(false)
    // A pad tapped is corrected, not the PAD flow's.
    if (on) this.endPadStage()
    this.stepDesk.setCorrect(on, this.recorder)
    this.cancelCorrectedShown()
    this.publishStep()
  }

  /** A pad (a KEYS note on it: [semitones]) pressed at [at] with CORRECT on while playing: what it corrects is known as it is let go of, or held. */
  correctPadDown(pad: PhysicalPad, at: number, semitones: number | null = null): void {
    if (!this.stepDesk.correct) return
    this.cancelCorrectedShown()
    this.stepDesk.holdDown(eraseKey(pad, semitones), { pad, semitones }, at)
    this.publishStep()
    // Held while playing: the loop looks more often.
    if (this.running() && this.loop !== null) {
      this.stopLoop()
      this.follow()
    }
  }

  /**
   * The pad pressed with CORRECT on let go of at [releasedAt]. A tap, or any
   * press while not playing, puts its every note on the grid; held while
   * playing, it corrected its notes as they passed, up to here. The line says
   * how many, a moment longer.
   */
  correctPadUp(pad: PhysicalPad, releasedAt: number, semitones: number | null = null): void {
    const tl = this.transport.state.phase === 'PLAYING' ? this.timeline() : null
    const tickAt = tl === null ? null : (ms: number): number => clockTickAt(tl.clock, frameAt(tl.frames, ms))
    this.setPatterns(this.stepDesk.holdUp(eraseKey(pad, semitones), releasedAt, this.current, this.recorder, this.settings.timing, tickAt))
    this.publishStep()
    if (!this.stepDesk.holding) this.stepCorrectedShown()
  }

  /** Live's STEP follows the patterns, TIMING and the desk. */
  private publishStep(): void {
    if (this.stepDesk === undefined) return
    this._step.value = this.stepDesk.ui(this.current, this.settings.timing)
  }

  // [change] done on the desk, while the panel is open, and Live follows.
  private stepAct(change: () => void): void {
    if (!this.stepDesk.open) return
    change()
    this.publishStep()
  }

  /** The panel closes (✕, PLAY, the transport starting, another project), if it was open. */
  private closeStep(): void {
    if (!this.stepDesk.open) return
    this.stepDesk.close(this.recorder)
    this.publishStep()
  }

  /**
   * The notes on the cursor's step sound, each as a press of its pad (or
   * KEYS note) would, at its velocity: let go of after its gate at the
   * pattern's tempo, 60 ms to 1.5 s. Only from memory; the last audition's
   * notes still sounding are let go of first.
   */
  private auditionStep(): void {
    const { live } = this.host
    live.auditionsEnd()
    const t = this.settings.timing
    const g = this.stepDesk.group
    const notes = Steps.notesOn(ProjectPatterns.group(this.current, g), this.stepDesk.cursor(this.current, t.interval), t.interval, t.swing)
    const bpm = this.bpm()
    for (const n of notes) {
      // The pattern's own voice keys: a pad hit rings its pad, a KEYS note its key.
      const key = n.semitones !== null ? `seq:${g}:${n.offset}:${ROOT_NOTE + n.semitones}` : `live:${g}:${n.offset}`
      live.audition(key, physicalPad(g, n.offset), n.semitones, n.velocity, auditionMs(n.gate, bpm))
    }
  }

  /**
   * The pads held to correct while playing put their notes on the grid as
   * the playhead passes, a lookahead ahead, so the notes go before the
   * sequencer sends them, as [eraseHeld] does; the line counts them.
   */
  private correctHeld(): void {
    if (!this.stepDesk.holding || this.transport.state.phase !== 'PLAYING') return
    const tl = this.timeline()
    if (tl === null) return
    const now = this.host.deps.perfNow()
    const to = clockTickAt(tl.clock, frameAt(tl.frames, now + LOOKAHEAD_MS))
    this.setPatterns(this.stepDesk.held(this.current, this.recorder, this.settings.timing, to, now, (ms) => clockTickAt(tl.clock, frameAt(tl.frames, ms))))
    this.publishStep()
  }

  /** The line's count of the notes corrected while playing goes a moment after the last pad held lets go. */
  private stepCorrectedShown(): void {
    this.cancelCorrectedShown()
    this.stepShown = this.host.deps.setTimeout(() => {
      this.stepShown = null
      this.stepDesk.correctedShown()
      this.publishStep()
    }, CORRECT_SHOWN_MS)
  }

  private cancelCorrectedShown(): void {
    if (this.stepShown !== null) this.host.deps.clearTimeout(this.stepShown)
    this.stepShown = null
  }

  // ---------- SCENES: the pattern each group plays, switched while playing, and copy and paste (an addition) ----------

  /**
   * The scene panel opened ([on]) with column [group] focused, or closed (✕).
   * It opens whatever the transport does and stays open while it plays; it
   * shares the function keys' place with STEP's panel: opening it closes it.
   * Closing drops the grid and the PAD flow; the picks waiting and the clipboard stay.
   */
  setSceneOpen(on: boolean, group: number = this.sceneDesk.group): void {
    if (!on) {
      this.closeScene()
      return
    }
    if (this.sceneDesk.open) {
      this.setSceneGroup(group)
      return
    }
    this.closeStep()
    this.sceneDesk.openOn(group)
    this.publishScene()
  }

  /** Live shows [group] now (or its column was tapped): the CLIP row's pattern and bar work on it. */
  setSceneGroup(group: number): void {
    this.sceneDesk.focus(group)
    this.publishScene()
  }

  /** [group]'s − (-1) or + (+1): the pattern number as shown a step on, wrapping round 1..99; at once while stopped, else queued. */
  scenePatternStep(group: number, dir: number): void {
    this.scenePick((at, time) => this.sceneDesk.stepPattern(this.seq, group, dir, at, time))
  }

  /** [group]'s pattern [n] picked on the 1–99 grid: as [scenePatternStep]. The grid closes. */
  scenePatternPick(group: number, n: number): void {
    this.scenePick((at, time) => this.sceneDesk.pickPattern(this.seq, group, n, at, time))
  }

  /** NEXT FREE: the first pattern of [group] after the number shown with no notes, as [scenePatternStep]. */
  scenePatternNextFree(group: number): void {
    this.scenePick((at, time) => this.sceneDesk.pickNextFree(this.seq, group, at, time))
  }

  /** The 1–99 grid opens over the pads for [group], or closes (null). */
  sceneGrid(group: number | null): void {
    this.sceneDesk.grid(group)
    this.publishScene()
  }

  /** The scene's − (-1) or + (+1), from the one shown; + past the last is a new one. At once while stopped, else queued for all four groups. */
  sceneStep(dir: number): void {
    this.scenePick((at, time) => this.sceneDesk.stepScene(this.seq, dir, at, time))
  }

  /** COMMIT: the scene copied right after itself, into the groups' next free patterns, and selected (one UNDO step). */
  sceneCommit(): void {
    this.sceneEdit(() => this.sceneDesk.commit(this.seq, this.recorder))
  }

  /** The CLR / DEL key held its 2 s: an empty scene that isn't the only one is deleted, any other emptied (one UNDO step). */
  sceneEraseHold(): void {
    const at = this.sceneTickNow()
    if (at !== null) this.sceneDue(at)
    const r = this.sceneDesk.erase(this.seq, this.recorder)
    if (r !== null) {
      this.setSeq(r.seq)
      this.host.toast(r.erase === 'cleared' ? MirrorText.CLEARED_SCENE : MirrorText.DELETED_SCENE)
    }
    this.publishScene()
  }

  /** CHANGE (kept): when a pick made while playing takes over. */
  setSceneSwitch(time: SwitchTime): void {
    this.changeSettings({ ...this.settings, sceneSwitch: time })
    this.publishScene()
  }

  /** The CLIP row's PTN, BAR or PAD; a PAD flow waiting is dropped. */
  setClipMode(mode: ClipMode): void {
    this.sceneDesk.mode(mode)
    this.publishScene()
  }

  /** The bar page BAR copies and pastes, [bar] from 0. */
  setClipBar(bar: number): void {
    this.sceneDesk.page(bar)
    this.publishScene()
  }

  /** COPY: in PTN the focused group's pattern, in BAR its bar page; in PAD it waits for a tap on the pad to copy. */
  clipCopy(): void {
    this.sceneDesk.copy(this.seq)
    this.stageBegun()
    this.publishScene()
  }

  /** PASTE: in PTN the clipboard's pattern, in BAR its notes (one UNDO step each); in PAD it waits for the pad to paste onto. */
  clipPaste(): void {
    this.sceneEdit(() => {
      const out = this.sceneDesk.paste(this.seq, this.recorder)
      this.stageBegun()
      return out
    })
  }

  /** Whether the PAD flow waits for a pad: a pad's press is its tap, neither played nor recorded. */
  get padStaged(): boolean {
    return this.sceneDesk.padStage !== PadStage.NONE
  }

  /**
   * A pad pressed while the PAD flow waits, by voice [key]: the pad COPY
   * takes, or the pad PASTE puts the clipboard's notes on. An [unsure] press
   * (the scrolling page) waits for [sceneTapKept]. False when none waits.
   */
  scenePadTap(pad: PhysicalPad, key: string, unsure = false): boolean {
    if (this.sceneDesk.padStage === PadStage.NONE) return false
    if (unsure) {
      this.sceneTaps.add(key)
      return true
    }
    this.sceneEdit(() => this.sceneDesk.padTap(pad, this.seq, this.recorder))
    return true
  }

  /** The unsure press by [key] the PAD flow waited for was a press after all: its tap. False when none waited for it. */
  sceneTapKept(pad: PhysicalPad, key: string): boolean {
    if (!this.sceneTaps.delete(key)) return false
    this.sceneEdit(() => this.sceneDesk.padTap(pad, this.seq, this.recorder))
    return true
  }

  /** The unsure press by [key] was a scroll: no tap. False when none waited for it. */
  sceneTapCut(key: string): boolean {
    return this.sceneTaps.delete(key)
  }

  /** Live's SCENE follows the sequencer, the settings and the desk. */
  private publishScene(): void {
    if (this.sceneDesk === undefined) return
    this._scene.value = this.sceneDesk.ui(this.seq, this.settings.sceneSwitch)
  }

  // A pick: the desk plays it at once while stopped ([at] null) or queues it for its tick; the sequencer, its plan and Live follow.
  // A pick waiting that the sequencer may have played from already takes over first, not replaced.
  private scenePick(pick: (at: number | null, time: SwitchTime) => ProjectSeq): void {
    const at = this.sceneTickNow()
    if (at !== null) this.sceneDue(at)
    this.setSeq(pick(at, this.settings.sceneSwitch))
    // A queue made or dropped: the plan has it.
    this.refreshPlan()
    this.publishScene()
    // On its tick, not the next beat's.
    if (this.sceneDesk.waiting > 0 && this.loop !== null) this.follow()
  }

  // An edit of the sequencer on the desk (already one UNDO step), and Live follows; a pick passed takes over first.
  private sceneEdit(edit: () => ProjectSeq): void {
    const at = this.sceneTickNow()
    if (at !== null) this.sceneDue(at)
    this.setSeq(edit())
    this.publishScene()
  }

  // The PAD flow began waiting for a pad: ERASE and CORRECT go off, whose taps are their own.
  private stageBegun(): void {
    if (this.sceneDesk.padStage === PadStage.NONE) return
    if (this.erasing) this.setErase(false)
    if (this.stepDesk.correct) this.setStepCorrect(false)
  }

  // Running, the tick a pick made now goes from: the one heard, but no earlier than the sequencer can still switch at.
  // Null while stopped (or not heard yet): a pick plays at once.
  private sceneTickNow(): number | null {
    if (!this.running()) return null
    const now = this.host.deps.perfNow()
    const heard = this.tickAt(now)
    if (heard === null) return null
    const free = this.host.deps.liveAudio.seqFreeTick?.(now) ?? null
    return free === null ? heard : Math.max(heard, free)
  }

  // The PAD flow is dropped (ERASE or CORRECT came on).
  private endPadStage(): void {
    if (this.sceneDesk === undefined || this.sceneDesk.padStage === PadStage.NONE) return
    this.sceneDesk.endStage()
    this.publishScene()
  }

  /** The panel closes (✕, STEP, another project), if it was open. */
  private closeScene(): void {
    if (!this.sceneDesk.open) return
    this.sceneDesk.close()
    this.sceneTaps.clear()
    this.publishScene()
  }

  // The picks waiting whose tick the playhead has passed ([tick], as heard) take over: the sequencer takes the pattern,
  // which the sequencer's plan was playing from the tick already.
  private sceneDue(tick: number): void {
    const waiting = this.sceneDesk.waiting
    if (waiting === 0) return
    const started = this.sceneDesk.phase
    const out = this.sceneDesk.due(this.seq, tick)
    if (this.sceneDesk.waiting === waiting && out === this.seq) return
    // The notes heard live in a pattern left are not of the one that starts: its passes are counted from its own start.
    if (this.skip.size > 0) {
      const left = new Set<number>()
      for (let g = 0; g < 4; g++) {
        if (PhaseAnchors.of(this.sceneDesk.phase, g) === PhaseAnchors.of(started, g)) continue
        for (const n of ProjectPatterns.group(this.current, g).notes) left.add(n.id)
      }
      if (left.size > 0) this.skip = new Map([...this.skip].filter(([id]) => !left.has(id)))
    }
    this.setSeq(out)
    // The queue went: the plan has none.
    this.refreshPlan()
    this.publishScene()
  }

  // STOP: every pick waiting takes over at once.
  private sceneFlush(): void {
    if (this.sceneDesk.waiting === 0) return
    this.setSeq(this.sceneDesk.flush(this.seq))
    this.refreshPlan()
    this.publishScene()
  }

  // ---------- ARP: the arpeggiator (KEYS) and note repeat (PADS), on TIMING's interval (an addition) ----------

  // The arp's notes, the pads loading for it and those found nowhere this run, and pressure's last plan and the next.
  private readonly arpDesk = new ArpDesk()
  private readonly arpLoading = new Set<number>()
  private readonly arpTried = new Set<number>()
  private arpPressureAt = Number.NEGATIVE_INFINITY
  private arpPressureTimer: unknown = null
  private readonly _arp = signal<ArpUi>(ARP_UI)
  /** The arp as Live shows it: on, LATCH, the notes held, and the display line while it plays. */
  readonly arp: ReadonlySignal<ArpUi> = this._arp

  /** ARP (KEYS) / RPT (PADS) on or off (kept); off, the notes it held go and it stops. */
  setArpOn(on: boolean): void {
    if (!on) this.arpClear()
    this.changeSettings({ ...this.settings, arpOn: on })
  }

  /** The order KEYS's held notes play in (kept). */
  setArpOrder(order: ArpOrder): void {
    this.changeSettings({ ...this.settings, arp: ArpSettings.withOrder(this.settings.arp, order) })
  }

  /** Over 1 to 3 octaves (kept). */
  setArpOctaves(n: number): void {
    this.changeSettings({ ...this.settings, arp: ArpSettings.withOctaves(this.settings.arp, n) })
  }

  /** Each note held for 10..100 % of a step (kept). */
  setArpGate(percent: number): void {
    this.changeSettings({ ...this.settings, arp: ArpSettings.withGate(this.settings.arp, Math.round(percent)) })
  }

  /** LATCH (kept): the notes play on after the fingers are up; off, those no finger holds go. */
  setArpLatch(on: boolean): void {
    if (!on) this.arpDesk.unlatch()
    this.changeSettings({ ...this.settings, arp: ArpSettings.withLatch(this.settings.arp, on) })
  }

  /** Whether the arp takes a press: it is on, and the press holds (a screen reader's tap only latched); not in the STEP panel. */
  arpTakes(hold: boolean): boolean {
    return arpTakesPress(this.settings.arpOn, this.settings.arp.latch, hold, this.stepDesk.open)
  }

  /**
   * A press on voice [key] at [pressedAt] while the arp is on: [note]
   * joins the arp's notes ([keys]: a KEYS note; else a pad for note
   * repeat), neither played nor recorded itself; the sequencer plays it on
   * the next step (the first of a run on the press). With RECORD armed,
   * the recording starts on it, as on a press's (one [unsure], once kept:
   * [arpKeep]); the arp's steps are what it records.
   */
  arpPress(key: string, note: ArpNote, keys: boolean, pressedAt: number, hold: boolean, unsure = false): void {
    if (!unsure) this.padDown(pressedAt)
    const latch = this.settings.arp.latch
    if (this.arpDesk.press(key, note, keys, pressedAt, latch, unsure)) this.arpTried.clear()
    // A tap that never lets go (latched, or it wouldn't be here): up at once, its note kept.
    if (!hold) this.arpDesk.release(key, latch)
    this.publishArp()
  }

  /** The unsure press on voice [key] the arp holds was a press after all: RECORD armed starts on it. False when the arp doesn't hold it. */
  arpKeep(key: string): boolean {
    const at = this.arpDesk.keep(key)
    if (at === null) return false
    this.padDown(at)
    return true
  }

  /** The finger left voice [key]: a note the arp holds goes with it (unless latched). */
  arpRelease(key: string): void {
    if (this.arpDesk.release(key, this.settings.arp.latch)) this.publishArp()
  }

  /** The press on voice [key] was a scroll after all: nor does it repeat. */
  arpCut(key: string): void {
    if (this.arpDesk.cut(key)) this.publishArp()
  }

  /** Voice [key] held at [pressure] (the touch's own, while the arp is on): its velocity, on a device that tells pressure. */
  arpPressure(key: string, pressure: number): void {
    if (!this.arpDesk.pressure(key, pressure)) return
    if (this.arpPressureTimer !== null) return
    const deps = this.host.deps
    const wait = ARP_PRESSURE_MS - (deps.perfNow() - this.arpPressureAt)
    if (wait <= 0) {
      this.arpPressureAt = deps.perfNow()
      this.publishArp()
      return
    }
    this.arpPressureTimer = deps.setTimeout(() => {
      this.arpPressureTimer = null
      this.arpPressureAt = deps.perfNow()
      this.publishArp()
    }, wait)
  }

  /** The arp's notes go (another project, the output closed, playback stopped); it stays on. */
  arpClear(): void {
    this.cancelArpPressure()
    this.arpDesk.clear()
    this.publishArp()
  }

  /**
   * Hands the sequencer what the arp plays: on, its notes, on their pads'
   * sounds in memory as a press plays them, at TIMING and the arp's
   * settings and the pattern's tempo; null (it stops) off or with none. A
   * pad whose sound isn't in memory loads, and the plan follows. Live's
   * line follows too. (The KEYS names changed: [refreshArp].)
   */
  private publishArp(): void {
    const s = this.settings
    let plan = null
    if (s.arpOn && this.arpDesk.notes.length > 0) {
      const pads = new Set(this.arpDesk.notes.map((n) => n.pad.group * 12 + n.pad.offset))
      const { voices, missing } = patternVoices(pads, (pad) => this.host.live.patternVoice(pad))
      const shapes = new Map<number, Partial<VoiceShape>>()
      const keysShapes = new Map<number, Partial<VoiceShape>>()
      const shapeOf = this.host.shapeOf
      if (shapeOf) {
        for (const pad of voices.keys()) {
          shapes.set(pad, shapeOf(pad, false))
          keysShapes.set(pad, shapeOf(pad, true))
        }
      }
      for (const pad of missing) this.loadArpPad(pad)
      plan = this.arpDesk.plan({ voices, shapes, keysShapes }, s.timing, s.arp, this.bpm())
    }
    this.host.deps.liveAudio.arpPlan?.(plan)
    this._arp.value = this.arpDesk.ui(s.arpOn, s.arp, s.timing, this.noteNames())
  }

  /** The KEYS names changed (or a pad's sound): the line and the plan follow. */
  refreshArp(): void {
    this.publishArp()
  }

  // [pad]'s sound into memory for the arp, as a press loads it (once a run: one found nowhere isn't asked again).
  private loadArpPad(pad: number): void {
    if (this.arpTried.has(pad) || this.arpLoading.has(pad)) return
    this.arpLoading.add(pad)
    void this.host.live.loadForPattern(pad).then(
      (ok) => {
        this.arpLoading.delete(pad)
        if (ok) this.publishArp()
        else this.arpTried.add(pad)
      },
      () => {
        this.arpLoading.delete(pad)
        this.arpTried.add(pad)
      },
    )
  }

  /**
   * A step the arp played on the pattern's clock (told by the output once
   * mixed): while recording, a note of the pattern where it played, at its
   * velocity and as long as its gate. It is on the grid already, so TIMING
   * doesn't move it.
   */
  private recordArpStep(step: ArpStep): void {
    if (!this.transport.state.recording) return
    const n = step.note
    const tick = step.globalTick
    this.sceneDue(tick)
    this.groups.add(n.pad.group)
    this.markPasses(tick)
    const r = this.recorder.noteOn(this.current, n.pad, n.semitones, tick, tick, 'off', this.settings.timing.swing, n.velocity)
    if (r.id === 0) return
    this._ui.value = { ...this._ui.peek(), focusGroup: n.pad.group }
    this.setPatterns(this.recorder.noteOff(r.patterns, r.id, tick + step.gateTicks))
  }

  private cancelArpPressure(): void {
    if (this.arpPressureTimer === null) return
    this.host.deps.clearTimeout(this.arpPressureTimer)
    this.arpPressureTimer = null
  }

  private noteNames(): NoteNames {
    return this.host.noteNames?.() ?? NoteNames.LETTERS
  }

  // ---------- BEAT CARDS: share a pattern or scene to Claude, paste Claude's card back (an addition) ----------

  private readonly _beat = signal<BeatImportUi | null>(null)
  /** The beat card sheet's state while a card waits on it (pasted or shared to arc), else null. */
  readonly beat: ReadonlySignal<BeatImportUi | null> = this._beat

  /**
   * What SHARE sends: [group]'s playing pattern, or (null) the scene playing,
   * as an ARC BEAT card at the tempo Live plays at and the TIMING swing, with
   * the pads' names; null when there are no notes in it. The patterns are the
   * project's as they stand, a pattern still recording included.
   */
  beatShare(group: number | null): BeatShare | null {
    if (group !== null && (group < 0 || group > 3)) return null
    return beatShare(this.seq, group, this.bpm(), this.settings.timing.swing, (pad) => this.padName(pad))
  }

  /**
   * A text pasted (PASTE BEAT, or a paste on Live): with an ARC BEAT line in
   * it, the card is read and planned into the project's patterns as they stand
   * (BeatCards.plan) and its sheet opens ([beat]); with none the toast says so.
   * Nothing changes until [importBeat]. The plan reads the patterns once they
   * are loaded, so a card never lands on a project's notes before they are read.
   */
  async receiveBeat(text: string | null): Promise<void> {
    if (text === null || !BeatCards.hasCard(text)) {
      this.host.toast(ClaudeText.NO_CARD)
      return
    }
    await this.load()
    this.showBeat(BeatCards.read(text))
  }

  // The sheet for [read], planned into the project's patterns as they are now.
  private showBeat(read: CardRead): void {
    this._beat.value = beatImportUi(read, this.seq, this.bpm(), (pad) => this.padName(pad))
  }

  /** The sheet closes (CANCEL, a tap outside, Back, another section): nothing was imported. */
  dismissBeat(): void {
    this._beat.value = null
  }

  /**
   * IMPORT: the card is planned again into the patterns as they are now and
   * applied as one UNDO step (applyBeat: its patterns into the next free
   * slots, a new scene for a card of several groups, else the patterns picked
   * in the scene playing), kept, and the sheet closes. With [setTempo] the
   * card's tempo becomes the phone's. It takes over at once, stopped or
   * playing, as COMMIT does; the picks waiting go. Where a group has no free
   * pattern now the sheet stays, with the reason.
   */
  importBeat(setTempo: boolean): void {
    const ui = this._beat.peek()
    const card = ui?.read.card ?? null
    if (ui === null || card === null) return
    let applied: BeatApplied | null = null
    this.sceneEdit(() => {
      const a = applyBeat(this.seq, card, this.recorder)
      applied = a
      if (a.seq !== this.seq) this.sceneDesk.cancel()
      return a.seq
    })
    const a = applied as BeatApplied | null
    if (a === null) return
    if (a.fullGroup !== null) {
      this.showBeat(ui.read)
      this.host.toast(ClaudeText.groupFull(a.fullGroup), true)
      return
    }
    this._beat.value = null
    if (setTempo && card.tempo !== null) this.setTempo(Tempo.round(card.tempo))
    this.host.toast(beatImported(a))
  }

  private padName(pad: PhysicalPad): string | null {
    return this.host.padName?.(pad) ?? null
  }

  // ---------- the sheet ----------

  /** [group]'s length, 1 to 99 bars; notes past the end are kept, not played. */
  setLength(group: number, bars: number): void {
    if (group < 0 || group > 3) return
    this.setPatterns(this.recorder.setLength(this.current, group, bars))
    this.show()
  }

  /** ×2: [group] twice as long, its notes copied into the new half. */
  double(group: number): void {
    if (group < 0 || group > 3) return
    this.setPatterns(this.recorder.double(this.current, group))
    this.show()
  }

  /** CLEAR (asked first, in the sheet): [group]'s notes, or every group's (null); the lengths stay. */
  clear(group: number | null): void {
    if (group !== null && (group < 0 || group > 3)) return
    const p = this.recorder.clear(this.current, group)
    if (p === this.current) return
    this.setPatterns(p)
    this.host.toast(MirrorText.cleared(group))
  }

  /** UNDO: back to before the last pass recorded, clear or length change. */
  undo(): void {
    const seq = this.recorder.undo(this.seq)
    // A pick waiting goes.
    if (seq !== null) this.sceneDesk.cancel()
    if (seq !== null && seq !== this.seq) {
      this.useSeq(seq)
      this.touched = true
      this.refreshPlan()
      if (!this.transport.state.recording) this.save()
    }
    this.show()
  }

  /** TIMING: the grid recorded notes snap to ('off': free time). Kept. */
  setTiming(t: Timing): void {
    const cur = this.settings.timing
    const timing = t === 'off' ? TimingSettings.withQuantize(cur, false) : TimingSettings.withQuantize(TimingSettings.withInterval(cur, t), true)
    this.changeSettings({ ...this.settings, timing })
  }

  /** TIMING's interval: the step the grid recording snaps to (kept). */
  setTimingInterval(t: Timing): void {
    this.changeSettings({ ...this.settings, timing: TimingSettings.withInterval(this.settings.timing, t) })
  }

  /** TIMING's swing, 50 to 75 % (kept). */
  setTimingSwing(percent: number): void {
    this.changeSettings({ ...this.settings, timing: TimingSettings.withSwing(this.settings.timing, Math.round(percent)) })
  }

  /** TIMING's quantize (true) or free time (false), for recording (kept). */
  setTimingQuantize(on: boolean): void {
    this.changeSettings({ ...this.settings, timing: TimingSettings.withQuantize(this.settings.timing, on) })
  }

  /** COUNT-IN: RECORD then PLAY counts a bar in first. Kept. */
  setCountIn(on: boolean): void {
    this.changeSettings({ ...this.settings, countIn: on })
  }

  /** AUTO length: an empty group recorded from stop ends where recording stops. Kept. */
  setAutoLength(on: boolean): void {
    this.changeSettings({ ...this.settings, autoLength: on })
  }

  private changeSettings(s: PatternSettings): void {
    const was = this.settings
    this.settings = s
    this.host.prefs.save(s)
    this._ui.value = this.withSettings(this._ui.peek())
    // TIMING, the arp's settings, ARP on or off (off, its notes go): the arp follows.
    if (s.timing !== was.timing || s.arp !== was.arp || s.arpOn !== was.arpOn) {
      if (!s.arpOn) this.arpDesk.clear()
      this.publishArp()
    }
  }

  // ---------- TEMPO: a click on the phone (an addition) ----------

  /** Whether Live's output has a click to give. */
  get canClick(): boolean {
    return this.host.deps.liveAudio.setClick !== undefined
  }

  /**
   * TEMPO's tap: the click on or off. On, it plays at the phone's tempo, or
   * on the EP-133's beats while it sends MIDI clock, or on the pattern's while
   * the transport runs. No output: a toast, and it stays off.
   */
  setClick(on: boolean): void {
    const audio = this.host.deps.liveAudio
    if (!audio.setClick) return
    if (on === this._metronome.peek().on) return
    if (on && !audio.setClick(true, this.settings.liveTempo, this.clickGrid())) {
      this.host.toast(FeatureText.NO_AUDIO_OUTPUT, true)
      return
    }
    if (!on) audio.setClick(false, this.settings.liveTempo, null)
    this.followed = on && this.clockFollow.grid(this.host.deps.perfNow()) !== null
    this._metronome.value = { ...this._metronome.peek(), on }
    this.watchClick(on)
  }

  /** The phone's tempo, clamped to Tempo.MIN..MAX and kept; a click on takes it from the beat after the next. */
  setTempo(bpm: number): void {
    const t = Tempo.clamp(Math.round(bpm))
    if (t === this.settings.liveTempo) return
    this.changeSettings({ ...this.settings, liveTempo: t })
    this._metronome.value = { ...this._metronome.peek(), bpm: t }
    this.refreshPlan()
    this.publishArp()
    this.sendClick()
  }

  /** A tap on the tempo sheet's TAP pad at [at]: from a run's second tap on, the tempo the taps give is set and returned. */
  tapTempo(at: number): number | null {
    const bpm = this.taps.tap(at)
    if (bpm !== null) this.setTempo(bpm)
    return bpm
  }

  /** The EP-133's MIDI, as Live hears it: its clock is followed for the click and TEMPO's light. */
  midi(e: MidiEvent): void {
    const beat = this.clockFollow.onMidi(e)
    if (beat === null) return
    // The click's own beats light TEMPO while it sounds; the device's moved it on the grid it gives.
    if (this._metronome.peek().on) this.sendClick()
    else this._beats.value = beat
  }

  private sendClick(): void {
    if (!this._metronome.peek().on) return
    const grid = this.clickGrid()
    this.followed = grid !== null
    this.host.deps.liveAudio.setClick?.(true, this.settings.liveTempo, grid)
  }

  /** The EP-133's beats while it sends its clock, sent earlier by the delay made up for, so they are heard on the device's (OutputDelay.earlier). */
  private clickGrid(): BeatGrid | null {
    const g = this.clockFollow.grid(this.host.deps.perfNow())
    return g === null ? null : OutputDelay.earlier(g, this.heardDelay())
  }

  // Whether the click last sent followed the EP-133, and the watch that notices its clock stopping.
  private followed = false
  private clickWatch: unknown = null

  /** While the click is on: the EP-133's clock stopping (or starting) is noticed, and the click runs free (or follows). */
  private watchClick(on: boolean): void {
    const { deps } = this.host
    if (this.clickWatch !== null) deps.clearTimeout(this.clickWatch)
    this.clickWatch = null
    if (!on) return
    const check = (): void => {
      if (!this._metronome.peek().on) return
      if ((this.clockFollow.grid(deps.perfNow()) !== null) !== this.followed) this.sendClick()
      this.clickWatch = deps.setTimeout(check, CLICK_WATCH_MS)
    }
    this.clickWatch = deps.setTimeout(check, CLICK_WATCH_MS)
  }

  /** The patterns of the project shown, for tests and the beat card. */
  get patternsNow(): ProjectPatterns {
    return this.current
  }
}

/** TEMPO's click: on or off (never kept), and the phone's tempo. */
export interface Metronome {
  readonly on: boolean
  readonly bpm: number
}

/** A pad key's pad. */
export function padOf(key: number): PhysicalPad {
  return physicalPad(Math.floor(key / 12), key % 12)
}

/** Whether two plans' voices play alike: the same pads, each with the same shape. */
function sameShapes(a: ReadonlyMap<number, Partial<VoiceShape>>, b: ReadonlyMap<number, Partial<VoiceShape>>): boolean {
  if (a.size !== b.size) return false
  for (const [pad, sh] of a) if (!b.has(pad) || !sameShape(sh, b.get(pad))) return false
  return true
}

/** Whether two plans' queued switches are the same: the same groups, each to the same pattern at the same tick. */
function sameQueued(
  a: ReadonlyMap<number, { readonly pattern: Pattern; readonly atTick: number }>,
  b: ReadonlyMap<number, { readonly pattern: Pattern; readonly atTick: number }>,
): boolean {
  if (a.size !== b.size) return false
  for (const [g, q] of a) {
    const o = b.get(g)
    if (o === undefined || o.pattern !== q.pattern || o.atTick !== q.atTick) return false
  }
  return true
}
