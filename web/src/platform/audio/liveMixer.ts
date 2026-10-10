// The audio-thread half of Live's sound output (platform/audio/liveAudio.ts):
// a core VoiceMixer driven by messages. It runs inside the AudioWorklet
// (liveWorklet.ts) or, where there is none, on the main thread under a
// ScriptProcessorNode; either way the main thread only sends ToMixer commands
// and hears back FromMixer reports.
//
// Web delta from LiveAudio.kt: Kotlin's output renders on its own thread
// (the native engine's callback, or the AudioTrack loop) with the samples it
// was handed in memory, and reports back to Kotlin (the native one through
// queues a poll thread reads); here the render loop lives where the browser
// runs audio, so the samples are sent over once ('load', by id) and a press
// only names one ('start'), which keeps a press cheap. Each render reports the voices that
// began, with the context time of their first frame, and the keys sounding
// when they change. A start may carry its voice's shape (VoiceShape's
// fields over the defaults, as VoiceShape.of takes them: the FX bus's group
// and the sidechain's source among them), and 'control' sets up the mixer's
// FX bus (VoiceMixer.control).
//
// TAKE (LiveAudio.kt's take): 'arm' gives the host a core TakeRecorder, fed
// each render as Kotlin's output feeds it; what it keeps is sent over in
// 'take' chunks of interleaved 16-bit frames (Kotlin's TakeWriter queue),
// then 'takeEnd' with the frames to keep. 'transport' is the EP-133's PLAY
// and STOP (MIDI clock), as LiveAudio.kt's transportStarted/Stopped.
//
// Imports only core modules: this file is bundled into the worklet.

import { TakeRecorder, type RecState } from '../../core/features/takeRecorder'
import { VoiceMixer, VoiceShape } from '../../core/formats/voiceMixer'

/** The AudioWorkletProcessor's registered name. */
export const LIVE_PROCESSOR = 'arc-live-mixer'

/** Main thread to mixer. */
export type ToMixer =
  /** Keeps sample [id] ready (16-bit, interleaved) until 'unload'. */
  | { readonly t: 'load'; readonly id: number; readonly pcm: Int16Array }
  | { readonly t: 'unload'; readonly id: number }
  /**
   * VoiceMixer.start with a loaded sample; [tag] is the press time
   * (performance.now() ms), 0 for none; [shape] the voice's VoiceShape
   * fields over the defaults (VoiceShape.of), none: VoiceShape.DEFAULT.
   */
  | {
      readonly t: 'start'
      readonly key: string
      readonly id: number
      readonly channels: number
      readonly sampleRate: number
      readonly semitones: number
      readonly tag: number
      readonly shape?: Partial<VoiceShape>
    }
  | { readonly t: 'release'; readonly key: string }
  /** VoiceMixer.cut: the voice ends in CHOKE_MS, minimum gate or not (a press that became a scroll). */
  | { readonly t: 'cut'; readonly key: string }
  | { readonly t: 'stopAll' }
  /** VoiceMixer.control: FxControl command [what] (FX_TYPE to PUNCH) with its [index], [x] and [y]. */
  | { readonly t: 'control'; readonly what: number; readonly index: number; readonly x: number; readonly y: number }
  /** Arms TAKE: the next sound (or the device's PLAY) starts a take. */
  | { readonly t: 'arm' }
  /** Stops the take (or disarms): what was recorded is sent, then 'takeEnd'. */
  | { readonly t: 'stopRec' }
  /** The EP-133 started ([playing]) or stopped playing. */
  | { readonly t: 'transport'; readonly playing: boolean }

/**
 * [m] as it is posted to the worklet, and what moves with it: a 'load' takes
 * a copy of just its samples (a view's whole buffer would be cloned
 * otherwise) whose buffer is transferred, so the main thread's own array is
 * never detached and no second clone waits in the port. Every other command
 * is posted as it is.
 */
export function transferable(m: ToMixer): [ToMixer, Transferable[]] {
  if (m.t !== 'load') return [m, []]
  const pcm = m.pcm.slice()
  return [{ t: 'load', id: m.id, pcm }, [pcm.buffer]]
}

/** A voice that began: its press [tag] and the context time ([time], s) its first frame plays at. */
export interface StartedVoice {
  readonly key: string
  readonly tag: number
  readonly time: number
}

/** Mixer to main thread. */
export type FromMixer =
  | { readonly t: 'started'; readonly voices: readonly StartedVoice[] }
  /** The keys sounding (VoiceMixer.keys), sent when they change. */
  | { readonly t: 'keys'; readonly keys: readonly string[] }
  /** The TAKE key's state, sent when it changes. */
  | { readonly t: 'rec'; readonly state: RecState }
  /** Recorded frames of the take going (stereo, interleaved), in order. */
  | { readonly t: 'take'; readonly pcm: Int16Array }
  /** The take ended: its first [keep] frames are kept (0: nothing was played); [limit] when the limit ended it. */
  | { readonly t: 'takeEnd'; readonly keep: number; readonly limit: boolean }

/** A VoiceMixer at [rate] that takes ToMixer commands and [post]s FromMixer reports. */
export class MixerHost {
  /** Frames sent in one 'take' chunk (about 0.17 s at 48 kHz). */
  static readonly TAKE_CHUNK_FRAMES = 8192

  readonly mixer: VoiceMixer
  private readonly samples = new Map<number, Int16Array>()
  private lastKeys: ReadonlySet<string>
  /** The longest take, in frames (TakeRecorder.MAX_SECONDS); tests make it short. */
  maxTakeFrames: number
  private recorder: TakeRecorder | null = null
  private lastRec: RecState = { kind: 'idle' }
  private burst = new Int16Array(0)
  private chunk = new Int16Array(MixerHost.TAKE_CHUNK_FRAMES * 2)
  private chunkFrames = 0

  constructor(
    readonly rate: number,
    private readonly post: (m: FromMixer) => void,
  ) {
    this.mixer = new VoiceMixer(rate)
    this.lastKeys = this.mixer.keys
    this.maxTakeFrames = TakeRecorder.MAX_SECONDS * rate
  }

  /** Samples held, for tests. */
  get loaded(): number {
    return this.samples.size
  }

  handle(m: ToMixer): void {
    switch (m.t) {
      case 'load':
        this.samples.set(m.id, m.pcm)
        return
      case 'unload':
        this.samples.delete(m.id)
        return
      case 'start': {
        const pcm = this.samples.get(m.id)
        if (pcm === undefined || !(m.channels >= 1 && m.channels <= 2)) return
        const shape = m.shape === undefined ? VoiceShape.DEFAULT : VoiceShape.of(m.shape)
        this.mixer.start(m.key, pcm, m.channels, m.sampleRate, m.semitones, m.tag, shape)
        return
      }
      case 'release':
        this.mixer.release(m.key)
        return
      case 'cut':
        this.mixer.cut(m.key)
        return
      case 'stopAll':
        this.mixer.stopAll()
        return
      case 'control':
        this.mixer.control(m.what, m.index, m.x, m.y)
        return
      case 'arm':
        if (this.recorder !== null) return
        this.recorder = new TakeRecorder(this.rate, this.maxTakeFrames)
        this.recorder.arm()
        this.setRec({ kind: 'armed' })
        return
      case 'stopRec':
        if (this.recorder !== null) this.endTake(false)
        return
      case 'transport': {
        const r = this.recorder
        if (r === null) return
        if (m.playing) r.transportStart()
        else if (r.byTransport && r.state === 'RECORDING') this.endTake(false)
        return
      }
    }
  }

  private setRec(state: RecState): void {
    const last = this.lastRec
    if (last.kind === state.kind && (state.kind !== 'recording' || (last.kind === 'recording' && last.seconds === state.seconds))) return
    this.lastRec = state
    this.post({ t: 'rec', state })
  }

  /** Records what the recorder keeps of the burst just rendered (planar -1..1, as 16-bit frames). */
  private record(left: Float32Array, right: Float32Array, frames: number, at: number): void {
    const r = this.recorder
    if (r === null) return
    if (this.burst.length < frames * 2) this.burst = new Int16Array(frames * 2)
    const out = this.burst
    // The mix's 16-bit levels, as Kotlin's render gives them (x / 32768 * 32768 is exact).
    for (let i = 0; i < frames; i++) {
      out[2 * i] = Math.trunc(left[i]! * 32768)
      out[2 * i + 1] = Math.trunc(right[i]! * 32768)
    }
    let first: number | null = null
    for (const s of this.mixer.started) if (first === null || s.frame < first) first = s.frame
    const k = r.onBurst(out, frames, at, first)
    if (k !== null) this.keep(out, k.from, k.frames)
    if (k?.last === true) this.endTake(true)
    else if (r.state === 'RECORDING') this.setRec({ kind: 'recording', seconds: r.seconds })
  }

  private keep(out: Int16Array, from: number, frames: number): void {
    let i = from
    let left = frames
    while (left > 0) {
      const n = Math.min(left, MixerHost.TAKE_CHUNK_FRAMES - this.chunkFrames)
      this.chunk.set(out.subarray(2 * i, 2 * (i + n)), 2 * this.chunkFrames)
      this.chunkFrames += n
      i += n
      left -= n
      if (this.chunkFrames === MixerHost.TAKE_CHUNK_FRAMES) this.flush()
    }
  }

  private flush(): void {
    if (this.chunkFrames === 0) return
    this.post({ t: 'take', pcm: this.chunk.slice(0, this.chunkFrames * 2) })
    this.chunkFrames = 0
  }

  /** Ends the take: the rest is sent, then how much of it to keep. */
  private endTake(limit: boolean): void {
    const r = this.recorder
    if (r === null) return
    this.recorder = null
    const keep = r.stop()
    this.flush()
    this.post({ t: 'takeEnd', keep, limit })
    this.setRec({ kind: 'idle' })
  }

  /**
   * Mixes [frames] frames into [left]/[right]; [time] is the context time the
   * first one plays at. A quantum allocates only when it has news to post.
   */
  render(left: Float32Array, right: Float32Array, frames: number, time: number): void {
    const before = this.mixer.frame
    this.mixer.renderPlanar(left, right, frames)
    this.record(left, right, frames, before)
    const started = this.mixer.started
    if (started.length !== 0) {
      this.post({
        t: 'started',
        voices: started.map((s) => ({ key: s.key, tag: s.tag, time: time + (s.frame - before) / this.rate })),
      })
    }
    const keys = this.mixer.keys
    if (keys !== this.lastKeys) {
      this.lastKeys = keys
      this.post({ t: 'keys', keys: [...keys] })
    }
  }
}
