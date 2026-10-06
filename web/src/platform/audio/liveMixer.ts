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
// when they change.
//
// Imports only the core mixer: this file is bundled into the worklet.

import { VoiceMixer } from '../../core/formats/voiceMixer'

/** The AudioWorkletProcessor's registered name. */
export const LIVE_PROCESSOR = 'arc-live-mixer'

/** Main thread to mixer. */
export type ToMixer =
  /** Keeps sample [id] ready (16-bit, interleaved) until 'unload'. */
  | { readonly t: 'load'; readonly id: number; readonly pcm: Int16Array }
  | { readonly t: 'unload'; readonly id: number }
  /** VoiceMixer.start with a loaded sample; [tag] is the press time (performance.now() ms), 0 for none. */
  | {
      readonly t: 'start'
      readonly key: string
      readonly id: number
      readonly channels: number
      readonly sampleRate: number
      readonly semitones: number
      readonly tag: number
    }
  | { readonly t: 'release'; readonly key: string }
  /** VoiceMixer.cut: the voice ends in CHOKE_MS, minimum gate or not (a press that became a scroll). */
  | { readonly t: 'cut'; readonly key: string }
  | { readonly t: 'stopAll' }

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

/** A VoiceMixer at [rate] that takes ToMixer commands and [post]s FromMixer reports. */
export class MixerHost {
  readonly mixer: VoiceMixer
  private readonly samples = new Map<number, Int16Array>()
  private lastKeys: ReadonlySet<string>

  constructor(
    readonly rate: number,
    private readonly post: (m: FromMixer) => void,
  ) {
    this.mixer = new VoiceMixer(rate)
    this.lastKeys = this.mixer.keys
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
        this.mixer.start(m.key, pcm, m.channels, m.sampleRate, m.semitones, m.tag)
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
    }
  }

  /**
   * Mixes [frames] frames into [left]/[right]; [time] is the context time the
   * first one plays at. A quantum allocates only when it has news to post.
   */
  render(left: Float32Array, right: Float32Array, frames: number, time: number): void {
    const before = this.mixer.frame
    this.mixer.renderPlanar(left, right, frames)
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
