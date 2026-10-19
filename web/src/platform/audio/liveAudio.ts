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
//   [LATENCY_GLITCHES] within [GLITCH_WINDOW_MS]) is replaced by one at
//   'interactive' at the next quiet moment: once nothing sounds and nothing
//   was pressed for a few seconds ([REPLACE_QUIET_MS]), or when Live leaves. The step back holds for the
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
//   moved to the worklet: liveProtocol's transferable), and a press only names
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
//   is long enough to be heard ([LATE_OUTPUT_MS]), for the top bar's Bluetooth
//   key, where Android names Bluetooth from the route (LiveAudio.wireless).
//   Make up for Bluetooth delay ([makeUpDelay], [delayMs], [madeUpFor]) takes
//   the same guess for wireless: the latency the context reports is what its
//   stamp counts, and OutputDelay.ms the rest of a typical link's delay.
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
// - [setOutputVolume] (the drawn EP-133's VOLUME, web only): a GainNode
//   between the mixer and the speakers, at the volume's levelGain. It is
//   monitoring only: a take records the mix before it, as the device's own
//   volume leaves its sampling alone. Kept in this browser's localStorage
//   ([VOLUME_KEY]), as the debug screen's latencyHint choice is.
// - [setClickLevel] (the drawn EP-133's metronome level, TEMPO's Y, web
//   only): the click's gain in the mixer ('clickLevel', the level's
//   levelGain, so v²), the count-in's too; 0 is silent. Sent to the open
//   output and to each new one (while not 1), kept in localStorage
//   ([CLICK_LEVEL_KEY]) as VOLUME is.

import { signal, type ReadonlySignal, type Signal } from '@preact/signals'
import { REC_ARMED, REC_IDLE, type RecState } from '../../core/features/takeRecorder'
import { wavHeader } from '../../core/formats/wav'
import { LatencyText, WebLatencyHint } from '../../core/text/latencyText'
import { WebText } from '../../core/text/webText'
import type { VoiceShape } from '../../core/formats/voiceMixer'
import type { ArpNote, ArpSettings } from '../../core/features/arp'
import { Seq, type Pattern, type ProjectPatterns, type TimingSettings } from '../../core/features/pattern'
import { frameAt, type FrameClock } from '../../core/features/sampleTiming'
import type { PhaseAnchors, TransportClock } from '../../core/features/sequencer'
import type { Beat, BeatGrid } from '../../core/features/tempo'
import type { FrameGrid } from './clickScheduler'
import { FxSetup } from './fxSetup'
import { levelGain } from '../../core/features/fxSettings'
import { OutputDelay } from '../../core/features/outputDelay'
import type { FromMixer, PlanVoice, ToMixer } from './liveMixer'
import { LIVE_PROCESSOR, transferable } from './liveProtocol'
import type { ArpStep } from './patternScheduler'
import type { TapPhase, TapTake } from './sampleTap'
import { PeakMeter } from '../../core/features/peakMeter'
// The AudioWorklet module's URL: Vite bundles liveWorklet.ts (with the core
// mixer) into one self-contained script. (`new URL('./liveWorklet.ts',
// import.meta.url)` would copy the TypeScript unbuilt: Vite only bundles that
// form inside `new Worker(...)`.)
import workletUrl from './liveWorklet?worker&url'

export { LIVE_PROCESSOR, transferable } from './liveProtocol'
export type { FromMixer, StartedVoice, ToMixer } from './liveMixer'

/**
 * An output latency (baseLatency + outputLatency) at least this long is taken
 * for Bluetooth, which the web can't name (typically 150-300 ms, where a
 * speaker or wired headphones are 10-60 ms).
 */
export const SLOW_OUTPUT_MS = 120

/**
 * An output latency at least this long is heard against the finger
 * (whatever the route): [LiveAudio.late] reports it, and Live's top bar
 * shows its Bluetooth key (MirrorText.WIRELESS_DELAY).
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
 * last woke, over [GLITCH_WINDOW_MS]) an output at latencyHint 0 may have
 * before the next output asks for 'interactive'. One or two come with a
 * wake-up; more is a buffer too small.
 */
export const LATENCY_GLITCHES = 3

/**
 * The stretch (ms) [LATENCY_GLITCHES] are counted over: once the count is
 * older, it starts again, so a glitch every few minutes doesn't add up to a
 * step back (web only).
 */
export const GLITCH_WINDOW_MS = 30000

/**
 * A glitching output ([LATENCY_GLITCHES]) is replaced only when nothing has
 * sounded and nothing was pressed for this long: long enough that no press is
 * on its way and the FX bus's tail has mostly died away.
 */
export const REPLACE_QUIET_MS = 3000

/**
 * About how much of an output's sample backlog crosses to the mixer per task
 * once it is ready (bytes), so a reopened output doesn't hold up the next
 * press for one long copy of every sample (web only).
 */
export const FLUSH_SLICE_BYTES = 2 * 1024 * 1024

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
  /** The mixer's input from [media] (SAMPLE's mic), or none (null); absent: the mixer takes no input. */
  listen?(media: MediaStream | null): void
  /** The speakers' gain after the mixer (0..1, the volume's levelGain); absent: none to set. */
  volume?(gain: number): void
}

/** What opening the mic for SAMPLE came to: its channels, or why not. */
export type MicOpened =
  | { readonly ok: true; readonly channels: number }
  | { readonly ok: false; readonly why: 'denied' | 'none' | 'busy' | 'failed' }

/** A mic's own delay, from the air to the mixer's input, where the browser doesn't say (ms). */
export const MIC_LATENCY_MS = 10

/** Why [e] (getUserMedia's rejection) kept the mic closed. */
export function micWhy(e: unknown): 'denied' | 'none' | 'busy' | 'failed' {
  const name = (e as { name?: unknown } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'none'
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') return 'busy'
  return 'failed'
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
  /** The mic as raw as it comes ([stereo]: two channels where it has them); absent: no mic (getUserMedia). */
  micStream?(stereo: boolean): Promise<MediaStream>
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
  /** VOLUME as kept (0..1); absent or unreadable: 1. */
  savedVolume?(): number
  /** Keeps VOLUME (across sessions). */
  saveVolume?(volume: number): void
  /** The metronome level as kept (0..1); absent or unreadable: 1. */
  savedClickLevel?(): number
  /** Keeps the metronome level (across sessions). */
  saveClickLevel?(level: number): void
  /** Runs [fn] in a later task of its own; absent: a MessageChannel's (web only, tests pass their own). */
  later?(fn: () => void): void
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

/**
 * What the pattern sequencer plays (PatternScheduler's SeqPlan): the
 * project's [patterns], each pad's sound by its preloaded sample key ([voices],
 * by pad key group × 12 + offset), the notes' passes not to play ([skip]), the
 * tempo and where each group's pattern started ([phase]).
 */
export interface LiveSeqPlan {
  readonly patterns: ProjectPatterns
  readonly voices: ReadonlyMap<number, string>
  readonly skip: ReadonlyMap<number, number>
  readonly bpm: number
  readonly phase: PhaseAnchors
  /**
   * How each pad's voices play (pad key: its sound settings, its group's FX
   * bus, the sidechain's source); [keysShapes] for its KEYS notes. A pad left
   * out plays on its group's bus.
   */
  readonly shapes?: ReadonlyMap<number, Partial<VoiceShape>>
  readonly keysShapes?: ReadonlyMap<number, Partial<VoiceShape>>
  /** The patterns waiting to take over a group (scenes): each from its global tick, at its bar 1 there. */
  readonly queued?: ReadonlyMap<number, { readonly pattern: Pattern; readonly atTick: number }>
}

/**
 * What the arp or note repeat plays (PatternScheduler's ArpPlan): the notes
 * held, their pads' sounds by preloaded sample key ([voices], by pad key) and
 * how they play ([shapes], [keysShapes]; a pad left out plays on its group's
 * bus), KEYS's arp or PADS's note repeat ([keys]), TIMING, the arp's
 * settings, the tempo, the RANDOM order's [seed] and the run's press
 * ([pressMs], performance.now(): another one starts the run again).
 */
export interface LiveArpPlan {
  readonly notes: readonly ArpNote[]
  readonly voices: ReadonlyMap<number, string>
  readonly shapes?: ReadonlyMap<number, Partial<VoiceShape>>
  readonly keysShapes?: ReadonlyMap<number, Partial<VoiceShape>>
  readonly keys: boolean
  readonly timing: TimingSettings
  readonly settings: ArpSettings
  readonly bpm: number
  readonly seed: number
  readonly pressMs: number
}

/**
 * Where the transport is (PatternScheduler.kt's Timeline): its [clock] (ticks
 * to mix frames) and the output's stamp [frames] (mix frames to the
 * performance.now() they are heard at).
 */
export interface LiveTimeline {
  readonly clock: TransportClock
  readonly frames: FrameClock
}

/** A take TAKE recorded: a 16-bit stereo WAV of [frames] frames at [rate]. */
export interface RecordedTake {
  readonly wav: Blob
  readonly frames: number
  readonly rate: number
  readonly seconds: number
}

/** How long Live letting the output go waits for the mixer to finish a take before it is cut where it is. */
export const TAKE_END_WAIT_MS = 2000

/** The WAV of [chunks] (interleaved stereo frames, in order), cut to its first [keep] frames. */
export function takeWav(chunks: readonly Int16Array[], keep: number, rate: number): Blob {
  const parts: BlobPart[] = [wavHeader(keep * 4, 2, rate) as BlobPart]
  let left = keep * 2
  for (const c of chunks) {
    if (left <= 0) break
    const n = Math.min(left, c.length)
    const part = n === c.length ? c : c.subarray(0, n)
    // WAV is little-endian, as every browser's Int16Array is.
    parts.push(new Uint8Array(part.buffer, part.byteOffset, n * 2) as BlobPart)
    left -= n
  }
  return new Blob(parts, { type: 'audio/wav' })
}

/** The take being received from an output. */
interface Receiving {
  readonly chunks: Int16Array[]
  frames: number
  readonly rate: number
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
  /** When [underrunsAtRun] was read (performance.now() ms), for [GLITCH_WINDOW_MS]. */
  countedAt: number
  link: MixerLink | null
  /** Commands sent before the mixer was ready, in order (samples' loads apart, below). */
  readonly pending: ToMixer[]
  /** Samples' loads waiting for the mixer (or, once it is ready, for their slice of the backlog), by sample id. */
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
  /** When the mixer last reported nothing sounding (performance.now() ms), for [REPLACE_QUIET_MS]. */
  quietAt: number
  /** A [LiveAudio.replaceStale] check is due. */
  recheck: boolean
  /** Its row in the latency test as last read ([LiveAudio.engineOf]); null before it is set up. */
  engine: OutputEngine | null
  /** Let go with a take going: still listening for its end. */
  ending: boolean
  /** The take being received from this output. */
  receiving: Receiving | null
  /** The mix's latest stamp: mix frame to the performance.now() it is heard at (PATTERN). */
  stamp: FrameClock | null
  /** The sequencer's free tick at the stamp's frame (-Infinity stopped): what a queued switch may take over at. */
  freeTick: number
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
  private readonly _madeUp = signal<number | null>(null)
  /**
   * The delay in all (ms, OutputDelay.totalMs) while it is made up for (the
   * output taken for Bluetooth, [makeUpDelay] on), else null: the Bluetooth
   * key's words.
   */
  readonly madeUpFor: ReadonlySignal<number | null> = this._madeUp
  private readonly _bluetooth = signal<number | null>(null)
  /** The open output's latency (ms) while it is long enough to be taken for Bluetooth, else null: Settings' note on what is made up. */
  readonly bluetooth: ReadonlySignal<number | null> = this._bluetooth
  // Whether a wireless output's delay is made up for, and the delay made up for now (ms).
  private makingUp = true
  private delay = 0
  // The open output's latency as last read: taken for Bluetooth, and the part of it the stamp counts.
  private wireless = false
  private counted: number | null = null
  private readonly _latencyHint: Signal<WebLatencyHint>
  /** The debug screen's latencyHint choice ([setLatencyHint]); ZERO unless changed there. */
  readonly latencyHint: ReadonlySignal<WebLatencyHint>
  private readonly _volume: Signal<number>
  /** Live's VOLUME (0..1, the drawn EP-133's knob; [setOutputVolume]): 1 unless turned. */
  readonly volume: ReadonlySignal<number>
  private readonly _clickLevel: Signal<number>
  /** The click's level (0..1, the drawn EP-133's metronome level; [setClickLevel]): 1 unless turned. */
  readonly clickLevel: ReadonlySignal<number>
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
  private readonly takeListeners = new Set<(take: RecordedTake | null, limit: boolean) => void>()
  private readonly missingListeners = new Set<(pad: number) => void>()
  private readonly beatListeners = new Set<(beat: Beat) => void>()
  // TEMPO's click as last asked: on, the phone's tempo and the EP-133's beats (ms); sent again with each new stamp.
  private clickAsk: { on: boolean; bpm: number; grid: BeatGrid | null } = { on: false, bpm: 120, grid: null }
  private readonly _timeline = signal<LiveTimeline | null>(null)
  /** Where the pattern's transport is in heard time; null while stopped (LiveAudioDeps.timeline). */
  readonly timeline: ReadonlySignal<LiveTimeline | null> = this._timeline
  // The pattern's clock as the mixer last told it, the plan it plays, and whether RECORD waits for a press.
  private seqClock: TransportClock | null = null
  private plan: LiveSeqPlan | null = null
  private arp: LiveArpPlan | null = null
  // SAMPLE's RSP as asked: open on each new output while wanted.
  private sampleAsk: { stereo: boolean; gain: number; threshold: number | null; input: boolean } | null = null
  // SAMPLE's mic while open: its stream, channels and own delay (ms).
  private mic: { readonly media: MediaStream; readonly channels: number; readonly latencyMs: number } | null = null
  private readonly sampleTakeListeners = new Set<(take: TapTake) => void>()
  private readonly _samplePhase = signal<TapPhase>({ kind: 'ready' })
  /** SAMPLE's take as the audio thread has it: waiting, recording, or ready. */
  readonly samplePhase: ReadonlySignal<TapPhase> = this._samplePhase
  private readonly _sampleLevel = signal<{ readonly level: number; readonly clip: boolean }>({ level: 0, clip: false })
  /** RSP's level (0..1 across −60..0 dBFS) and its clip light, a few times a second while open. */
  readonly sampleLevel: ReadonlySignal<{ readonly level: number; readonly clip: boolean }> = this._sampleLevel
  private readonly arpStepListeners = new Set<(step: ArpStep) => void>()
  private seqArmed = false
  private readonly _rec = signal<RecState>(REC_IDLE)
  /** The TAKE key's state. */
  readonly rec: ReadonlySignal<RecState> = this._rec

  constructor(private readonly backend: LiveBackend = browserLiveBackend()) {
    this.steppedBack = backend.savedHint?.() === 'interactive'
    this._latencyHint = signal(backend.savedChoice?.() ?? WebLatencyHint.ZERO)
    this.latencyHint = this._latencyHint
    this._volume = signal(volumeOf(backend.savedVolume?.()))
    this.volume = this._volume
    this._clickLevel = signal(volumeOf(backend.savedClickLevel?.()))
    this.clickLevel = this._clickLevel
  }

  /**
   * The metronome level: the click (and the count-in's) heard at [v] 0..1's
   * levelGain, at once on the open output and on each new one; kept. 0 is
   * silent; whether the click is on stays setClick's.
   */
  setClickLevel(v: number): void {
    const next = volumeOf(v)
    if (next === this._clickLevel.peek()) return
    this._clickLevel.value = next
    this.backend.saveClickLevel?.(next)
    if (this.stream) send(this.stream, { t: 'clickLevel', gain: levelGain(next) })
  }

  /**
   * VOLUME: what the speakers get of the mix, [v] 0..1 heard at its
   * levelGain, at once on the open output and on each new one; kept. Takes
   * record the mix before it.
   */
  setOutputVolume(v: number): void {
    const next = volumeOf(v)
    if (next === this._volume.peek()) return
    this._volume.value = next
    this.backend.saveVolume?.(next)
    this.stream?.link?.volume?.(levelGain(next))
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
   * A take ended: the WAV, or null when nothing was played; [limit] when
   * TakeRecorder.MAX_SECONDS ended it.
   */
  onTake(listener: (take: RecordedTake | null, limit: boolean) => void): () => void {
    return add(this.takeListeners, listener)
  }

  /**
   * Arms TAKE: the next sound (or the EP-133's PLAY) starts a take. Opens the
   * output first if Live hasn't. False when there is no output.
   */
  arm(): boolean {
    if (this._rec.value.kind !== 'idle') return true
    const s = this.ensure()
    if (!s) return false
    s.parked = false
    wake(s.ctx)
    s.receiving = { chunks: [], frames: 0, rate: s.ctx.sampleRate }
    send(s, { t: 'arm' })
    this._rec.value = REC_ARMED
    return true
  }

  /** Stops the take: what was recorded is saved (nothing, if nothing was played). */
  stopRecording(): void {
    if (this._rec.value.kind !== 'idle' && this.stream) send(this.stream, { t: 'stopRec' })
  }

  /** The EP-133 started playing (MIDI Start or Continue): an armed take starts now. */
  transportStarted(): void {
    if (this._rec.value.kind === 'armed' && this.stream) send(this.stream, { t: 'transport', playing: true })
  }

  /** The EP-133 stopped (MIDI Stop): a take its PLAY started ends. */
  transportStopped(): void {
    if (this._rec.value.kind !== 'idle' && this.stream) send(this.stream, { t: 'transport', playing: false })
  }

  // ---------- PATTERN (LiveAudio.kt's sequencer) ----------

  /** What the pattern sequencer plays: its pads' sounds are sent over, the plan with them; kept for the next output. */
  seqPlan(plan: LiveSeqPlan): void {
    this.plan = plan
    if (this.stream) this.sendPlan(this.stream, plan)
  }

  /** The plan as it is but at [bpm]: the mixer has its sounds already, so only the tempo goes (web only). */
  seqTempo(bpm: number): void {
    if (this.plan === null) return
    this.plan = { ...this.plan, bpm }
    if (this.stream) send(this.stream, { t: 'seqBpm', bpm })
  }

  /** Starts the pattern (LiveAudioDeps.seqPlay). False when there is no output. */
  seqPlay(countInBars: number, leadMs: number, atMs: number | null): boolean {
    const s = this.ensure()
    if (!s) return false
    s.parked = false
    wake(s.ctx)
    if (this.plan) this.sendPlan(s, this.plan)
    const stamp = s.stamp
    const atFrame = atMs !== null && stamp !== null ? frameAt(stamp, atMs) : null
    send(s, { t: 'play', countInBars, leadMs, atFrame, atPress: atMs !== null })
    return true
  }

  /**
   * The first tick a queued switch made at [atMs] (performance.now()) can
   * take over at (PatternScheduler.freeTick, as of the latest stamp and
   * carried on to [atMs] at the transport's tempo); null while stopped.
   */
  seqFreeTick(atMs: number): number | null {
    const s = this.stream
    const c = this.seqClock
    if (s === null || c === null || s.stamp === null || !Number.isFinite(s.freeTick)) return null
    const later = frameAt(s.stamp, atMs) - s.stamp.frame
    return s.freeTick + Math.max(later, 0) * ((c.bpm * Seq.PPQN) / (60 * c.rate))
  }

  /** Stops the pattern: what waits is dropped, what sounds let go of. */
  seqStop(): void {
    this.seqClock = null
    this._timeline.value = null
    if (this.stream) send(this.stream, { t: 'stopSeq' })
  }

  /**
   * What the arp or note repeat plays (null, or no notes: it stops); a run's
   * press is placed by the output's latest stamp. Opens the output for notes.
   */
  arpPlan(plan: LiveArpPlan | null): void {
    const on = plan !== null && plan.notes.length > 0
    this.arp = on ? plan : null
    if (!on) {
      if (this.stream) send(this.stream, { t: 'arp', plan: null })
      return
    }
    const s = this.ensure()
    if (!s) return
    s.parked = false
    wake(s.ctx)
    this.sendArp(s, plan)
  }

  /** A step the arp played on the pattern's clock: for RECORD. */
  onArpStep(listener: (step: ArpStep) => void): () => void {
    return add(this.arpStepListeners, listener)
  }

  // ---------- SAMPLE: RSP, Live's mix recorded into a pad (SampleRecorder's mix side) ----------

  /**
   * Opens SAMPLE on Live's mix (RSP), or on the mic opened with [sampleMic]
   * ([input]), [stereo] or mixed down, at [gainDb], an armed take waiting
   * for [thresholdDb] (null: none). Opens the output; false when there is
   * none, or [input] with no mic open.
   */
  sampleOpen(stereo: boolean, gainDb: number, thresholdDb: number | null, input = false): boolean {
    if (input && this.mic === null) return false
    this.sampleAsk = { stereo, gain: PeakMeter.fromDb(gainDb), threshold: thresholdDb === null ? null : PeakMeter.fromDb(thresholdDb), input }
    const s = this.ensure()
    if (!s) {
      this.sampleAsk = null
      return false
    }
    s.parked = false
    wake(s.ctx)
    send(s, { t: 'sampleOpen', stereo, gain: this.sampleAsk.gain, input })
    // RSP lets the mic go.
    if (!input) this.micClose()
    return true
  }

  /** Whether this browser offers a mic (getUserMedia) to sample from. */
  get micSupported(): boolean {
    return this.backend.micStream !== undefined
  }

  /**
   * Opens the mic ([stereo]: two channels where it has them) into Live's
   * mixer, asking for it the first time; [sampleOpen] then records from it.
   * The output opens first. Its channels, or why not.
   */
  async sampleMic(stereo: boolean): Promise<MicOpened> {
    const want = this.backend.micStream
    if (want === undefined || this.ensure() === null) return { ok: false, why: 'failed' }
    let media: MediaStream
    try {
      media = await want(stereo)
    } catch (e) {
      this.note(`sample mic: ${message(e)}`)
      return { ok: false, why: micWhy(e) }
    }
    this.micClose()
    const settings = (media.getAudioTracks()[0]?.getSettings?.() ?? {}) as { channelCount?: number; latency?: number }
    const channels = settings.channelCount === 2 ? 2 : 1
    const latencyMs = typeof settings.latency === 'number' && Number.isFinite(settings.latency) && settings.latency > 0 ? settings.latency * 1000 : MIC_LATENCY_MS
    this.mic = { media, channels, latencyMs }
    const link = this.stream?.link
    if (link) {
      // A mixer that takes no input (the main-thread one) has no mic.
      if (!link.listen || !tryListen(link, media)) {
        this.micClose()
        return { ok: false, why: 'failed' }
      }
    }
    return { ok: true, channels }
  }

  // The mic let go: off the mixer, and its tracks stopped (the browser's mic light goes).
  private micClose(): void {
    const m = this.mic
    if (m === null) return
    this.mic = null
    const link = this.stream?.link
    if (link?.listen) quietly(() => link.listen?.(null))
    for (const t of m.media.getTracks()) quietly(() => t.stop())
  }

  /** RSP's level and threshold, from the next block. */
  sampleSet(gainDb: number, thresholdDb: number | null): void {
    const a = this.sampleAsk
    if (a === null) return
    this.sampleAsk = { ...a, gain: PeakMeter.fromDb(gainDb), threshold: thresholdDb === null ? null : PeakMeter.fromDb(thresholdDb) }
    if (this.stream) send(this.stream, { t: 'sampleSet', gain: this.sampleAsk.gain })
  }

  /** Closes RSP: a take going on ends with what was recorded. */
  sampleClose(): void {
    this.sampleAsk = null
    if (this.stream) send(this.stream, { t: 'sampleClose' })
    this.micClose()
    this._samplePhase.value = { kind: 'ready' }
    this._sampleLevel.value = { level: 0, clip: false }
  }

  /** The rate a take is made at: the open output's (null: none open). */
  get sampleRate(): number | null {
    return this.stream?.ctx.sampleRate ?? null
  }

  /**
   * Arms a take into [pad] (pad key) from what was heard at [atMs]
   * (performance.now(); null: where the mix is), or from the threshold's
   * crossing after it; [latched] hands-free; at most [maxFrames].
   */
  sampleArm(pad: number, atMs: number | null, latched: boolean, maxFrames: number): void {
    const s = this.stream
    if (!s || this.sampleAsk === null) return
    send(s, { t: 'sampleAsk', ask: { kind: 'arm', pad, at: this.tapFrameAt(s, atMs), latched, maxFrames, threshold: this.sampleAsk.threshold } })
  }

  /** Schedules a take of exactly [length] frames into [pad] from mix frame [start] (bars, a pattern's loop). */
  sampleSchedule(pad: number, start: number, length: number, maxFrames: number): void {
    if (this.stream && this.sampleAsk !== null) send(this.stream, { t: 'sampleAsk', ask: { kind: 'schedule', pad, start, length, maxFrames } })
  }

  /**
   * Schedules a take of exactly [length] frames into [pad] from what is
   * heard at [atMs] (a count-in's downbeat; on the mic, the sound made then).
   * Nothing without a stamp to place it by.
   */
  sampleScheduleAt(pad: number, atMs: number, length: number, maxFrames: number): void {
    const s = this.stream
    if (!s || this.sampleAsk === null) return
    const start = this.tapFrameAt(s, atMs)
    if (start !== null) send(s, { t: 'sampleAsk', ask: { kind: 'schedule', pad, start, length, maxFrames } })
  }

  /** The mix frame heard at [atMs] (performance.now()), by the latest stamp; null without one. */
  sampleFrameAt(atMs: number): number | null {
    const s = this.stream
    return s ? this.mixFrameAt(s, atMs) : null
  }

  /** Stops the take at what was heard at [atMs] (null: where the mix is), keeping what came before. */
  sampleStop(atMs: number | null = null): void {
    const s = this.stream
    if (s) send(s, { t: 'sampleAsk', ask: { kind: 'stop', at: this.tapFrameAt(s, atMs) } })
  }

  /** Throws the take away (a tap, or a press that became a scroll). */
  sampleCancel(): void {
    if (this.stream) send(this.stream, { t: 'sampleAsk', ask: { kind: 'cancel' } })
  }

  /** Each take SAMPLE made. */
  onSampleTake(listener: (take: TapTake) => void): () => void {
    return add(this.sampleTakeListeners, listener)
  }

  /**
   * The frame of what SAMPLE takes for [atMs]: the mix's frame heard then,
   * or the mic's frame of sound made then (a block's mic frames came in its
   * output's delay before it is heard, and the mic's own before that).
   */
  private tapFrameAt(s: Stream, atMs: number | null): number | null {
    const m = this.mic
    if (atMs === null || m === null || this.sampleAsk?.input !== true) return this.mixFrameAt(s, atMs)
    const l = outputLatency(s.ctx)
    return this.mixFrameAt(s, atMs + l.baseMs + l.outputMs + m.latencyMs)
  }

  private mixFrameAt(s: Stream, atMs: number | null): number | null {
    return atMs !== null && s.stamp !== null ? Math.round(frameAt(s.stamp, atMs)) : null
  }

  /** RECORD waits for a press: the mixer sends its stamps meanwhile. */
  seqArm(armed: boolean): void {
    this.seqArmed = armed
    if (this.stream) send(this.stream, { t: 'seqArmed', armed })
  }

  /** A pad the patterns play has no sound in the plan (pad key). */
  onSeqMissing(listener: (pad: number) => void): () => void {
    return add(this.missingListeners, listener)
  }

  /**
   * TEMPO's click on or off: free at [bpm], or on the EP-133's beats ([grid],
   * performance.now() ms) while it sends its clock; on the pattern's while it
   * runs. Opens the output to turn it on. False when there is no output.
   */
  setClick(on: boolean, bpm: number, grid: BeatGrid | null): boolean {
    this.clickAsk = { on, bpm, grid }
    if (!on) {
      if (this.stream) this.sendClick(this.stream)
      return true
    }
    const s = this.ensure()
    if (!s) {
      this.clickAsk = { on: false, bpm, grid }
      return false
    }
    s.parked = false
    wake(s.ctx)
    this.sendClick(s)
    return true
  }

  /** Each click, with when it is heard (performance.now() ms): TEMPO's light. */
  onBeat(listener: (beat: Beat) => void): () => void {
    return add(this.beatListeners, listener)
  }

  /** The click as asked, the EP-133's beats in mix frames through the output's stamp (none without one yet). */
  private sendClick(s: Stream): void {
    const a = this.clickAsk
    const f = s.stamp
    const grid: FrameGrid | null =
      a.grid !== null && f !== null
        ? { anchorFrame: frameAt(f, a.grid.anchor), beatIndex: a.grid.beatIndex, periodFrames: (a.grid.periodMs * f.rate) / 1000, barKnown: a.grid.barKnown }
        : null
    send(s, { t: 'click', on: a.on, bpm: a.bpm, grid })
  }

  private sendPlan(s: Stream, plan: LiveSeqPlan): void {
    const voices: PlanVoice[] = []
    for (const [pad, key] of plan.voices) {
      const sample = this.samples.get(key)
      if (!sample || !(sample.channels >= 1 && sample.channels <= 2)) continue
      this.load(s, sample)
      ensureSent(s, sample.id)
      const bus: Partial<VoiceShape> = { bus: Math.floor(pad / 12) }
      const shape = plan.shapes?.get(pad) ?? bus
      const keysShape = plan.keysShapes?.get(pad) ?? bus
      voices.push({ pad, id: sample.id, channels: sample.channels, sampleRate: sample.sampleRate, shape, keysShape })
    }
    const queued = plan.queued !== undefined ? [...plan.queued].map(([group, q]) => ({ group, pattern: q.pattern, atTick: q.atTick })) : undefined
    send(s, { t: 'plan', patterns: plan.patterns, voices, skip: [...plan.skip], bpm: plan.bpm, phase: plan.phase, queued })
  }

  private sendArp(s: Stream, plan: LiveArpPlan): void {
    const voices: PlanVoice[] = []
    for (const [pad, key] of plan.voices) {
      const sample = this.samples.get(key)
      if (!sample || !(sample.channels >= 1 && sample.channels <= 2)) continue
      this.load(s, sample)
      ensureSent(s, sample.id)
      const bus: Partial<VoiceShape> = { bus: Math.floor(pad / 12) }
      voices.push({ pad, id: sample.id, channels: sample.channels, sampleRate: sample.sampleRate, shape: plan.shapes?.get(pad) ?? bus, keysShape: plan.keysShapes?.get(pad) ?? bus })
    }
    const stamp = s.stamp
    const atFrame = stamp !== null ? frameAt(stamp, plan.pressMs) : null
    const { notes, keys, timing, settings, bpm, seed, pressMs } = plan
    send(s, { t: 'arp', plan: { notes, voices, keys, timing, settings, bpm, seed, pressMs, atFrame } })
  }

  /** The timeline anew when the clock changed, or the stamp drifted from the one shown by more than a millisecond. */
  private showTimeline(s: Stream): void {
    const c = this.seqClock
    const f = s.stamp
    if (c === null || f === null) {
      if (this._timeline.peek() !== null) this._timeline.value = null
      return
    }
    const shown = this._timeline.peek()
    if (shown !== null && shown.clock === c && Math.abs(frameAt(shown.frames, f.ms) - f.frame) <= f.rate / 1000) return
    this._timeline.value = { clock: c, frames: f }
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
    // SAMPLE's take goes with the output; RSP opens again on the next one while wanted.
    this._samplePhase.value = { kind: 'ready' }
    this._sampleLevel.value = { level: 0, clip: false }
    this.wireless = false
    this.counted = null
    this.refreshDelay()
    this._engine.value = null
    const recording = this._rec.value.kind !== 'idle'
    this._rec.value = REC_IDLE
    // The pattern stops with its output (the controller is told by the timeline going), and so does the click.
    this.clickAsk = { ...this.clickAsk, on: false }
    this.seqClock = null
    this._timeline.value = null
    if (!s) return
    this.checkGlitches(s)
    s.closed = true
    s.pending.length = 0
    s.pendingLoads.clear()
    s.urgent.clear()
    if (recording && s.link && s.receiving) {
      // A take going is saved like any other: the mixer sends what it has and how much to keep, then the output goes.
      s.ending = true
      s.link.send({ t: 'stopAll' })
      s.link.send({ t: 'stopRec' })
      setTimeout(() => {
        if (!s.ending) return
        // No end came: keep all that arrived.
        this.endTake(s, s.receiving?.frames ?? 0, false)
        this.shut(s)
      }, TAKE_END_WAIT_MS)
      return
    }
    s.receiving = null
    this.shut(s)
  }

  private shut(s: Stream): void {
    s.ending = false
    if (s.link) quietly(() => s.link?.close())
    s.ctx.close().catch(() => undefined)
  }

  private endTake(s: Stream, keep: number, limit: boolean): void {
    const r = s.receiving
    s.receiving = null
    if (!r) return
    const kept = Math.min(keep, r.frames)
    const take: RecordedTake | null =
      kept > 0 ? { wav: takeWav(r.chunks, kept, r.rate), frames: kept, rate: r.rate, seconds: kept / r.rate } : null
    for (const f of [...this.takeListeners]) f(take, limit)
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
    ensureSent(s, sample.id)
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

  /** The samples [flush] left, a slice per task, so a reopened output isn't one long task (web only). */
  private drainLater(s: Stream): void {
    if (s.pendingLoads.size === 0) return
    const slice = (): void => {
      const link = s.link
      if (s.closed || this.stream !== s || !link) return
      let bytes = 0
      for (const [id, m] of s.pendingLoads) {
        if (bytes >= FLUSH_SLICE_BYTES) break
        s.pendingLoads.delete(id)
        link.send(m)
        if (m.t === 'load') bytes += m.pcm.byteLength
      }
      this.drainLater(s)
    }
    if (this.backend.later) this.backend.later(slice)
    else nextTask(slice)
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
      countedAt: 0,
      link: null,
      pending: [],
      pendingLoads: new Map(),
      urgent: new Set(),
      loaded: new Set(),
      closed: false,
      ran: false,
      parked: false,
      pressedAt: Number.NEGATIVE_INFINITY,
      quietAt: Number.NEGATIVE_INFINITY,
      recheck: false,
      engine: null,
      ending: false,
      receiving: null,
      stamp: null,
      freeTick: Number.NEGATIVE_INFINITY,
    }
    this.stream = s
    // The samples loaded, ready again, and the FX bus as it was set up (before any press).
    for (const sample of this.samples.values()) this.load(s, sample)
    for (const c of this.fx.commands()) send(s, { t: 'control', what: c.what, index: c.index, x: c.x, y: c.y })
    // RECORD waiting for a press: the new output's stamps are wanted at once.
    if (this.seqArmed) send(s, { t: 'seqArmed', armed: true })
    // The arp playing on: from where the new output's mix is.
    if (this.arp !== null) this.sendArp(s, this.arp)
    // SAMPLE's RSP on the new output's mix.
    if (this.sampleAsk !== null) send(s, { t: 'sampleOpen', stereo: this.sampleAsk.stereo, gain: this.sampleAsk.gain, input: this.sampleAsk.input })
    // The click goes on with the new output, at its level.
    if (this._clickLevel.peek() !== 1) send(s, { t: 'clickLevel', gain: levelGain(this._clickLevel.peek()) })
    if (this.clickAsk.on) this.sendClick(s)
    ctx.addEventListener?.('statechange', () => this.stateChanged(s))
    this.backend.connect(ctx, (m) => this.received(s, m)).then(
      (link) => {
        if (s.closed) {
          quietly(() => link.close())
          return
        }
        s.link = link
        link.volume?.(levelGain(this._volume.peek()))
        flush(s, link)
        this.drainLater(s)
        // SAMPLE's mic into the new mixer.
        if (this.mic !== null && (!link.listen || !tryListen(link, this.mic.media))) this.note('sample mic: this output takes no input')
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
        this.countGlitches(s)
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
    this.countGlitches(s)
    this._description = describeOutput(s.ctx, s.link?.kind ?? '')
    this.note(`live audio running: ${this._description}`)
    this.checkSlow(s)
  }

  /** Whether the delay of an output taken for Bluetooth is made up for (Settings; on until set otherwise). */
  makeUpDelay(on: boolean): void {
    this.makingUp = on
    this.refreshDelay()
  }

  /**
   * The part of the output's delay its stamp leaves out, in ms, to be made up
   * for (OutputDelay.ms): 0 when it isn't taken for Bluetooth, closed, or
   * with [makeUpDelay] off.
   */
  get delayMs(): number {
    return this.delay
  }

  private refreshDelay(): void {
    this.delay = OutputDelay.ms(this.makingUp, this.wireless, this.counted)
    const madeUp = this.makingUp && this.wireless ? OutputDelay.totalMs(this.counted) : null
    if (madeUp !== this._madeUp.peek()) this._madeUp.value = madeUp
    const bluetooth = this.wireless ? this.counted : null
    if (bluetooth !== this._bluetooth.peek()) this._bluetooth.value = bluetooth
  }

  /** [late], the Bluetooth guess (once per LiveAudio), and the delay made up for, from the output's latency now. */
  private checkSlow(s: Stream): void {
    const l = outputLatency(s.ctx)
    // Browsers don't name the route: a long latency is taken for Bluetooth, and is what the stamp counts.
    const wireless = isSlowOutput(l)
    const counted = Math.round(l.baseMs + l.outputMs)
    if (wireless !== this.wireless || counted !== this.counted) {
      this.wireless = wireless
      this.counted = counted
      this.refreshDelay()
    }
    const late = lateBy(l)
    const shown = this._late.value
    if (late === null || shown === null || Math.abs(late - shown) >= LATE_STEP_MS) this._late.value = late
    if (this.toldSlow || !isSlowOutput(l)) return
    this.toldSlow = true
    for (const f of [...this.slowListeners]) f(l.baseMs + l.outputMs)
  }

  /** [s]'s glitches are counted from now. */
  private countGlitches(s: Stream): void {
    s.underrunsAtRun = underruns(s.ctx)
    s.countedAt = this.backend.now()
  }

  /**
   * An output at latencyHint 0 that glitched [LATENCY_GLITCHES] times since it
   * woke, within [GLITCH_WINDOW_MS]: the next one asks for 'interactive'.
   */
  private checkGlitches(s: Stream): void {
    if (s.hint !== 0 || this.hint !== 0 || s.underrunsAtRun === null) return
    const n = underruns(s.ctx)
    if (n === null) return
    // A count older than the window starts again from here.
    if (this.backend.now() - s.countedAt > GLITCH_WINDOW_MS) {
      this.countGlitches(s)
      return
    }
    if (n - s.underrunsAtRun < LATENCY_GLITCHES) return
    this.steppedBack = true
    this.backend.saveHint?.('interactive')
    this.note(`live audio: ${n - s.underrunsAtRun} glitches at the lowest latency; the next output asks for 'interactive'`)
  }

  /**
   * [s] asks for a latencyHint since stepped back from: once nothing has
   * sounded and nothing was pressed for [REPLACE_QUIET_MS] (checked again
   * when that is up), it makes way for a new output at the new hint (the
   * samples go over again, as for any new one), woken when the page has had a tap.
   */
  private replaceStale(s: Stream): void {
    // Not while a take goes (it would be cut in two), nor while the pattern plays.
    if (s.closed || this.stream !== s || s.hint === this.hint || this._voices.value.size !== 0 || this._rec.value.kind !== 'idle' || this.seqClock !== null) return
    const wait = Math.max(s.pressedAt, s.quietAt) + REPLACE_QUIET_MS - this.backend.now()
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
    // A take's chunks and end still arrive from an output let go mid-take.
    if (m.t === 'take' || m.t === 'takeEnd') {
      if (this.stream !== s && !s.ending) return
      if (m.t === 'take') {
        if (s.receiving) {
          s.receiving.chunks.push(m.pcm)
          s.receiving.frames += m.pcm.length / 2
        }
        return
      }
      this.endTake(s, m.keep, m.limit)
      if (s.ending) this.shut(s)
      return
    }
    if (s.closed || this.stream !== s) return
    switch (m.t) {
      case 'timeline':
        this.seqClock = m.clock
        this.showTimeline(s)
        return
      case 'stamp': {
        const first = s.stamp === null
        s.stamp = { frame: m.frame, ms: heardAt(m.time, this.backend.now(), s.ctx), rate: s.ctx.sampleRate }
        s.freeTick = m.freeTick
        this.showTimeline(s)
        // The EP-133's beats could wait for a stamp to be mapped.
        if (first && this.clickAsk.on && this.clickAsk.grid !== null) this.sendClick(s)
        return
      }
      case 'beat': {
        // Heard the delay made up for after the stamp has it (TEMPO's light follows the ear).
        const at = heardAt(m.time, this.backend.now(), s.ctx) + this.delay
        for (const f of [...this.beatListeners]) f({ index: m.index, at, accent: m.accent })
        return
      }
      case 'samplePhase':
        this._samplePhase.value = m.phase
        return
      case 'sampleLevel':
        this._sampleLevel.value = { level: m.level, clip: m.clip }
        return
      case 'sampleTake':
        for (const f of [...this.sampleTakeListeners]) f(m.take)
        return
      case 'arpStep':
        for (const f of [...this.arpStepListeners]) f(m.step)
        return
      case 'missing':
        for (const f of [...this.missingListeners]) f(m.pad)
        return
      case 'rec':
        this._rec.value = m.state
        return
      case 'keys':
        this._voices.value = m.keys.length === 0 ? EMPTY : new Set(m.keys)
        // Quiet: an output that glitched can go once it has been for a while.
        if (m.keys.length === 0) {
          s.quietAt = this.backend.now()
          this.replaceStale(s)
        }
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

/**
 * Sample [id]'s load goes over before what names it (the mixer drops a start
 * for a sample it hasn't): while the mixer starts it goes first (a press waits
 * for it, not for every sample); after, at once if it still waits in the backlog.
 */
function ensureSent(s: Stream, id: number): void {
  const m = s.pendingLoads.get(id)
  if (m === undefined) return
  if (!s.link) {
    s.urgent.add(id)
    return
  }
  s.pendingLoads.delete(id)
  s.link.send(m)
}

/**
 * The mixer is ready: the loads presses wait for, then the commands in their
 * order (a stopAll still before a later start). The other samples stay in
 * pendingLoads for [LiveAudio.drainLater], so a press's start crosses (and is
 * mixed) before every other sample is copied over.
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
}

/** [fn] in a task of its own: a MessageChannel's message, which a nested setTimeout's 4 ms clamp doesn't hold back. */
function nextTask(fn: () => void): void {
  if (typeof MessageChannel === 'undefined') {
    setTimeout(fn, 0)
    return
  }
  const c = new MessageChannel()
  c.port1.onmessage = () => {
    c.port1.close()
    fn()
  }
  c.port2.postMessage(null)
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

/** Where it keeps VOLUME (localStorage: this browser's, like the latencyHint choice; not in library.json). */
export const VOLUME_KEY = 'arc.liveVolume'

/** Where it keeps the metronome level (localStorage, as VOLUME). */
export const CLICK_LEVEL_KEY = 'arc.clickLevel'

/** A volume (or the metronome level) as kept: 0..1, 1 where it is missing or not a number. */
export function volumeOf(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 1
}

/** How quickly the speakers' gain follows VOLUME (a time constant, s): a turn without zipper noise. */
const VOLUME_GLIDE_S = 0.01

/** ScriptProcessorNode's buffer where there is no AudioWorklet: its smallest. */
export const FALLBACK_FRAMES = 256

/** The worklet mixer: commands go over the node's port (a sample's copy moved, not cloned). */
async function workletLink(ctx: AudioContext, onMessage: (m: FromMixer) => void): Promise<MixerLink> {
  await ctx.audioWorklet.addModule(workletUrl)
  const node = new AudioWorkletNode(ctx, LIVE_PROCESSOR, {
    // SAMPLE's mic, while it is open (else nothing is connected).
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  })
  node.port.onmessage = (e: MessageEvent<FromMixer>) => onMessage(e.data)
  // VOLUME, after the mixer (a take is recorded inside it, before this).
  const out = ctx.createGain()
  node.connect(out)
  out.connect(ctx.destination)
  let source: MediaStreamAudioSourceNode | null = null
  const unlisten = (): void => {
    source?.disconnect()
    source = null
  }
  return {
    kind: 'AudioWorklet',
    send: (m) => {
      const [msg, transfer] = transferable(m)
      node.port.postMessage(msg, transfer)
    },
    close: () => {
      unlisten()
      node.port.onmessage = null
      node.disconnect()
      out.disconnect()
      node.port.close()
    },
    listen: (media) => {
      unlisten()
      if (media === null) return
      source = ctx.createMediaStreamSource(media)
      source.connect(node)
    },
    volume: (g) => out.gain.setTargetAtTime(g, ctx.currentTime, VOLUME_GLIDE_S),
  }
}

/** The main-thread mixer, for browsers without AudioWorklet (or where it fails to load). */
async function scriptLink(ctx: AudioContext, onMessage: (m: FromMixer) => void): Promise<MixerLink> {
  // Loaded only here: the worklet has its own copy, so the app's bundle leaves the mixer out.
  // The chunk is precached with the app's other scripts; should it fail to load, connect() fails.
  const { MixerHost } = await import('./liveMixer')
  const host = new MixerHost(ctx.sampleRate, onMessage)
  // Two input channels: SAMPLE's mic, while it is open.
  const node = ctx.createScriptProcessor(FALLBACK_FRAMES, 2, 2)
  let source: MediaStreamAudioSourceNode | null = null
  node.onaudioprocess = (e) => {
    const out = e.outputBuffer
    if (source !== null) {
      const inp = e.inputBuffer
      const left = inp.getChannelData(0)
      host.input(left, inp.numberOfChannels > 1 ? inp.getChannelData(1) : left, inp.length)
    }
    host.render(out.getChannelData(0), out.getChannelData(1), out.length, e.playbackTime)
  }
  // VOLUME, after the mixer (a take is recorded inside it, before this).
  const gain = ctx.createGain()
  node.connect(gain)
  gain.connect(ctx.destination)
  const unlisten = (): void => {
    source?.disconnect()
    source = null
  }
  return {
    kind: 'ScriptProcessor',
    send: (m) => host.handle(m),
    close: () => {
      unlisten()
      node.onaudioprocess = null
      node.disconnect()
      gain.disconnect()
    },
    listen: (media) => {
      unlisten()
      if (media === null) return
      source = ctx.createMediaStreamSource(media)
      source.connect(node)
    },
    volume: (g) => gain.gain.setTargetAtTime(g, ctx.currentTime, VOLUME_GLIDE_S),
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
      return await scriptLink(ctx, onMessage)
    },
    ...(typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
      ? {
          // As raw as it comes: no echo cancelling, noise suppression or gain riding.
          micStream: (stereo: boolean) =>
            navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: stereo ? 2 : 1 } },
              video: false,
            }),
        }
      : {}),
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
    savedVolume: () => {
      try {
        const v = globalThis.localStorage?.getItem(VOLUME_KEY)
        return volumeOf(v == null ? null : Number(v))
      } catch {
        return 1
      }
    },
    saveVolume: (volume) => {
      try {
        if (volume === 1) globalThis.localStorage?.removeItem(VOLUME_KEY)
        else globalThis.localStorage?.setItem(VOLUME_KEY, String(volume))
      } catch {
        // Storage blocked or full: the volume lasts the page.
      }
    },
    savedClickLevel: () => {
      try {
        const v = globalThis.localStorage?.getItem(CLICK_LEVEL_KEY)
        return volumeOf(v == null ? null : Number(v))
      } catch {
        return 1
      }
    },
    saveClickLevel: (level) => {
      try {
        if (level === 1) globalThis.localStorage?.removeItem(CLICK_LEVEL_KEY)
        else globalThis.localStorage?.setItem(CLICK_LEVEL_KEY, String(level))
      } catch {
        // Storage blocked or full: the level lasts the page.
      }
    },
  }
}

// [media] into [link]'s mixer; false when it can't be (another rate, say).
function tryListen(link: MixerLink, media: MediaStream): boolean {
  try {
    link.listen?.(media)
    return true
  } catch {
    return false
  }
}
