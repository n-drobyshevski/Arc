// Port of core/src/main/kotlin/dev/arc/ep133/formats/VoiceMixer.kt
//
// Live's pads and keys mixed into one stereo stream (an addition), so they
// play through a single output that is always open: starting a sound is
// adding a voice, not opening a track. Each voice is a sound read at its own
// speed: its sample rate against the output's, times the pitch (KEYS reads a
// sound faster to play it higher, as a sampler does, so higher is shorter).
//
// A voice sounds until it is released (a gate), then fades out over
// FADE_MS; it sounds at least MIN_GATE_MS, so the quickest tap is heard.
// The same key again cuts the old voice short with a click-free fade, and past
// maxVoices the oldest does the same: the oldest let go of first, then the
// oldest still held, so a run up the keys keeps the other hand's chord.
//
// Web deltas:
// - No threads: start/release/stopAll queue commands that take effect at the
//   next render, as in Kotlin, but the queue is a plain array. In an
//   AudioWorklet the mixer lives in the worklet and the main thread posts the
//   commands; with a ScriptProcessor it is called directly.
// - Besides the Kotlin `render` into 16-bit frames (Int16Array), `render`
//   also fills a Float32Array (interleaved, -1..1) and `renderPlanar` fills
//   separate left/right Float32Arrays (an AudioWorklet's output channels).
//   The mix is the same; float output is the clipped 16-bit level / 32768.
// - Kotlin's Float math is kept with Math.fround so levels match bit for bit.
//   Frame counters are numbers (safe up to 2^53 frames); "held" is Infinity
//   where Kotlin uses Long.MAX_VALUE.

const f = Math.fround

/** A voice still held: its fade starts at no frame. */
const HELD = Number.POSITIVE_INFINITY

/** A voice that began in the last render: its [tag] (the caller's), at output frame [frame]. */
export interface Started {
  readonly key: string
  readonly tag: number
  readonly frame: number
}

type Command =
  | { readonly kind: 'start'; readonly key: string; readonly pcm: Int16Array; readonly channels: number; readonly step: number; readonly tag: number }
  | { readonly kind: 'release'; readonly key: string }
  | { readonly kind: 'stopAll' }

class Voice {
  readonly frames: number
  pos = 0
  /** The output frame the fade starts at; HELD while held. */
  fadeAt = HELD
  fadeFrames = 1
  /** Cut short: no longer the voice of its key. */
  choked = false

  constructor(
    readonly key: string,
    readonly pcm: Int16Array,
    readonly channels: number,
    readonly step: number,
    readonly startFrame: number,
  ) {
    this.frames = Math.trunc(pcm.length / channels)
  }
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const k of a) if (!b.has(k)) return false
  return true
}

export class VoiceMixer {
  static readonly MAX_VOICES = 8
  static readonly MIN_GATE_MS = 60
  static readonly FADE_MS = 24
  /** A voice cut short (the same key again, or too many) fades this fast. */
  static readonly CHOKE_MS = 3

  /** How much faster a sound is read to play [semitones] higher. */
  static pitchRatio(semitones: number): number {
    return Math.pow(2, semitones / 12)
  }

  private readonly commands: Command[] = []
  private voices: Voice[] = []
  private mix = new Float32Array(0)
  private readonly minGate: number
  private readonly fade: number
  private readonly choke: number
  private frameCount = 0
  private keySet: ReadonlySet<string> = new Set()

  /** Voices that began in the last render. */
  readonly started: Started[] = []

  constructor(
    readonly outRate: number,
    readonly maxVoices: number = VoiceMixer.MAX_VOICES,
  ) {
    this.minGate = Math.trunc((VoiceMixer.MIN_GATE_MS * outRate) / 1000)
    this.fade = Math.max(1, Math.trunc((VoiceMixer.FADE_MS * outRate) / 1000))
    this.choke = Math.max(1, Math.trunc((VoiceMixer.CHOKE_MS * outRate) / 1000))
  }

  /** Output frames rendered so far. */
  get frame(): number {
    return this.frameCount
  }

  /** The keys sounding (and not cut short) after the last render. Same object while unchanged. */
  get keys(): ReadonlySet<string> {
    return this.keySet
  }

  /**
   * Plays [pcm] (16-bit, [channels] interleaved, at [sampleRate]) as voice
   * [key], [semitones] from its own pitch, until [release]. [tag] comes back
   * in [started].
   */
  start(key: string, pcm: Int16Array, channels: number, sampleRate: number, semitones = 0, tag = 0): void {
    if (!(channels >= 1 && channels <= 2)) throw new Error(`channels: ${channels}`)
    const step = (sampleRate / this.outRate) * VoiceMixer.pitchRatio(semitones)
    this.commands.push({ kind: 'start', key, pcm, channels, step, tag })
  }

  /** Lets go of voice [key]: it fades out now, or once it has sounded MIN_GATE_MS. */
  release(key: string): void {
    this.commands.push({ kind: 'release', key })
  }

  /** Fades every voice out quickly. */
  stopAll(): void {
    this.commands.push({ kind: 'stopAll' })
  }

  /**
   * Mixes the next [frames] stereo frames into [out] (left, right, …): 16-bit
   * levels into an Int16Array, as Kotlin does, or -1..1 into a Float32Array.
   */
  render(out: Int16Array | Float32Array, frames: number): void {
    this.mixNext(frames)
    const mix = this.mix
    if (out instanceof Int16Array) {
      for (let i = 0; i < frames * 2; i++) out[i] = Math.trunc(clip(mix[i]!))
    } else {
      for (let i = 0; i < frames * 2; i++) out[i] = clip(mix[i]!) / 32768
    }
    this.finish(frames)
  }

  /** Mixes the next [frames] frames into separate [left] and [right] channels, -1..1. */
  renderPlanar(left: Float32Array, right: Float32Array, frames: number): void {
    this.mixNext(frames)
    const mix = this.mix
    for (let i = 0; i < frames; i++) {
      left[i] = clip(mix[2 * i]!) / 32768
      right[i] = clip(mix[2 * i + 1]!) / 32768
    }
    this.finish(frames)
  }

  private mixNext(frames: number): void {
    this.started.length = 0
    for (let c = this.commands.shift(); c !== undefined; c = this.commands.shift()) this.apply(c)
    if (this.mix.length < frames * 2) this.mix = new Float32Array(frames * 2)
    this.mix.fill(0, 0, frames * 2)
    this.voices = this.voices.filter((v) => this.play(v, frames))
  }

  private finish(frames: number): void {
    this.frameCount += frames
    const now = new Set<string>()
    for (const v of this.voices) if (!v.choked) now.add(v.key)
    if (!sameSet(now, this.keySet)) this.keySet = now
  }

  private apply(c: Command): void {
    switch (c.kind) {
      case 'start': {
        if (c.pcm.length < c.channels) return
        this.voices.filter((v) => v.key === c.key && !v.choked).forEach((v) => this.cut(v))
        // Past the cap: the oldest let go of first, then the oldest still held.
        while (this.voices.filter((v) => !v.choked).length >= this.maxVoices) {
          this.cut(this.voices.find((v) => !v.choked && v.fadeAt !== HELD) ?? this.voices.find((v) => !v.choked)!)
        }
        this.voices.push(new Voice(c.key, c.pcm, c.channels, c.step, this.frameCount))
        this.started.push({ key: c.key, tag: c.tag, frame: this.frameCount })
        return
      }
      case 'release':
        for (const v of this.voices) {
          if (v.key === c.key && !v.choked && v.fadeAt === HELD) {
            v.fadeAt = Math.max(this.frameCount, v.startFrame + this.minGate)
            v.fadeFrames = this.fade
          }
        }
        return
      case 'stopAll':
        this.voices.filter((v) => !v.choked).forEach((v) => this.cut(v))
        return
    }
  }

  /** Cuts [v] short: from wherever its level is now, down to nothing in CHOKE_MS. */
  private cut(v: Voice): void {
    v.choked = true
    const g = gain(v, this.frameCount)
    v.fadeFrames = this.choke
    v.fadeAt = this.frameCount - Math.trunc(f(f(1 - g) * this.choke))
  }

  /** Adds [frames] of [v] to the mix; false once it has ended. */
  private play(v: Voice, frames: number): boolean {
    const last = v.frames - 1
    const pcm = v.pcm
    const ch = v.channels
    const mix = this.mix
    for (let i = 0; i < frames; i++) {
      const p = v.pos
      if (p > last) return false
      const g = gain(v, this.frameCount + i)
      if (g <= 0) return false
      const i0 = Math.trunc(p)
      const i1 = Math.min(i0 + 1, last)
      const frac = f(p - i0)
      const l0 = pcm[i0 * ch]!
      const l = f(l0 + f((pcm[i1 * ch]! - l0) * frac))
      let r = l
      if (ch === 2) {
        const r0 = pcm[i0 * 2 + 1]!
        r = f(r0 + f((pcm[i1 * 2 + 1]! - r0) * frac))
      }
      mix[2 * i] = mix[2 * i]! + f(l * g)
      mix[2 * i + 1] = mix[2 * i + 1]! + f(r * g)
      v.pos = p + v.step
    }
    return true
  }
}

function gain(v: Voice, at: number): number {
  return at < v.fadeAt ? 1 : f(1 - f(f(at - v.fadeAt) / v.fadeFrames))
}

function clip(x: number): number {
  return x < -32768 ? -32768 : x > 32767 ? 32767 : x
}
