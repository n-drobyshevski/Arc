// A LiveAudioDeps that records what the controller asks of Live's output (state tests).
import { signal, type Signal } from '@preact/signals'
import { WebLatencyHint } from '../../src/core/text/latencyText'
import type { ArpStep, LiveArpPlan, LiveAudioDeps, LiveEngineInfo, LivePress, LiveSeqPlan, LiveTimeline, MicOpened } from '../../src/state/deps'
import { transportClock } from '../../src/core/features/sequencer'
import type { Beat } from '../../src/core/features/tempo'
import type { RecState } from '../../src/core/features/takeRecorder'
import type { RecordedTake } from '../../src/platform/audio/liveAudio'
import type { TapPhase, TapTake } from '../../src/platform/audio/sampleTap'

export interface FakeLiveAudio extends LiveAudioDeps {
  readonly loaded: Map<string, { pcm: Int16Array; channels: number; sampleRate: number }>
  readonly presses: { id: string; key: string; options: LivePress }[]
  readonly releases: string[]
  readonly cuts: string[]
  readonly log: string[]
  opened: number
  suspended: number
  closed: number
  gestures: number
  /** What open() and press() answer. */
  available: boolean
  /** Reports a voice heard (as the output would), on [engine]'s latency-test row. */
  started(id: string, ms: number, route?: string, engine?: LiveEngineInfo): void
  /** Reports a slow (Bluetooth-like) output. */
  slow(ms: number): void
  /** The output's own delay signal, as the real LiveAudio has it ([withLate]); absent otherwise. */
  readonly late?: Signal<number | null>
  readonly latencyHint: Signal<WebLatencyHint>
  readonly engine: Signal<LiveEngineInfo | null>
  /** The latencyHint choices made, in order. */
  readonly hints: WebLatencyHint[]
  readonly rec: Signal<RecState>
  /** TAKE calls in order: arm, stop, transport:start, transport:stop. */
  readonly recLog: string[]
  /** Ends the take as the output would: [take] or null, and whether the limit ended it. */
  endTake(take: RecordedTake | null, limit?: boolean): void
  // PATTERN
  /** The plans handed over, in order. */
  readonly plans: LiveSeqPlan[]
  /** PATTERN calls in order: "play:<countIn>:<leadMs>:<atMs>", "stop", "arm:<bool>". */
  readonly seqLog: string[]
  readonly timeline: Signal<LiveTimeline | null>
  /** The output's clock as the mixer would tell it: tick 0 heard at [zeroMs] (performance.now()), at [bpm]; 48 kHz. */
  runAt(zeroMs: number, bpm?: number): void
  /** Tells a pad the patterns play has no sound. */
  missing(pad: number): void
  /** The Bluetooth delay made up for (ms); 0 unless a test sets it. */
  delayMs: number
  /** The arp's plans, in order (null: it stopped). */
  readonly arps: (LiveArpPlan | null)[]
  /** A step the arp played on the pattern's clock, as the output tells it. */
  arpStep(step: ArpStep): void
  /** TEMPO's click calls in order: "click:<on>:<bpm>:<grid|free>". */
  readonly clickLog: string[]
  /** A click heard, as the output tells it. */
  beat(b: Beat): void
  /** FX bus commands in order: [what, index, x, y]. */
  readonly controls: [number, number, number, number][]
  // SAMPLE
  /** SAMPLE calls in order: "open:<stereo>:<gain>:<threshold>", "set:…", "close", "arm:<pad>:<latched>:<max>", "stop", "cancel". */
  readonly sampleLog: string[]
  readonly samplePhase: Signal<TapPhase>
  readonly sampleLevel: Signal<{ readonly level: number; readonly clip: boolean }>
  /** A take the tap made, as the output tells it (its phase back to ready first). */
  sampleTake(t: TapTake): void
  /** Whether it offers a mic (off by default), and what opening it answers. */
  micSupported: boolean
  micAnswer: MicOpened
}

/** [withLate]: with a `late` signal of its own, as the real LiveAudio (the controller then follows it). */
export function fakeLiveAudio(withLate = false): FakeLiveAudio {
  const voices = signal<ReadonlySet<string>>(new Set())
  const startedL = new Set<(id: string, ms: number, route: string, engine?: LiveEngineInfo) => void>()
  const slowL = new Set<(ms: number) => void>()
  const takeL = new Set<(t: RecordedTake | null, limit: boolean) => void>()
  const rec = signal<RecState>({ kind: 'idle' })
  const timeline = signal<LiveTimeline | null>(null)
  const missingL = new Set<(pad: number) => void>()
  const arpStepL = new Set<(step: ArpStep) => void>()
  const beatL = new Set<(b: Beat) => void>()
  const sampleL = new Set<(t: TapTake) => void>()
  const set = (f: (s: Set<string>) => void): void => {
    const next = new Set(voices.peek())
    f(next)
    voices.value = next
  }
  const a: FakeLiveAudio = {
    loaded: new Map(),
    presses: [],
    controls: [],
    releases: [],
    cuts: [],
    log: [],
    opened: 0,
    suspended: 0,
    closed: 0,
    gestures: 0,
    available: true,
    voices,
    description: '48000 Hz, fake',
    open() {
      a.opened++
      return a.available
    },
    suspend() {
      a.suspended++
      voices.value = new Set()
    },
    close() {
      a.closed++
      voices.value = new Set()
    },
    resumeInGesture() {
      a.gestures++
    },
    preload(key, pcm, channels, sampleRate) {
      a.loaded.set(key, { pcm, channels, sampleRate })
    },
    has: (key) => a.loaded.has(key),
    unload(key) {
      if (key === undefined) a.loaded.clear()
      else a.loaded.delete(key)
    },
    press(id, key, options) {
      if (!a.available || !a.loaded.has(key)) return false
      a.presses.push({ id, key, options })
      set((s) => s.add(id))
      return true
    },
    control(what, index, x, y) {
      a.controls.push([what, index, x, y])
    },
    release(id) {
      a.releases.push(id)
      set((s) => s.delete(id))
    },
    cut(id) {
      a.cuts.push(id)
      set((s) => s.delete(id))
    },
    stopAll() {
      a.log.push('stopAll')
      voices.value = new Set()
    },
    onStarted(l) {
      startedL.add(l)
      return () => startedL.delete(l)
    },
    onSlowOutput(l) {
      slowL.add(l)
      return () => slowL.delete(l)
    },
    started(id, ms, route = 'default output', engine) {
      for (const l of startedL) l(id, ms, route, engine)
    },
    slow(ms) {
      for (const l of slowL) l(ms)
    },
    rec,
    recLog: [],
    arm() {
      a.recLog.push('arm')
      if (!a.available) return false
      if (rec.peek().kind === 'idle') rec.value = { kind: 'armed' }
      return true
    },
    stopRecording() {
      a.recLog.push('stop')
    },
    transportStarted() {
      a.recLog.push('transport:start')
    },
    transportStopped() {
      a.recLog.push('transport:stop')
    },
    onTake(l) {
      takeL.add(l)
      return () => takeL.delete(l)
    },
    endTake(take, limit = false) {
      rec.value = { kind: 'idle' }
      for (const l of [...takeL]) l(take, limit)
    },
    plans: [],
    seqLog: [],
    timeline,
    seqPlan(plan) {
      a.plans.push(plan)
    },
    seqPlay(countInBars, leadMs, atMs) {
      a.seqLog.push(`play:${countInBars}:${leadMs}:${atMs}`)
      return a.available
    },
    seqStop() {
      a.seqLog.push('stop')
      timeline.value = null
    },
    seqArm(armed) {
      a.seqLog.push(`arm:${armed}`)
    },
    onSeqMissing(l) {
      missingL.add(l)
      return () => missingL.delete(l)
    },
    runAt(zeroMs, bpm = 120) {
      // Mix frame 0 heard at 0 ms: tick 0 on the frame heard at [zeroMs].
      timeline.value = { clock: transportClock(Math.round(zeroMs * 48), 48000, bpm), frames: { frame: 0, ms: 0, rate: 48000 } }
    },
    missing(pad) {
      for (const l of [...missingL]) l(pad)
    },
    delayMs: 0,
    arps: [],
    arpPlan(plan) {
      a.arps.push(plan)
    },
    onArpStep(l) {
      arpStepL.add(l)
      return () => arpStepL.delete(l)
    },
    arpStep(step) {
      for (const l of [...arpStepL]) l(step)
    },
    clickLog: [],
    setClick(on, bpm, grid) {
      a.clickLog.push(`click:${on}:${bpm}:${grid === null ? 'free' : 'grid'}`)
      return a.available
    },
    onBeat(l) {
      beatL.add(l)
      return () => beatL.delete(l)
    },
    beat(b) {
      for (const l of [...beatL]) l(b)
    },
    sampleLog: [],
    samplePhase: signal<TapPhase>({ kind: 'ready' }),
    sampleLevel: signal({ level: 0, clip: false }),
    sampleRate: 48000,
    sampleOpen(stereo, gain, threshold, input) {
      a.sampleLog.push(`open:${stereo}:${gain}:${threshold}${input === true ? ':mic' : ''}`)
      return a.available
    },
    micSupported: false,
    micAnswer: { ok: true, channels: 1 },
    async sampleMic(stereo) {
      a.sampleLog.push(`mic:${stereo}`)
      return a.micAnswer
    },
    sampleSet(gain, threshold) {
      a.sampleLog.push(`set:${gain}:${threshold}`)
    },
    sampleClose() {
      a.sampleLog.push('close')
      a.samplePhase.value = { kind: 'ready' }
    },
    sampleArm(pad, _at, latched, max) {
      a.sampleLog.push(`arm:${pad}:${latched}:${max}`)
      a.samplePhase.value = { kind: 'waiting', pad, latched }
    },
    sampleSchedule(pad, start, length) {
      a.sampleLog.push(`schedule:${pad}:${start}:${length}`)
      a.samplePhase.value = { kind: 'waiting', pad, latched: true }
    },
    sampleScheduleAt(pad, atMs, length) {
      a.sampleLog.push(`scheduleAt:${pad}:${Math.round(atMs)}:${length}`)
      a.samplePhase.value = { kind: 'waiting', pad, latched: true }
    },
    sampleStop() {
      a.sampleLog.push('stop')
    },
    sampleCancel() {
      a.sampleLog.push('cancel')
      a.samplePhase.value = { kind: 'ready' }
    },
    onSampleTake(l) {
      sampleL.add(l)
      return () => sampleL.delete(l)
    },
    sampleTake(t) {
      a.samplePhase.value = { kind: 'ready' }
      for (const l of [...sampleL]) l(t)
    },
    latencyHint: signal<WebLatencyHint>(WebLatencyHint.ZERO),
    engine: signal<LiveEngineInfo | null>(null),
    hints: [],
    setLatencyHint(choice) {
      a.hints.push(choice)
      a.latencyHint.value = choice
    },
    ...(withLate ? { late: signal<number | null>(null) } : {}),
  }
  return a
}
