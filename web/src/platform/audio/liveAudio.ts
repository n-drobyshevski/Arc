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
// - An AudioContext({latencyHint: 'interactive'}) at the device's own rate
//   stands in for the low-latency AudioTrack; the EP-133's 46875 Hz sounds are
//   converted as they are mixed. The mixer runs in an AudioWorklet
//   (liveWorklet.ts), or, where there is none, under a ScriptProcessorNode on
//   the main thread; both are a MixerHost (liveMixer.ts). The browser sizes the
//   output's buffers, so Kotlin's grow-on-underrun has no counterpart.
// - Samples are kept in memory on the audio side: [preload] gives a decoded
//   sample a key, it is sent over once, and a press only names it. Kotlin's
//   play() takes the PCM itself (the controller's padMemory holds it); here
//   the controller loads and [unload]s by key instead. A reopened output gets
//   the loaded samples again.
// - Browsers only start audio after a tap: [open] (Live came on screen) sets
//   the output up only when the page has already had one
//   (navigator.userActivation.hasBeenActive); otherwise the first press does,
//   through [resumeInGesture] (call it synchronously in the press handler) or
//   [press]. A touch only counts as a tap when the finger lifts, so [release]
//   (pointerup) wakes a suspended output too.
// - No audio focus. A context the system suspends or interrupts (a call,
//   another app, iOS) stops the voices, as losing focus does.
// - No output route: a press's latency comes from the context's output
//   timestamp (or currentTime plus baseLatency/outputLatency), the route is
//   WebText.ROUTE, and Bluetooth (SoundPlayer.isBluetooth) is guessed from a
//   large output latency: [onSlowOutput] fires once per LiveAudio (once a run,
//   as ArcController's toldBluetooth).
// - Listeners are added after construction (the controller is made after its
//   deps); the debug-log lines ("live audio: …") come through [onLog].
// - REC: the take is recorded on the audio side (MixerHost) and sent over in
//   chunks; [onTake] gets it as a WAV Blob in memory (Kotlin's TakeWriter
//   writes a file as it goes). Live closing mid-take still saves it: the
//   output stays up until the mixer has sent the end (TAKE_END_WAIT_MS at most).

import { signal, type ReadonlySignal } from '@preact/signals'
import { REC_ARMED, REC_IDLE, type RecState } from '../../core/features/takeRecorder'
import { wavHeader } from '../../core/formats/wav'
import { WebText } from '../../core/text/webText'
import { LIVE_PROCESSOR, MixerHost, type FromMixer, type ToMixer } from './liveMixer'
// The AudioWorklet module's URL: Vite bundles liveWorklet.ts (with the core
// mixer) into one self-contained script. (`new URL('./liveWorklet.ts',
// import.meta.url)` would copy the TypeScript unbuilt: Vite only bundles that
// form inside `new Worker(...)`.)
import workletUrl from './liveWorklet?worker&url'

export { LIVE_PROCESSOR, MixerHost, type FromMixer, type StartedVoice, type ToMixer } from './liveMixer'

/**
 * An output latency (baseLatency + outputLatency) at least this long is taken
 * for Bluetooth, which the web can't name (typically 150-300 ms, where a
 * speaker or wired headphones are 10-60 ms).
 */
export const SLOW_OUTPUT_MS = 120

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
  close(): Promise<void>
  getOutputTimestamp?(): { contextTime?: number; performanceTime?: number }
  addEventListener?(type: 'statechange', listener: () => void): void
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
   * own), or null. Only called once a tap has happened.
   */
  createContext(sampleRate?: number): LiveContextLike | null
  /** Starts a mixer on [ctx] whose reports go to [onMessage]. */
  connect(ctx: LiveContextLike, onMessage: (m: FromMixer) => void): Promise<MixerLink>
  /** performance.now(): the clock press times are on. */
  now(): number
  /** Whether the page has had a tap, so an output started now is allowed to sound. */
  gestureSeen(): boolean
}

/** [LiveAudio.press]'s options (state/deps.ts LivePress). */
export interface LivePressOptions {
  /** Semitones from the sample's own pitch (KEYS; 0 for a pad). */
  readonly pitch: number
  /** True: sounds until release(id), then fades quickly. False: plays to the end. */
  readonly gate: boolean
  /** When the finger came down (performance.now() ms), for the latency note; default: now. */
  readonly pressedAt?: number
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

/** A take REC recorded: a 16-bit stereo WAV of [frames] frames at [rate]. */
export interface RecordedTake {
  readonly wav: Blob
  readonly frames: number
  readonly rate: number
  readonly seconds: number
}

/** How long Live closing waits for the mixer to finish a take before it is cut where it is. */
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
  link: MixerLink | null
  /** Commands sent before the mixer was ready. */
  readonly pending: ToMixer[]
  /** Sample ids sent over. */
  readonly loaded: Set<number>
  closed: boolean
  ran: boolean
  /** Closed with a take going: still listening for its end. */
  ending: boolean
  /** The take being received from this output. */
  receiving: Receiving | null
}

/** The take being received. */
interface Receiving {
  readonly chunks: Int16Array[]
  frames: number
  readonly rate: number
}

const EMPTY: ReadonlySet<string> = new Set()

/** Live's sound output on Web Audio (state/deps.ts LiveAudioDeps). */
export class LiveAudio {
  private readonly _voices = signal<ReadonlySet<string>>(EMPTY)
  /** The voices sounding (pad and key ids), for the rings. */
  readonly voices: ReadonlySignal<ReadonlySet<string>> = this._voices
  private _description = ''
  private stream: Stream | null = null
  private rate: number | undefined = undefined
  private toldSlow = false
  private nextId = 1
  private readonly samples = new Map<string, Sample>()
  /** Voices pressed with gate false: a release doesn't cut them short. */
  private readonly ungated = new Set<string>()
  private readonly startedListeners = new Set<(id: string, latencyMs: number, route: string) => void>()
  private readonly slowListeners = new Set<(outputMs: number) => void>()
  private readonly logListeners = new Set<(line: string) => void>()
  private readonly takeListeners = new Set<(take: RecordedTake | null, limit: boolean) => void>()
  private readonly _rec = signal<RecState>(REC_IDLE)
  /** The REC key's state. */
  readonly rec: ReadonlySignal<RecState> = this._rec

  constructor(private readonly backend: LiveBackend = browserLiveBackend()) {}

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

  /** Each voice heard: [latencyMs] from its press to its first frame leaving the output. */
  onStarted(listener: (id: string, latencyMs: number, route: string) => void): () => void {
    return add(this.startedListeners, listener)
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
   * Arms REC: the next sound (or the EP-133's PLAY) starts a take. Opens the
   * output first if Live hasn't. False when there is no output.
   */
  arm(): boolean {
    if (this._rec.value.kind !== 'idle') return true
    const s = this.ensure()
    if (!s) return false
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

  /**
   * Live came on screen. Sets the output up when the page has had a tap
   * (else the first press does). [sampleRate]: a rate to ask for. False when
   * there is no audio output at all.
   */
  open(sampleRate?: number): boolean {
    if (sampleRate !== undefined) this.rate = sampleRate
    if (this.stream) return true
    if (!this.backend.supported()) return false
    if (!this.backend.gestureSeen()) return true
    return this.ensure() !== null
  }

  /**
   * Live left the screen: the output is let go and what was sounding stops.
   * The samples stay loaded. A take going ends and is saved, like any other.
   */
  close(): void {
    const s = this.stream
    this.stream = null
    this.ungated.clear()
    this._voices.value = EMPTY
    const recording = this._rec.value.kind !== 'idle'
    this._rec.value = REC_IDLE
    if (!s) return
    s.closed = true
    s.pending.length = 0
    if (recording && s.link && s.receiving) {
      // The mixer sends what it has and how much to keep; then the output goes.
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
    if (s) wake(s.ctx)
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
    wake(s.ctx)
    this.load(s, sample)
    if (options.gate) this.ungated.delete(id)
    else this.ungated.add(id)
    const pressedAt = options.pressedAt ?? this.backend.now()
    send(s, {
      t: 'start',
      key: id,
      id: sample.id,
      channels: sample.channels,
      sampleRate: sample.sampleRate,
      semitones: options.pitch,
      tag: pressedAt > 0 ? pressedAt : 0,
    })
    return true
  }

  /** The finger left: voice [id] fades out (after VoiceMixer.MIN_GATE_MS at the least). */
  release(id: string): void {
    // On a touch screen the browser lets a page start audio when the finger
    // lifts, not when it lands: the first press on a fresh page made the
    // output, and the release (called from pointerup) is what wakes it.
    if (this.stream && !this.stream.closed) wake(this.stream.ctx)
    if (this.ungated.has(id)) return
    if (this.stream) send(this.stream, { t: 'release', key: id })
  }

  stopAll(): void {
    this.ungated.clear()
    if (this.stream) send(this.stream, { t: 'stopAll' })
  }

  private drop(sample: Sample): void {
    const s = this.stream
    if (s?.loaded.delete(sample.id)) send(s, { t: 'unload', id: sample.id })
  }

  private load(s: Stream, sample: Sample): void {
    if (s.loaded.has(sample.id)) return
    s.loaded.add(sample.id)
    const pcm = sample.pcm
    // Posting a view clones its whole buffer: send just the samples.
    const own = pcm.byteOffset === 0 && pcm.byteLength === pcm.buffer.byteLength
    send(s, { t: 'load', id: sample.id, pcm: own ? pcm : pcm.slice() })
  }

  /** The open output, set up first if there is none. Only called once a tap has happened. */
  private ensure(): Stream | null {
    if (this.stream) return this.stream
    let ctx: LiveContextLike | null = null
    try {
      ctx = this.backend.createContext(this.rate)
      if (!ctx) this.note('live audio: no output')
    } catch (e) {
      this.note(`live audio: no output (${message(e)})`)
    }
    if (!ctx) return null
    const s: Stream = { ctx, link: null, pending: [], loaded: new Set(), closed: false, ran: false, ending: false, receiving: null }
    this.stream = s
    // The samples loaded, ready again.
    for (const sample of this.samples.values()) this.load(s, sample)
    ctx.addEventListener?.('statechange', () => this.stateChanged(s))
    this.backend.connect(ctx, (m) => this.received(s, m)).then(
      (link) => {
        if (s.closed) {
          quietly(() => link.close())
          return
        }
        s.link = link
        for (const m of s.pending.splice(0)) link.send(m)
        this._description = describeOutput(ctx, link.kind)
        this.note(`live audio: ${this._description}`)
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
      if (s.link) this.ran(s)
    } else if (state !== 'closed' && this._voices.value.size !== 0) {
      // The system took the output (a call, another app): the sounds stop.
      this.stopAll()
    }
  }

  /** The output is sounding: its latency, now known, goes in the debug log. */
  private ran(s: Stream): void {
    if (s.ran) return
    s.ran = true
    this._description = describeOutput(s.ctx, s.link?.kind ?? '')
    this.note(`live audio running: ${this._description}`)
    this.checkSlow(s)
  }

  private checkSlow(s: Stream): void {
    if (this.toldSlow) return
    const l = outputLatency(s.ctx)
    if (!isSlowOutput(l)) return
    this.toldSlow = true
    for (const f of [...this.slowListeners]) f(l.baseMs + l.outputMs)
  }

  private received(s: Stream, m: FromMixer): void {
    // A take's chunks and end still arrive from an output closed mid-take.
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
      case 'rec':
        this._rec.value = m.state
        return
      case 'keys':
        this._voices.value = m.keys.length === 0 ? EMPTY : new Set(m.keys)
        return
      case 'started': {
        const now = this.backend.now()
        for (const v of m.voices) {
          if (v.tag <= 0) continue
          const ms = heardAt(v.time, now, s.ctx) - v.tag
          for (const f of [...this.startedListeners]) f(v.key, ms, WebText.ROUTE)
        }
        // An output that changed (Bluetooth headphones connected) shows in the latency.
        this.checkSlow(s)
        return
      }
    }
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

/** ScriptProcessorNode's buffer where there is no AudioWorklet: its smallest. */
export const FALLBACK_FRAMES = 256

/** The worklet mixer: commands go over the node's port (each sample copied once). */
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
    send: (m) => node.port.postMessage(m),
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
    createContext: (sampleRate) => {
      const Ctor = audioContextClass()
      if (!Ctor) return null
      // No sampleRate unless asked: the device's own, so nothing is resampled after the mix.
      const options: AudioContextOptions = sampleRate ? { latencyHint: 'interactive', sampleRate } : { latencyHint: 'interactive' }
      return new Ctor(options) as unknown as LiveContextLike
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
  }
}
