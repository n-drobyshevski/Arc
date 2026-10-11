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
// - No scenes, STEP, ERASE, CORRECT, arp, SAMPLE's PTN take or Bluetooth
//   delay make-up yet: the web plays and records the patterns of the scene
//   a project starts on, and the tick heard is the tick stamped.
// - The follow loop is a timer (setTimeout), not a coroutine; the click for
//   the count-in is the sequencer's own (PatternScheduler).
// - Times are performance.now() milliseconds where Kotlin's are System.nanoTime.

import { signal, type ReadonlySignal, type Signal } from '@preact/signals'
import { physicalPad, type PhysicalPad } from '../core/features/padNotes'
import { Pattern, Patterns, ProjectPatterns, ProjectSeq, Seq, TimingSettings, type Timing } from '../core/features/pattern'
import { PatternRecorder } from '../core/features/patternRecorder'
import { frameAt } from '../core/features/sampleTiming'
import { PhaseAnchors, passOf, positionOf, tickAt as clockTickAt, msOf, type PatternPosition } from '../core/features/sequencer'
import { Transport, type TransportAction } from '../core/features/transport'
import { ClockFollow, TapTempo, Tempo, type Beat } from '../core/features/tempo'
import type { MidiEvent } from '../core/protocol/midiInput'
import { FeatureText } from '../core/text/featureText'
import { MirrorText } from '../core/text/mirrorText'
import type { PatternPrefs, PatternSettings } from '../platform/storage/settings'
import type { Deps, LiveTimeline } from './deps'
import type { LiveSounds } from './live'
import {
  PATTERN_UI,
  countInBeat,
  heldNotesEnded,
  patternBpm,
  patternShown,
  patternVoices,
  pressSkip,
  pressTickAt,
  sameVoices,
  withoutNote,
  type PatternUiState,
} from './patternPlan'
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

/** A pad held in ERASE shorter than this is a tap: it erases the pad's every note. */
export const ERASE_TAP_MS = 200

/** How far ahead of the mix the sequencer sends notes (PatternScheduler's LOOKAHEAD_MS). */
const LOOKAHEAD_MS = 50

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
  live: Pick<LiveSounds, 'patternVoice' | 'loadForPattern'>
  toast(text: string, error?: boolean): void
  /** The pad (pad key) whose voices duck the sidechain (FX), if any. */
  duckPad?(): number | null
}

/** The plan last handed to the sequencer, to tell when a new one changes anything. */
interface SentPlan {
  readonly patterns: ProjectPatterns
  readonly skip: ReadonlyMap<number, number>
  readonly bpm: number
  readonly voices: ReadonlyMap<number, string>
  readonly duckPad: number | null
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
  private readonly taps = new TapTempo()

  constructor(private readonly host: PatternHost) {
    this.settings = host.prefs.load()
    this._ui = signal(this.withSettings(PATTERN_UI))
    this.ui = this._ui
    this._metronome = signal<Metronome>({ on: false, bpm: this.settings.liveTempo })
    this.metronome = this._metronome
    const audio = host.deps.liveAudio
    if (audio.onSeqMissing) this.cleanups.push(audio.onSeqMissing(() => this.refreshPlan()))
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
    this.stopLoop()
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
    this.stop()
    this.save()
    this.project = project
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
    const { voices, missing } = patternVoices(ProjectPatterns.usedPads(p), (pad) => this.host.live.patternVoice(pad))
    const bpm = this.bpm()
    const duckPad = this.host.duckPad?.() ?? null
    const old = this.sent
    if (old === null || old.patterns !== p || old.skip !== this.skip || old.bpm !== bpm || old.duckPad !== duckPad || !sameVoices(old.voices, voices)) {
      this.sent = { patterns: p, skip: this.skip, bpm, voices, duckPad }
      audio.seqPlan({ patterns: p, voices, skip: this.skip, bpm, phase: PhaseAnchors.ZERO, duckPad })
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
    return positionOf(clockTickAt(tl.clock, frameAt(tl.frames, ms)), ProjectPatterns.group(this.current, g), 0)
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
    this.groups.clear()
    this.tried.clear()
    this.pressAt = at
    this.sawTimeline = false
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
    this.pressAt = null
    this.held.clear()
    this.eraseHolds.clear()
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
        wait = Math.min(Math.max(Math.floor(next - now) + 1, 1), this.eraseHolds.size === 0 ? PATTERN_LOOP_MS : PATTERN_ERASE_MS)
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
        const beat = countInBeat(tick)
        if (this._ui.peek().countIn !== beat) this._ui.value = { ...this._ui.peek(), countIn: beat }
        return
      }
      this.transport.countedIn()
      this.show()
    }
    if (this.transport.state.recording && tick >= 0) {
      this.markPasses(tick)
      this.setPatterns(this.recorder.grow(this.current, tick))
    }
    this.eraseHeld()
  }

  // ---------- ERASE ----------

  /** ERASE on or off: on, a pad tapped erases its notes, and one held while playing erases them as they pass. */
  setErase(on: boolean): void {
    if (!on) this.eraseHolds.clear()
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
    const from = h.from ?? Math.max(clockTickAt(tl.clock, frameAt(tl.frames, h.downAt)), 0)
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
      const from = h.from ?? Math.max(clockTickAt(tl.clock, frameAt(tl.frames, h.downAt)), 0)
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
    const tick = this.tickAt(pressedAt)
    if (tick === null) return
    this.groups.add(pad.group)
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
    if (hold) this.held.set(key, r.id)
    this._ui.value = { ...this._ui.peek(), focusGroup: pad.group }
    this.setPatterns(p)
  }

  /** Voice [key] let go of at [releasedAt]: the note it recorded, if any, ends its gate there. */
  release(key: string, releasedAt: number): void {
    const id = this.held.get(key)
    if (id === undefined) return
    this.held.delete(key)
    const tick = this.tickAt(releasedAt)
    if (tick === null) return
    this.setPatterns(this.recorder.noteOff(this.current, id, tick))
  }

  /** The press on [key] was a scroll after all: the note it recorded goes. */
  cut(key: string): void {
    const id = this.held.get(key)
    if (id === undefined) return
    this.held.delete(key)
    this.setPatterns(withoutNote(this.current, id))
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
    this.settings = s
    this.host.prefs.save(s)
    this._ui.value = this.withSettings(this._ui.peek())
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
    if (on && !audio.setClick(true, this.settings.liveTempo, this.clockFollow.grid(this.host.deps.perfNow()))) {
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
    const grid = this.clockFollow.grid(this.host.deps.perfNow())
    this.followed = grid !== null
    this.host.deps.liveAudio.setClick?.(true, this.settings.liveTempo, grid)
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
