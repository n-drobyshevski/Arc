// Port of app/src/main/kotlin/dev/arc/ep133/audio/LiveAudio.kt
//
// Live's sound output (an addition): one low-latency output, open while Live
// is on screen, that core VoiceMixer fills with the pads and keys being
// played. A press only adds a voice, so it is heard after one or two of the
// output's render quanta rather than after a new source is set up. Voices
// sound while held (a gate: [release] fades them quickly), up to
// VoiceMixer.MAX_VOICES at once, [LivePressOptions.pitch] semitones from
// their own pitch for KEYS; a press with gate false (a screen reader's Play)
// plays the whole sample.
//
// It is state/deps.ts's LiveAudioDeps (checked in the tests; platform/ does
// not import state/), so boot/browserDeps wires `liveAudio: new LiveAudio()`.
//
// Web deltas:
// - An AudioContext at the device's own rate stands in for Kotlin's
//   LiveOutput (the native Oboe stream, or the low-latency AudioTrack it falls
//   back to, with EngineChoice between them); the EP-133's 46875 Hz sounds
//   are converted as they are mixed.
//   It asks for latencyHint 0, the smallest buffer the browser allows
//   ('interactive' where that can't be made). An output that glitches there
//   (underruns in AudioContext.playbackStats, where the browser has it,
//   [LATENCY_GLITCHES]) is replaced by one at 'interactive' at the next quiet
//   moment: once nothing sounds and nothing was pressed for a moment
//   ([REPLACE_QUIET_MS]), or when Live leaves. The step back holds for the
//   rest of the tab's session (sessionStorage, so a reload keeps it).
//   [setLatencyHint] is the debug screen's choice between 0 and 'interactive'
//   (LatencyText.hint, kept in localStorage: Kotlin's LiveEngine choice
//   between its outputs), for comparing the two; a choice reopens the output
//   and forgets a step back, and the step back applies to the 0 choice only.
//   The mixer runs in an AudioWorklet (liveWorklet.ts), or, where there is none,
//   under a ScriptProcessorNode on the main thread;
//   both are a MixerHost (liveMixer.ts). The browser sizes the output's
//   buffers and paces the render, so Kotlin's output loops (the native
//   callback, AudioTrack's just-in-time writes), their buffer sizing (grow on
//   underrun, shrink after a quiet while) and the native engine's reopen on a
//   new route have no counterpart.
// - Samples are kept in memory on the audio side: [preload] gives a decoded
//   sample a key, it is sent over once (as soon as it is decoded, a copy
//   moved to the worklet: liveMixer's transferable), and a press only names
//   it. Kotlin's play() takes the PCM itself (the controller's padMemory
//   holds it); here the controller loads and [unload]s by key instead. A
//   reopened output gets the loaded samples again; while the mixer is still
//   starting, a press's own sample and its start go over before the other
//   samples.
// - Browsers only start audio after a tap, but a context may be made before
//   one (it starts suspended). [open] (Live came on screen) sets everything
//   up at once, the worklet loaded and the samples sent, and wakes it only
//   when the page has already had a tap (navigator.userActivation
//   .hasBeenActive); otherwise the first press only wakes it, through
//   [resumeInGesture] (call it synchronously in the press handler) or
//   [press]. A touch only counts as a tap when the finger lifts, so
//   [release] (pointerup) wakes a suspended output too, but not one
//   [suspend]ed because Live is away.
// - Leaving Live or hiding the tab [suspend]s the output (Kotlin closes its
//   output): the context, the worklet and the samples stay, so coming back
//   is as quick as the first press. The controller [close]s it after a while
//   away, or when the page unloads.
// - [cut]: a press that turned into a scroll (the all-groups page) ends in
//   VoiceMixer.CHOKE_MS, whatever the minimum gate.
// - No audio focus. A context the system suspends or interrupts (a call,
//   another app, iOS) stops the voices, as losing focus does.
// - No output route: a press's latency comes from the context's output
//   timestamp (or currentTime plus baseLatency/outputLatency), the route is
//   WebText.ROUTE, and Bluetooth (SoundPlayer.isBluetooth) is guessed from a
//   large output latency: [onSlowOutput] fires once per LiveAudio (once a run,
//   as ArcController's toldBluetooth). [late] is the output's delay while it
//   is long enough to be heard ([LATE_OUTPUT_MS]), for Live's display line,
//   where Android names Bluetooth from the route (LiveAudio.wireless).
// - Listeners are added after construction (the controller is made after its
//   deps); the debug-log lines ("live audio: …") come through [onLog].
// - The latency test's row ([engine], [OutputEngine]) is named from the
//   output's latencyHint and rate (LatencyText.webEngine; Android: its mode
//   and burst), so one choice's presses share a row however often it reopens.
//   The delay the browser reports drifts (and often reads 0 just after a
//   start), so it is only carried along for the estimate line, read again
//   when the output is set up and at each [onStarted] report, which carries it.
// - The FX bus ([control]): each setting's last value is kept (FxSetup) and
//   sent again to each new output, queued before any press it waits with; a
//   suspended output keeps its mixer, so nothing is resent on a wake (Kotlin
//   resends to a native stream reopened on a new route too). A press's shape
//   ([LivePressOptions.shape]) is VoiceShape's fields over the defaults, sent
//   as they are (Kotlin hands over a whole VoiceShape).

import { signal, type ReadonlySignal, type Signal } from '@preact/signals'
import { LatencyText, WebLatencyHint } from '../../core/text/latencyText'
import { WebText } from '../../core/text/webText'
import type { VoiceShape } from '../../core/formats/voiceMixer'
import { FxSetup } from './fxSetup'
import { LIVE_PROCESSOR, MixerHost, transferable, type FromMixer, type ToMixer } from './liveMixer'
// The AudioWorklet module's URL: Vite bundles liveWorklet.ts (with the core
// mixer) into one self-contained script. (`new URL('./liveWorklet.ts',
// import.meta.url)` would copy the TypeScript unbuilt: Vite only bundles that
// form inside `new Worker(...)`.)
import workletUrl from './liveWorklet?worker&url'

export { LIVE_PROCESSOR, MixerHost, transferable, type FromMixer, type StartedVoice, type ToMixer } from './liveMixer'

/**
 * An output latency (baseLatency + outputLatency) at least this long is taken
 * for Bluetooth, which the web can't name (typically 150-300 ms, where a
 * speaker or wired headphones are 10-60 ms).
 */
export const SLOW_OUTPUT_MS = 120

/**
 * An output latency at least this long is heard against the finger
 * (whatever the route): [LiveAudio.late] reports it, and Live's display line
 * says so (MirrorText.slowOutput).
 */
export const LATE_OUTPUT_MS = 80

/**
 * [LiveAudio.late] moves only by this much or more, or across
 * [LATE_OUTPUT_MS]: an estimate that wanders by a millisecond or two as the
 * output runs doesn't change (and re-announce) the display line.
 */
export const LATE_STEP_MS = 10

/**
 * How many glitches (playbackStats underruns, counted from when the output
 * last woke) an output at latencyHint 0 may have before the next output asks
 * for 'interactive'. One or two come with a wake-up; more is a buffer too small.
 */
export const LATENCY_GLITCHES = 3

/**
 * A glitching output ([LATENCY_GLITCHES]) is replaced only when nothing has
 * sounded and nothing was pressed for this long: a press's voice shows in the
 * mixer's reports a render quantum or two after it is sent, so a quiet report
 * this much later can't have missed one.
 */
export const REPLACE_QUIET_MS = 100

/** The latencyHint Live asks for: 0 (the smallest buffer the browser allows), or 'interactive' after glitches. */
export type LiveLatencyHint = 0 | 'interactive'

/** The debug choice [choice] as the latencyHint it asks for. */
export function hintOf(choice: WebLatencyHint): LiveLatencyHint {
  return choice === WebLatencyHint.INTERACTIVE ? 'interactive' : 0
}

/** The latencyHint [hint] as the debug choice it is. */
export function choiceOf(hint: LiveLatencyHint): WebLatencyHint {
  return hint === 'interactive' ? WebLatencyHint.INTERACTIVE : WebLatencyHint.ZERO
}

/**
 * An output as the latency test names it (state/deps.ts LiveEngineInfo): its
 * row's label (LatencyText.webEngine, the key in LatencyStats) and the delay
 * it reported last, for the estimate line.
 */
export interface OutputEngine {
  readonly label: string
  readonly baseMs: number
  /** Null where the browser doesn't report the output's own delay. */
  readonly outputMs: number | null
}

/** [ctx]'s engine at latencyHint [hint]: an output delay of 0 is one the browser hasn't reported. */
export function outputEngine(
  hint: LiveLatencyHint,
  ctx: Pick<LiveContextLike, 'sampleRate' | 'baseLatency' | 'outputLatency'>,
): OutputEngine {
  const l = outputLatency(ctx)
  const outputMs = l.outputMs > 0 ? l.outputMs : null
  return { label: LatencyText.webEngine(choiceOf(hint), ctx.sampleRate), baseMs: l.baseMs, outputMs }
}

/** Little-endian 16-bit PCM bytes to samples (ArcController's PadAudio.of). A partial last sample is dropped. */
export function s16leToInt16(pcm: Uint8Array): Int16Array {
  const n = pcm.length >> 1
  const out = new Int16Array(n)
  const dv = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true)
  return out
}

/** The bits of an AudioContext Live uses. */
export interface LiveContextLike {
  readonly state: string
  readonly sampleRate: number
  readonly currentTime: number
  /** Seconds the context adds before the output (absent on older Safari/Firefox). */
  readonly baseLatency?: number
  /** Seconds from the context to the speaker (0 or absent where unknown). */
  readonly outputLatency?: number
  resume(): Promise<void>
  /** Stops the output's clock, keeping everything (absent on very old browsers). */
  suspend?(): Promise<void>
  close(): Promise<void>
  getOutputTimestamp?(): { contextTime?: number; performanceTime?: number }
  addEventListener?(type: 'statechange', listener: () => void): void
  /** The output's glitches so far (AudioPlaybackStats; absent in most browsers). */
  readonly playbackStats?: { readonly underrunEvents?: number } | null
}

/** A running mixer the main thread sends commands to. */
export interface MixerLink {
  /** 'AudioWorklet' or 'ScriptProcessor', for the debug log. */
  readonly kind: string
  send(m: ToMixer): void
  close(): void
}

/** What [LiveAudio] needs from the browser; tests pass a fake. */
export interface LiveBackend {
  /** Whether there is any audio output (an AudioContext) at all. */
  supported(): boolean
  /**
   * A new output context ([sampleRate]: one to ask for, else the device's
   * own) asking for [latencyHint] ('interactive' where that can't be made),
   * or null. Before a tap it starts suspended.
   */
  createContext(sampleRate: number | undefined, latencyHint: LiveLatencyHint): LiveContextLike | null
  /** Starts a mixer on [ctx] whose reports go to [onMessage]. */
  connect(ctx: LiveContextLike, onMessage: (m: FromMixer) => void): Promise<MixerLink>
  /** performance.now(): the clock press times are on. */
  now(): number
  /** Whether the page has had a tap, so an output woken now (outside a tap) is allowed to sound. */
  gestureSeen(): boolean
  /** The latencyHint an earlier output in this tab stepped back to (it survives a reload); absent: 0. */
  savedHint?(): LiveLatencyHint
  /** Keeps [hint] for the rest of the tab's session. */
  saveHint?(hint: LiveLatencyHint): void
  /** The debug screen's latencyHint choice, as kept; absent: ZERO. */
  savedChoice?(): WebLatencyHint
  /** Keeps the debug screen's choice (across sessions). */
  saveChoice?(choice: WebLatencyHint): void
}

/** [LiveAudio.press]'s options (state/deps.ts LivePress). */
export interface LivePressOptions {
  /** Semitones from the sample's own pitch (KEYS; 0 for a pad). */
  readonly pitch: number
  /** True: sounds until release(id), then fades quickly. False: plays to the end. */
  readonly gate: boolean
  /** When the finger came down (performance.now() ms: the input event's timeStamp), for the latency note; default: now. */
  readonly pressedAt?: number
  /** How the pad plays it: VoiceShape's fields over the defaults (its FX group and sidechain source among them); default: the mixer's own. */
  readonly shape?: Partial<VoiceShape>
}

/** The output's latency in ms: the context's own, and the device's after it. */
export interface OutputLatency {
  readonly baseMs: number
  readonly outputMs: number
}

/** [ctx]'s latency, from baseLatency and outputLatency (0 where unknown). */
export function outputLatency(ctx: Pick<LiveContextLike, 'baseLatency' | 'outputLatency'>): OutputLatency {
  const ms = (s: number | undefined) => (typeof s === 'number' && Number.isFinite(s) && s > 0 ? s * 1000 : 0)
  return { baseMs: ms(ctx.baseLatency), outputMs: ms(ctx.outputLatency) }
}

/** Whether [l] is long enough to be Bluetooth (SoundPlayer.isBluetooth's stand-in). */
export function isSlowOutput(l: OutputLatency): boolean {
  return l.baseMs + l.outputMs >= SLOW_OUTPUT_MS
}

/** [l]'s whole delay in ms, rounded, when it is long enough to be heard ([LATE_OUTPUT_MS]); else null. */
export function lateBy(l: OutputLatency): number | null {
  const ms = l.baseMs + l.outputMs
  return ms >= LATE_OUTPUT_MS ? Math.round(ms) : null
}

/** The glitches [ctx] has reported so far (playbackStats.underrunEvents), or null where the browser doesn't say. */
export function underruns(ctx: Pick<LiveContextLike, 'playbackStats'>): number | null {
  let n: unknown
  try {
    n = ctx.playbackStats?.underrunEvents
  } catch {
    return null
  }
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * When (performance.now() ms) the frame at context time [time] (s) is heard:
 * from the output timestamp when the context has one, else from currentTime
 * (the next frame to render) plus the output's latency. [now] is
 * performance.now().
 */
export function heardAt(
  time: number,
  now: number,
  ctx: Pick<LiveContextLike, 'currentTime' | 'baseLatency' | 'outputLatency' | 'getOutputTimestamp'>,
): number {
  let ts: { contextTime?: number; performanceTime?: number } | undefined
  try {
    ts = ctx.getOutputTimestamp?.()
  } catch {
    ts = undefined
  }
  const ct = ts?.contextTime
  const pt = ts?.performanceTime
  if (typeof ct === 'number' && typeof pt === 'number' && ct > 0 && pt > 0) return pt + (time - ct) * 1000
  const l = outputLatency(ctx)
  return now + (time - ctx.currentTime) * 1000 + l.baseMs + l.outputMs
}

/** How the output was set up, for the debug log: "48000 Hz, AudioWorklet, base latency 5 ms, output latency 21 ms". */
export function describeOutput(ctx: LiveContextLike, kind: string): string {
  const l = outputLatency(ctx)
  const out = l.outputMs > 0 ? `${l.outputMs.toFixed(0)} ms` : 'not known yet'
  return `${ctx.sampleRate} Hz, ${kind}, base latency ${l.baseMs.toFixed(0)} ms, output latency ${out}`
}

/** A sample loaded under a key. */
interface Sample {
  readonly id: number
  readonly pcm: Int16Array
  readonly channels: number
  readonly sampleRate: number
}

/** One open output. */
interface Stream {
  readonly ctx: LiveContextLike
  /** The latencyHint it asked for. */
  readonly hint: LiveLatencyHint
  /** Its glitches when it last woke (null: not yet, or the browser doesn't say), counted from there. */
  underrunsAtRun: number | null
  link: MixerLink | null
  /** Commands sent before the mixer was ready, in order (samples' loads apart, below). */
  readonly pending: ToMixer[]
  /** Samples' loads waiting for the mixer, by sample id. */
  readonly pendingLoads: Map<number, ToMixer>
  /** Of those, the ones a press waits for: they go over first. */
  readonly urgent: Set<number>
  /** Sample ids sent over. */
  readonly loaded: Set<number>
  closed: boolean
  ran: boolean
  /** Suspended because Live is away: a late release doesn't wake it. */
  parked: boolean
  /** When the latest press was sent to it (performance.now() ms), for [REPLACE_QUIET_MS]. */
  pressedAt: number
  /** A [LiveAudio.replaceStale] check is due. */
  recheck: boolean
  /** Its row in the latency test as last read ([LiveAudio.engineOf]); null before it is set up. */
  engine: OutputEngine | null
}

const EMPTY: ReadonlySet<string> = new Set()

/** Live's sound output on Web Audio (state/deps.ts LiveAudioDeps). */
export class LiveAudio {
  private readonly _voices = signal<ReadonlySet<string>>(EMPTY)
  /** The voices sounding (pad and key ids), for the rings. */
  readonly voices: ReadonlySignal<ReadonlySet<string>> = this._voices
  private readonly _late = signal<number | null>(null)
  /**
   * The open output's whole delay in ms while it is long enough to be heard
   * against the finger ([LATE_OUTPUT_MS] and up), else null: Live's display
   * line says so. Known once the output runs; checked again at each press,
   * and changed only by [LATE_STEP_MS] or more.
   */
  readonly late: ReadonlySignal<number | null> = this._late
  private readonly _latencyHint: Signal<WebLatencyHint>
  /** The debug screen's latencyHint choice ([setLatencyHint]); ZERO unless changed there. */
  readonly latencyHint: ReadonlySignal<WebLatencyHint>
  private readonly _engine = signal<OutputEngine | null>(null)
  /** The open output's row in the latency test, once it is set up; null before, or with none open. */
  readonly engine: ReadonlySignal<OutputEngine | null> = this._engine
  private _description = ''
  private stream: Stream | null = null
  private rate: number | undefined = undefined
  /** An output at 0 glitched ([checkGlitches]): 'interactive' for the tab's session, or until a new choice. */
  private steppedBack: boolean
  private toldSlow = false
  private nextId = 1
  private readonly samples = new Map<string, Sample>()
  /** The FX bus's settings, for each new output. */
  private readonly fx = new FxSetup()
  /** Voices pressed with gate false: a release doesn't cut them short. */
  private readonly ungated = new Set<string>()
  private readonly startedListeners = new Set<(id: string, latencyMs: number, route: string, engine: OutputEngine) => void>()
  private readonly slowListeners = new Set<(outputMs: number) => void>()
  private readonly logListeners = new Set<(line: string) => void>()

  constructor(private readonly backend: LiveBackend = browserLiveBackend()) {
    this.steppedBack = backend.savedHint?.() === 'interactive'
    this._latencyHint = signal(backend.savedChoice?.() ?? WebLatencyHint.ZERO)
    this.latencyHint = this._latencyHint
  }

  /** The latencyHint the next output asks for: the choice, or 'interactive' after a step back from 0. */
  private get hint(): LiveLatencyHint {
    return this.steppedBack ? 'interactive' : hintOf(this._latencyHint.peek())
  }

  /** How the output was set up, for the debug log; "" before it opens. */
  get description(): string {
    return this._description
  }

  /** Whether an output is set up (or being set up). */
  get isOpen(): boolean {
    return this.stream !== null
  }

  /** The open output's latency, or null. */
  latency(): OutputLatency | null {
    return this.stream ? outputLatency(this.stream.ctx) : null
  }

  /** Each voice heard: [latencyMs] from its press to its first frame leaving the output ([engine]: the latency test's row). */
  onStarted(listener: (id: string, latencyMs: number, route: string, engine: OutputEngine) => void): () => void {
    return add(this.startedListeners, listener)
  }

  /**
   * The debug screen's latencyHint choice: kept, and an open output that asks
   * for another hint is replaced at once (a suspended one is let go, and
   * [open] makes the new one). A step back after glitches is forgotten, so 0
   * is tried afresh.
   */
  setLatencyHint(choice: WebLatencyHint): void {
    if (choice === this._latencyHint.peek()) return
    this._latencyHint.value = choice
    this.backend.saveChoice?.(choice)
    if (this.steppedBack) {
      this.steppedBack = false
      this.backend.saveHint?.(0)
    }
    this.note(`live audio: ${LatencyText.hint(choice)} chosen`)
    const s = this.stream
    if (!s || s.hint === this.hint) return
    const away = s.parked
    this.close()
    if (away) return
    const next = this.ensure()
    if (next && this.backend.gestureSeen()) wake(next.ctx)
  }

  /** The output looks like Bluetooth ([outputMs] of latency): once per LiveAudio. */
  onSlowOutput(listener: (outputMs: number) => void): () => void {
    return add(this.slowListeners, listener)
  }

  /** Lines for the debug log: how the output was set up, or why there is none. */
  onLog(listener: (line: string) => void): () => void {
    return add(this.logListeners, listener)
  }

  /**
   * Live came on screen: sets the output up now, before any press (the
   * worklet loaded, the samples sent), or wakes a suspended one. Before the
   * page's first tap it stays suspended and the first press wakes it.
   * [sampleRate]: a rate to ask for. False when there is no audio output at all.
   */
  open(sampleRate?: number): boolean {
    if (sampleRate !== undefined) this.rate = sampleRate
    if (!this.stream && !this.backend.supported()) return false
    const s = this.ensure()
    if (!s) return false
    s.parked = false
    if (this.backend.gestureSeen()) wake(s.ctx)
    return true
  }

  /**
   * Live left the screen or the tab was hidden: what was sounding stops and
   * the output is suspended, its worklet and samples kept for [open]. One
   * whose latencyHint was stepped back from ([checkGlitches]) is let go of
   * instead, so [open] makes one at the new hint.
   */
  suspend(): void {
    const s = this.stream
    this.ungated.clear()
    this._voices.value = EMPTY
    if (!s || s.closed) return
    this.checkGlitches(s)
    if (s.hint !== this.hint) {
      this.close()
      return
    }
    s.parked = true
    send(s, { t: 'stopAll' })
    if (s.ctx.suspend && s.ctx.state !== 'closed') {
      // The state reads 'running' until the suspend settles: Live back meanwhile (a quick tab
      // switch) found nothing to wake, so it is woken now, as [open] would have.
      s.ctx.suspend().then(
        () => {
          if (!s.closed && !s.parked && this.stream === s && this.backend.gestureSeen()) wake(s.ctx)
        },
        () => undefined,
      )
    }
  }

  /** Lets the output go (long away, or the page unloads); what was sounding stops. The samples stay loaded. */
  close(): void {
    const s = this.stream
    this.stream = null
    this.ungated.clear()
    this._voices.value = EMPTY
    this._late.value = null
    this._engine.value = null
    if (!s) return
    this.checkGlitches(s)
    s.closed = true
    s.pending.length = 0
    s.pendingLoads.clear()
    s.urgent.clear()
    if (s.link) quietly(() => s.link?.close())
    s.ctx.close().catch(() => undefined)
  }

  /** Creates or wakes the output. Call synchronously in a press handler, before any await. */
  resumeInGesture(): void {
    const s = this.ensure()
    if (!s) return
    s.parked = false
    wake(s.ctx)
  }

  /** Loads a decoded sample (16-bit, [channels] interleaved) under [key], ready for [press]. */
  preload(key: string, pcm: Int16Array, channels: number, sampleRate: number): void {
    const old = this.samples.get(key)
    if (old && old.pcm === pcm && old.channels === channels && old.sampleRate === sampleRate) return
    if (old) this.drop(old)
    const sample: Sample = { id: this.nextId++, pcm, channels, sampleRate }
    this.samples.set(key, sample)
    if (this.stream) this.load(this.stream, sample)
  }

  has(key: string): boolean {
    return this.samples.has(key)
  }

  /** Drops the sample under [key], or every sample. A voice playing it plays on. */
  unload(key?: string): void {
    if (key === undefined) {
      for (const s of this.samples.values()) this.drop(s)
      this.samples.clear()
      return
    }
    const s = this.samples.get(key)
    if (!s) return
    this.samples.delete(key)
    this.drop(s)
  }

  /**
   * Starts voice [id] (a pad "live:g:o" or a key) playing the sample under
   * [key]. Opens the output first if Live hasn't. False when there is no
   * output, [key] isn't loaded or the sample has more than two channels.
   */
  press(id: string, key: string, options: LivePressOptions): boolean {
    const sample = this.samples.get(key)
    if (!sample || !(sample.channels >= 1 && sample.channels <= 2)) return false
    const s = this.ensure()
    if (!s) return false
    s.parked = false
    wake(s.ctx)
    this.load(s, sample)
    first(s, sample.id)
    if (options.gate) this.ungated.delete(id)
    else this.ungated.add(id)
    const pressedAt = options.pressedAt ?? this.backend.now()
    s.pressedAt = this.backend.now()
    const start: ToMixer = {
      t: 'start',
      key: id,
      id: sample.id,
      channels: sample.channels,
      sampleRate: sample.sampleRate,
      semitones: options.pitch,
      tag: pressedAt > 0 ? pressedAt : 0,
    }
    send(s, options.shape === undefined ? start : { ...start, shape: options.shape })
    return true
  }

  /** The finger left: voice [id] fades out (after VoiceMixer.MIN_GATE_MS at the least). */
  release(id: string): void {
    // On a touch screen the browser lets a page start audio when the finger
    // lifts, not when it lands: the first press on a fresh page made the
    // output, and the release (called from pointerup) is what wakes it.
    if (this.stream && !this.stream.closed && !this.stream.parked) wake(this.stream.ctx)
    if (this.ungated.has(id)) return
    if (this.stream) send(this.stream, { t: 'release', key: id })
  }

  /** The press became a scroll: voice [id] ends in VoiceMixer.CHOKE_MS, minimum gate or not. */
  cut(id: string): void {
    this.ungated.delete(id)
    if (this.stream) send(this.stream, { t: 'cut', key: id })
  }

  stopAll(): void {
    this.ungated.clear()
    if (this.stream) send(this.stream, { t: 'stopAll' })
  }

  /**
   * Sets up the mix's FX bus: [what] is one of FxControl's commands, with its
   * [index], [x] and [y]. It reaches the open output (or waits with its
   * presses while the mixer starts) and is kept for the next output, a
   * punch-in excepted. It never opens or wakes the output.
   */
  control(what: number, index: number, x: number, y: number): void {
    this.fx.record(what, index, x, y)
    if (this.stream) send(this.stream, { t: 'control', what, index, x, y })
  }

  private drop(sample: Sample): void {
    const s = this.stream
    if (!s?.loaded.delete(sample.id)) return
    // Not sent over yet: it simply isn't.
    if (s.pendingLoads.delete(sample.id)) {
      s.urgent.delete(sample.id)
      return
    }
    send(s, { t: 'unload', id: sample.id })
  }

  private load(s: Stream, sample: Sample): void {
    if (s.loaded.has(sample.id)) return
    s.loaded.add(sample.id)
    // The link copies what crosses to the audio thread (transferable): this one stays the main thread's.
    const m: ToMixer = { t: 'load', id: sample.id, pcm: sample.pcm }
    if (s.link) s.link.send(m)
    else s.pendingLoads.set(sample.id, m)
  }

  /** The open output, set up first if there is none (suspended until a tap wakes it). */
  private ensure(): Stream | null {
    if (this.stream) return this.stream
    let ctx: LiveContextLike | null = null
    try {
      ctx = this.backend.createContext(this.rate, this.hint)
      if (!ctx) this.note('live audio: no output')
    } catch (e) {
      this.note(`live audio: no output (${message(e)})`)
    }
    if (!ctx) return null
    const s: Stream = {
      ctx,
      hint: this.hint,
      underrunsAtRun: null,
      link: null,
      pending: [],
      pendingLoads: new Map(),
      urgent: new Set(),
      loaded: new Set(),
      closed: false,
      ran: false,
      parked: false,
      pressedAt: Number.NEGATIVE_INFINITY,
      recheck: false,
      engine: null,
    }
    this.stream = s
    // The samples loaded, ready again, and the FX bus as it was set up (before any press).
    for (const sample of this.samples.values()) this.load(s, sample)
    for (const c of this.fx.commands()) send(s, { t: 'control', what: c.what, index: c.index, x: c.x, y: c.y })
    ctx.addEventListener?.('statechange', () => this.stateChanged(s))
    this.backend.connect(ctx, (m) => this.received(s, m)).then(
      (link) => {
        if (s.closed) {
          quietly(() => link.close())
          return
        }
        s.link = link
        flush(s, link)
        this._description = describeOutput(ctx, link.kind)
        this.note(`live audio: ${this._description}`)
        // Its row shows from now, before the first press.
        this.engineOf(s)
        if (ctx.state === 'running') this.ran(s)
      },
      (e: unknown) => {
        if (s.closed) return
        this.note(`live audio: no output (${message(e)})`)
        // The next press tries again.
        this.close()
      },
    )
    return s
  }

  private stateChanged(s: Stream): void {
    if (s.closed || this.stream !== s) return
    const state = s.ctx.state
    if (state === 'running') {
      if (!s.link) return
      // Woken again: the last stretch's glitches are weighed, and they count from here (a
      // wake-up may bring one of its own).
      if (s.ran) {
        this.checkGlitches(s)
        s.underrunsAtRun = underruns(s.ctx)
      }
      this.ran(s)
    } else if (state !== 'closed' && this._voices.value.size !== 0) {
      // The system took the output (a call, another app): the sounds stop.
      this.stopAll()
    }
  }

  /** The output is sounding: its latency, now known, goes in the debug log. */
  private ran(s: Stream): void {
    if (s.ran) return
    s.ran = true
    s.underrunsAtRun = underruns(s.ctx)
    this._description = describeOutput(s.ctx, s.link?.kind ?? '')
    this.note(`live audio running: ${this._description}`)
    this.checkSlow(s)
  }

  /** [late], and the Bluetooth guess (once per LiveAudio), from the output's latency now. */
  private checkSlow(s: Stream): void {
    const l = outputLatency(s.ctx)
    const late = lateBy(l)
    const shown = this._late.value
    if (late === null || shown === null || Math.abs(late - shown) >= LATE_STEP_MS) this._late.value = late
    if (this.toldSlow || !isSlowOutput(l)) return
    this.toldSlow = true
    for (const f of [...this.slowListeners]) f(l.baseMs + l.outputMs)
  }

  /** An output at latencyHint 0 that glitched [LATENCY_GLITCHES] times since it woke: the next one asks for 'interactive'. */
  private checkGlitches(s: Stream): void {
    if (s.hint !== 0 || this.hint !== 0 || s.underrunsAtRun === null) return
    const n = underruns(s.ctx)
    if (n === null || n - s.underrunsAtRun < LATENCY_GLITCHES) return
    this.steppedBack = true
    this.backend.saveHint?.('interactive')
    this.note(`live audio: ${n - s.underrunsAtRun} glitches at the lowest latency; the next output asks for 'interactive'`)
  }

  /**
   * [s] asks for a latencyHint since stepped back from: once nothing sounds
   * and nothing was pressed for [REPLACE_QUIET_MS] (checked again that long
   * after a recent press), it makes way for a new output at the new hint (the
   * samples go over again, as for any new one), woken when the page has had a tap.
   */
  private replaceStale(s: Stream): void {
    if (s.closed || this.stream !== s || s.hint === this.hint || this._voices.value.size !== 0) return
    const wait = s.pressedAt + REPLACE_QUIET_MS - this.backend.now()
    if (wait > 0) {
      if (!s.recheck) {
        s.recheck = true
        setTimeout(() => {
          s.recheck = false
          this.replaceStale(s)
        }, wait)
      }
      return
    }
    this.close()
    const next = this.ensure()
    if (next && this.backend.gestureSeen()) wake(next.ctx)
  }

  private received(s: Stream, m: FromMixer): void {
    if (s.closed || this.stream !== s) return
    switch (m.t) {
      case 'keys':
        this._voices.value = m.keys.length === 0 ? EMPTY : new Set(m.keys)
        // Quiet: an output that glitched can go now.
        if (m.keys.length === 0) this.replaceStale(s)
        return
      case 'started': {
        const now = this.backend.now()
        for (const v of m.voices) {
          if (v.tag <= 0) continue
          const ms = heardAt(v.time, now, s.ctx) - v.tag
          const engine = this.engineOf(s)
          for (const f of [...this.startedListeners]) f(v.key, ms, WebText.ROUTE, engine)
        }
        // An output that changed (Bluetooth headphones connected) shows in the latency.
        this.checkSlow(s)
        this.checkGlitches(s)
        return
      }
    }
  }

  /** [s]'s row in the latency test, with the delay it reports now: a new value only when that changed. */
  private engineOf(s: Stream): OutputEngine {
    const e = outputEngine(s.hint, s.ctx)
    const was = s.engine
    if (was !== null && was.label === e.label && was.baseMs === e.baseMs && was.outputMs === e.outputMs) return was
    s.engine = e
    if (this.stream === s) this._engine.value = e
    return e
  }

  private note(line: string): void {
    for (const f of [...this.logListeners]) f(line)
  }
}

function add<F>(set: Set<F>, f: F): () => void {
  set.add(f)
  return () => {
    set.delete(f)
  }
}

function send(s: Stream, m: ToMixer): void {
  if (s.link) s.link.send(m)
  else s.pending.push(m)
}

/** While the mixer is still starting, sample [id]'s load goes first (a press waits for it, not for every sample). */
function first(s: Stream, id: number): void {
  if (!s.link && s.pendingLoads.has(id)) s.urgent.add(id)
}

/**
 * The mixer is ready: the loads presses wait for, then the commands in their
 * order (a stopAll still before a later start), then the other samples, so a
 * press's start crosses (and is mixed) before every other sample is copied over.
 */
function flush(s: Stream, link: MixerLink): void {
  for (const id of s.urgent) {
    const m = s.pendingLoads.get(id)
    if (m === undefined) continue
    s.pendingLoads.delete(id)
    link.send(m)
  }
  s.urgent.clear()
  for (const m of s.pending.splice(0)) link.send(m)
  for (const m of s.pendingLoads.values()) link.send(m)
  s.pendingLoads.clear()
}

function wake(ctx: LiveContextLike): void {
  if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
    // Not awaited: outside a tap the promise may only settle on the next one.
    ctx.resume().catch(() => undefined)
  }
}

function quietly(fn: () => void): void {
  try {
    fn()
  } catch {
    // Already closed.
  }
}

function message(e: unknown): string {
  return e instanceof Error && e.message.length !== 0 ? e.message : String(e)
}

// ---------------------------------------------------------------------------
// The browser

/** Where [browserLiveBackend] keeps the latencyHint stepped back to, for the tab's session. */
export const HINT_KEY = 'arc.liveLatencyHint'

/** Where it keeps the debug screen's latencyHint choice (localStorage: a debug option, not in library.json). */
export const CHOICE_KEY = 'arc.liveLatencyChoice'

/** ScriptProcessorNode's buffer where there is no AudioWorklet: its smallest. */
export const FALLBACK_FRAMES = 256

/** The worklet mixer: commands go over the node's port (a sample's copy moved, not cloned). */
async function workletLink(ctx: AudioContext, onMessage: (m: FromMixer) => void): Promise<MixerLink> {
  await ctx.audioWorklet.addModule(workletUrl)
  const node = new AudioWorkletNode(ctx, LIVE_PROCESSOR, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
  node.port.onmessage = (e: MessageEvent<FromMixer>) => onMessage(e.data)
  node.connect(ctx.destination)
  return {
    kind: 'AudioWorklet',
    send: (m) => {
      const [msg, transfer] = transferable(m)
      node.port.postMessage(msg, transfer)
    },
    close: () => {
      node.port.onmessage = null
      node.disconnect()
      node.port.close()
    },
  }
}

/** The main-thread mixer, for browsers without AudioWorklet (or where it fails to load). */
function scriptLink(ctx: AudioContext, onMessage: (m: FromMixer) => void): MixerLink {
  const host = new MixerHost(ctx.sampleRate, onMessage)
  const node = ctx.createScriptProcessor(FALLBACK_FRAMES, 1, 2)
  node.onaudioprocess = (e) => {
    const out = e.outputBuffer
    host.render(out.getChannelData(0), out.getChannelData(1), out.length, e.playbackTime)
  }
  node.connect(ctx.destination)
  return {
    kind: 'ScriptProcessor',
    send: (m) => host.handle(m),
    close: () => {
      node.onaudioprocess = null
      node.disconnect()
    },
  }
}

type AudioContextClass = new (options?: AudioContextOptions) => AudioContext

function audioContextClass(): AudioContextClass | undefined {
  const g = globalThis as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass }
  return g.AudioContext ?? g.webkitAudioContext
}

/** [LiveBackend] on the browser's Web Audio. */
export function browserLiveBackend(): LiveBackend {
  return {
    supported: () => audioContextClass() !== undefined,
    createContext: (sampleRate, latencyHint) => {
      const Ctor = audioContextClass()
      if (!Ctor) return null
      // No sampleRate unless asked: the device's own, so nothing is resampled after the mix.
      const make = (hint: LiveLatencyHint): LiveContextLike =>
        new Ctor(sampleRate ? { latencyHint: hint, sampleRate } : { latencyHint: hint }) as unknown as LiveContextLike
      if (latencyHint === 'interactive') return make('interactive')
      try {
        return make(latencyHint)
      } catch {
        // A browser that takes only the named hints.
        return make('interactive')
      }
    },
    connect: async (c, onMessage) => {
      const ctx = c as unknown as AudioContext
      let why: unknown = null
      if (typeof AudioWorkletNode === 'function' && ctx.audioWorklet) {
        try {
          return await workletLink(ctx, onMessage)
        } catch (e) {
          why = e
        }
      }
      if (typeof ctx.createScriptProcessor !== 'function') throw why ?? new Error('no AudioWorklet')
      return scriptLink(ctx, onMessage)
    },
    now: () => performance.now(),
    gestureSeen: () => {
      const ua = (globalThis.navigator as { userActivation?: { hasBeenActive?: boolean } } | undefined)?.userActivation
      return ua?.hasBeenActive === true
    },
    savedHint: () => {
      try {
        return globalThis.sessionStorage?.getItem(HINT_KEY) === 'interactive' ? 'interactive' : 0
      } catch {
        // Storage blocked: the step back lasts the page.
        return 0
      }
    },
    saveHint: (hint) => {
      try {
        globalThis.sessionStorage?.setItem(HINT_KEY, String(hint))
      } catch {
        // Storage blocked or full: the step back lasts the page.
      }
    },
    savedChoice: () => {
      try {
        return globalThis.localStorage?.getItem(CHOICE_KEY) === WebLatencyHint.INTERACTIVE ? WebLatencyHint.INTERACTIVE : WebLatencyHint.ZERO
      } catch {
        return WebLatencyHint.ZERO
      }
    },
    saveChoice: (choice) => {
      try {
        globalThis.localStorage?.setItem(CHOICE_KEY, choice)
      } catch {
        // Storage blocked or full: the choice lasts the page.
      }
    },
  }
}
