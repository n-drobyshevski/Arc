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
// A press that turns out to be a scroll is cut: it fades out over CHOKE_MS at
// once, minimum gate or not.
//
// Each voice also has a shape (VoiceShape, an addition): the pad's own
// pitch, level, pan, trim, attack and release, its play mode and its mute
// group, so a pad plays as the EP-133 plays it. Its level at each frame is
// the attack's ramp times the fade's level times the shape's gain, then the
// pan's per side; a cut fades from the fade's level, as without a shape. The
// modes change what the paragraph above says: a ONESHOT voice ignores its
// release and plays to its end; a KEY voice isn't cut by the same key again
// (a new voice joins it, and release and cut take all of the key's voices); a
// LEGATO start on a key whose legato voice is still held, on the same sound,
// starts no voice: the held one takes the new pitch where it is (on another
// sound it starts over, as gated). The DEFAULT shape plays exactly as before
// shapes.
//
// A start or a release may also be timed (an addition, for the pattern
// sequencer): given an output frame, it waits for that frame and takes effect
// there, inside a render if need be (the render plays up to it, applies it,
// and goes on), so a note lands on its frame rather than on a block's edge.
// One whose frame has already passed takes effect at the next render's start,
// after the commands that aren't timed. A timed release may name a tag: it
// then lets go of only the voices started with that tag, so the sequencer's
// note-off never ends a press of the same pad. flushTimed drops the timed
// commands still waiting. Without timed commands a render plays exactly as
// before them.
//
// render allocates nothing unless a voice starts, a timed command waits, or
// keys changes, so the audio thread doesn't feed the garbage collector.
//
// Web deltas:
// - No threads: start/release/cut/stopAll queue commands that take effect at
//   the next render, as in Kotlin, but the queue is a plain array. In an
//   AudioWorklet the mixer lives in the worklet and the main thread posts the
//   commands; with a ScriptProcessor it is called directly.
// - Besides the Kotlin `render` into 16-bit frames (Int16Array), `render`
//   also fills a Float32Array (interleaved, -1..1) and `renderPlanar` fills
//   separate left/right Float32Arrays (an AudioWorklet's output channels).
//   The mix is the same; float output is the clipped 16-bit level / 32768.
// - Kotlin's Float math is kept with Math.fround so levels match bit for bit.
//   Frame counters are numbers (safe up to 2^53 frames); "held" is Infinity
//   where Kotlin uses Long.MAX_VALUE. NOW is Kotlin's Long.MIN_VALUE, -2^63,
//   which a number holds exactly.
// - Kotlin's private cut(Voice) overload is `cutShort` here, beside the public
//   cut(key).
// - The Kotlin enum class VoiceMode is a const object plus a string-union type
//   of the same name (the values are the enum names). The data class
//   VoiceShape is an interface, with VoiceShape.DEFAULT and VoiceShape.of()
//   (its constructor, by named fields over the defaults) in a const object of
//   the same name. "The same
//   sound", for legato, is the same Int16Array (Kotlin: the same array).
// - The web's Live (platform/audio/liveMixer.ts) plays every voice with the
//   default shape for now.

const f = Math.fround

/** A voice still held: its fade starts at no frame. */
const HELD = Number.POSITIVE_INFINITY

/** Kotlin's Int.MAX_VALUE: VoiceShape's end when the sound isn't trimmed at its end. */
const INT_MAX = 2147483647

/** How a voice answers its release and the same key again (the EP-133's play modes, plus arc's gate). */
export const VoiceMode = {
  /** Sounds while held (at least MIN_GATE_MS), then fades; the same key again cuts it: arc's own way. */
  GATE: 'GATE',
  /** Plays to the end of the sound, release or not; the same key again cuts it and starts over. */
  ONESHOT: 'ONESHOT',
  /** Gated like GATE, but the same key again adds a voice beside the one still sounding. */
  KEY: 'KEY',
  /** Gated like GATE; the same key again while held only changes the pitch, carrying on where the sound is. */
  LEGATO: 'LEGATO',
} as const
export type VoiceMode = (typeof VoiceMode)[keyof typeof VoiceMode]

/**
 * How one voice plays its sound (an addition): a pad's SOUND EDIT settings on
 * the EP-133, as the mixer takes them. DEFAULT plays a sound as the mixer
 * always has: its own pitch and level, centred, whole, no attack, the usual
 * release, gated.
 *
 * [semitones] adds to start's (±12, may be fractional); [gain] is linear,
 * 0..1; [pan] is a balance, -16 (left) to 16 (right): the left side's gain is
 * min(1, (16 - pan) / 16), the right's min(1, (16 + pan) / 16). [start] and
 * [end] trim the sound, in its own frames: reading starts at [start] and stops
 * before [end] (clamped to the sound); an [end] at or before [start] leaves
 * nothing, and nothing plays, as with an empty sound. [attackMs] fades the
 * voice in from silence, linearly; [releaseMs] is the fade after release,
 * never shorter than FADE_MS. [mode] says how release and the same key again
 * are taken (VoiceMode). A [muteGroup] above 0 cuts every other sounding voice
 * of the same group as this one starts (in CHOKE_MS), as an open hi-hat is
 * choked by the closed one.
 */
export interface VoiceShape {
  readonly semitones: number
  readonly gain: number
  readonly pan: number
  readonly start: number
  readonly end: number
  readonly attackMs: number
  readonly releaseMs: number
  readonly mode: VoiceMode
  readonly muteGroup: number
}

/** A shape: [fields] over the defaults (Kotlin's VoiceShape constructor). */
function voiceShape(fields: Partial<VoiceShape> = {}): VoiceShape {
  return {
    semitones: 0,
    gain: 1,
    pan: 0,
    start: 0,
    end: INT_MAX,
    attackMs: 0,
    // VoiceMixer.FADE_MS (the class isn't defined yet here).
    releaseMs: 24,
    mode: VoiceMode.GATE,
    muteGroup: 0,
    ...fields,
  }
}

export const VoiceShape = {
  /** The mixer's own way of playing a sound. */
  DEFAULT: Object.freeze(voiceShape()) as VoiceShape,
  of: voiceShape,
} as const

/** A voice that began in the last render: its [tag] (the caller's), at output frame [frame]. */
export interface Started {
  readonly key: string
  readonly tag: number
  readonly frame: number
}

/** [at]: the output frame a timed command waits for, NOW for none. A release's [tag] other than 0: only the voices started with it. */
type Command =
  | {
      readonly kind: 'start'
      readonly key: string
      readonly pcm: Int16Array
      readonly channels: number
      readonly step: number
      readonly tag: number
      readonly shape: VoiceShape
      readonly at: number
    }
  | { readonly kind: 'release'; readonly key: string; readonly at: number; readonly tag: number }
  | { readonly kind: 'cut'; readonly key: string; readonly at: number }
  | { readonly kind: 'stopAll'; readonly at: number }
  | { readonly kind: 'flushTimed'; readonly at: number }

/**
 * A voice: [pcm] read from frame [first] to before [end], [level] and the
 * pan's [left] and [right] its gains, faded in over [attack] frames and out
 * over [release] after its gate.
 */
class Voice {
  pos: number
  /** The output frame the fade starts at; HELD while held. */
  fadeAt = HELD
  fadeFrames = 1
  /** Cut short: no longer the voice of its key. */
  choked = false
  /** Released (a ONESHOT voice too, though it plays on): stolen before voices still held. */
  letGo = false

  constructor(
    readonly key: string,
    public tag: number,
    readonly pcm: Int16Array,
    readonly channels: number,
    public step: number,
    readonly startFrame: number,
    first: number,
    readonly end: number,
    readonly level: number,
    readonly left: number,
    readonly right: number,
    readonly attack: number,
    readonly release: number,
    readonly mode: VoiceMode,
    readonly group: number,
  ) {
    this.pos = first
  }
}

export class VoiceMixer {
  static readonly MAX_VOICES = 8
  static readonly MIN_GATE_MS = 60
  static readonly FADE_MS = 24
  /** A voice cut short (the same key again, too many, cut or its mute group) fades this fast. */
  static readonly CHOKE_MS = 3
  /** VoiceShape's pan's reach either way. */
  static readonly PAN_MAX = 16
  /** A command's frame when it isn't timed: it takes effect at the next render's start (Kotlin's Long.MIN_VALUE). */
  static readonly NOW = -(2 ** 63)

  /** How much faster a sound is read to play [semitones] (whole or not) higher. */
  static pitchRatio(semitones: number): number {
    return Math.pow(2, semitones / 12)
  }

  private readonly commands: Command[] = []
  // Timed commands waiting for their frame: by frame, then as they came.
  private readonly pending: Command[] = []
  private readonly voices: Voice[] = []
  private mix = new Float32Array(0)
  private readonly minGate: number
  private readonly fade: number
  private readonly choke: number
  private frameCount = 0
  private keySet: ReadonlySet<string> = new Set()

  /**
   * Voices that began in the last render; the same array each time, each at
   * its frame (a timed start's own, unless it came late). A legato start that
   * only changed a held voice's pitch is reported too, with its own tag, at
   * the frame the pitch changed.
   */
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
   * [key], [semitones] (plus [shape]'s) from its own pitch, shaped by
   * [shape], until [release]. [tag] comes back in [started]. Timed, it
   * starts at output frame [at] (NOW: at the next render).
   */
  start(
    key: string,
    pcm: Int16Array,
    channels: number,
    sampleRate: number,
    semitones = 0,
    tag = 0,
    shape: VoiceShape = VoiceShape.DEFAULT,
    at: number = VoiceMixer.NOW,
  ): void {
    if (!(channels >= 1 && channels <= 2)) throw new Error(`channels: ${channels}`)
    const step = (sampleRate / this.outRate) * VoiceMixer.pitchRatio(semitones + shape.semitones)
    this.commands.push({ kind: 'start', key, pcm, channels, step, tag, shape, at })
  }

  /**
   * Lets go of voice [key] (every one of a KEY key): it fades out now, or
   * once it has sounded MIN_GATE_MS. A ONESHOT voice plays on. Timed, it
   * lets go at output frame [at]; a [tag] other than 0 lets go of only the
   * voices started with that tag.
   */
  release(key: string, at: number = VoiceMixer.NOW, tag = 0): void {
    this.commands.push({ kind: 'release', key, at, tag })
  }

  /** Ends voice [key] (all of its voices) now, in CHOKE_MS, even inside its MIN_GATE_MS: the press was a scroll. */
  cut(key: string): void {
    this.commands.push({ kind: 'cut', key, at: VoiceMixer.NOW })
  }

  /** Fades every voice out quickly. */
  stopAll(): void {
    this.commands.push({ kind: 'stopAll', at: VoiceMixer.NOW })
  }

  /** Drops the timed starts and releases still waiting for their frame; those sent after it wait as usual. */
  flushTimed(): void {
    this.commands.push({ kind: 'flushTimed', at: VoiceMixer.NOW })
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
    this.finish()
  }

  /** Mixes the next [frames] frames into separate [left] and [right] channels, -1..1. */
  renderPlanar(left: Float32Array, right: Float32Array, frames: number): void {
    this.mixNext(frames)
    const mix = this.mix
    for (let i = 0; i < frames; i++) {
      left[i] = clip(mix[2 * i]!) / 32768
      right[i] = clip(mix[2 * i + 1]!) / 32768
    }
    this.finish()
  }

  /**
   * The commands first, then the timed ones already due, then the voices up
   * to the next timed command's frame inside the render, that command, and
   * on; the frame count moves on with them.
   */
  private mixNext(frames: number): void {
    this.started.length = 0
    const commands = this.commands
    if (commands.length !== 0) {
      for (let i = 0; i < commands.length; i++) this.take(commands[i]!)
      commands.length = 0
    }
    if (this.mix.length < frames * 2) this.mix = new Float32Array(frames * 2)
    this.mix.fill(0, 0, frames * 2)
    const pending = this.pending
    const end = this.frameCount + frames
    let done = 0
    for (;;) {
      this.applyDue()
      const next = pending.length === 0 ? end : Math.min(end, pending[0]!.at)
      const n = next - this.frameCount
      if (n > 0) {
        this.playAll(done, n)
        done += n
        this.frameCount += n
      }
      if (this.frameCount >= end) break
    }
  }

  /** A command off the queue: applied now or, timed, kept until its frame, behind those already waiting for it. */
  private take(c: Command): void {
    if (c.at === VoiceMixer.NOW) {
      this.apply(c)
      return
    }
    // Moved up in place, by index: splice would make a new array of what it removes.
    const pending = this.pending
    let i = pending.length
    pending.push(c)
    while (i > 0 && pending[i - 1]!.at > c.at) {
      pending[i] = pending[i - 1]!
      i--
    }
    pending[i] = c
  }

  /** Applies the timed commands whose frame has come (or gone), in order. */
  private applyDue(): void {
    const pending = this.pending
    let n = 0
    while (n < pending.length && pending[n]!.at <= this.frameCount) n++
    if (n === 0) return
    for (let i = 0; i < n; i++) this.apply(pending[i]!)
    // Moved down in place: no new array.
    for (let i = n; i < pending.length; i++) pending[i - n] = pending[i]!
    pending.length -= n
  }

  /** Adds the next [frames] of every voice to the mix, from its frame [offset]; ended voices are dropped in place. */
  private playAll(offset: number, frames: number): void {
    const voices = this.voices
    let kept = 0
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i]!
      if (this.play(v, offset, frames)) voices[kept++] = v
    }
    voices.length = kept
  }

  private finish(): void {
    if (!this.keysChanged()) return
    const now = new Set<string>()
    for (const v of this.voices) if (!v.choked) now.add(v.key)
    this.keySet = now
  }

  /**
   * Whether the voices not cut short differ from keys, without building a
   * set. A KEY key may have several such voices: each key is counted at its
   * first.
   */
  private keysChanged(): boolean {
    let n = 0
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i]!
      if (v.choked || this.keyBefore(i)) continue
      if (!this.keySet.has(v.key)) return true
      n++
    }
    return n !== this.keySet.size
  }

  /** Whether a voice before [index], not cut short, has its key. */
  private keyBefore(index: number): boolean {
    const key = this.voices[index]!.key
    for (let i = 0; i < index; i++) {
      const v = this.voices[i]!
      if (!v.choked && v.key === key) return true
    }
    return false
  }

  private apply(c: Command): void {
    switch (c.kind) {
      case 'start': {
        if (c.pcm.length < c.channels) return
        const shape = c.shape
        const frames = Math.trunc(c.pcm.length / c.channels)
        const first = coerceIn(shape.start, 0, frames)
        const end = coerceIn(shape.end, first, frames)
        // Trimmed to nothing: as an empty sound.
        if (end <= first) return
        if (shape.mode === VoiceMode.LEGATO && this.legato(c)) return
        if (shape.mode !== VoiceMode.KEY) this.cutKey(c.key)
        if (shape.muteGroup > 0) {
          for (const v of this.voices) if (v.group === shape.muteGroup && !v.choked) this.cutShort(v)
        }
        while (this.sounding() >= this.maxVoices) {
          this.cutShort(this.voices.find((v) => !v.choked && (v.letGo || v.fadeAt !== HELD)) ?? this.voices.find((v) => !v.choked)!)
        }
        const max = VoiceMixer.PAN_MAX
        const pan = coerceIn(shape.pan, -max, max)
        this.voices.push(
          new Voice(
            c.key,
            c.tag,
            c.pcm,
            c.channels,
            c.step,
            this.frameCount,
            first,
            end,
            coerceIn(f(shape.gain), 0, 1),
            Math.min(1, f((max - pan) / max)),
            Math.min(1, f((max + pan) / max)),
            this.framesOf(shape.attackMs),
            Math.max(this.fade, this.framesOf(shape.releaseMs)),
            shape.mode,
            shape.muteGroup,
          ),
        )
        this.started.push({ key: c.key, tag: c.tag, frame: this.frameCount })
        return
      }
      case 'release':
        for (const v of this.voices) {
          if (v.key !== c.key || v.choked || (c.tag !== 0 && v.tag !== c.tag)) continue
          v.letGo = true
          if (v.fadeAt === HELD && v.mode !== VoiceMode.ONESHOT) {
            v.fadeAt = Math.max(this.frameCount, v.startFrame + this.minGate)
            v.fadeFrames = v.release
          }
        }
        return
      case 'cut':
        this.cutKey(c.key)
        return
      case 'stopAll':
        for (const v of this.voices) if (!v.choked) this.cutShort(v)
        return
      case 'flushTimed':
        this.pending.length = 0
        return
    }
  }

  /** Voices not cut short. */
  private sounding(): number {
    let n = 0
    for (const v of this.voices) if (!v.choked) n++
    return n
  }

  /**
   * A legato start: when [c]'s key has a legato voice still held on the same
   * sound, that voice takes [c]'s pitch and tag where it is (its other
   * voices, if any, are cut) and true comes back; false when a voice is to
   * start.
   */
  private legato(c: Extract<Command, { kind: 'start' }>): boolean {
    let held: Voice | undefined
    for (const v of this.voices) {
      if (v.key === c.key && !v.choked && v.fadeAt === HELD && v.mode === VoiceMode.LEGATO) held = v
    }
    if (held === undefined || held.pcm !== c.pcm || held.channels !== c.channels) return false
    for (const o of this.voices) if (o !== held && o.key === c.key && !o.choked) this.cutShort(o)
    held.step = c.step
    held.tag = c.tag
    this.started.push({ key: c.key, tag: c.tag, frame: this.frameCount })
    return true
  }

  /** [ms] in output frames (0 for less than none). */
  private framesOf(ms: number): number {
    return Math.min(INT_MAX, Math.trunc((Math.max(0, ms) * this.outRate) / 1000))
  }

  /** Cuts short the voices of [key], if any sound. */
  private cutKey(key: string): void {
    for (const v of this.voices) if (v.key === key && !v.choked) this.cutShort(v)
  }

  /** Cuts [v] short: from wherever its fade's level is now, down to nothing in CHOKE_MS. */
  private cutShort(v: Voice): void {
    v.choked = true
    const g = gain(v, this.frameCount)
    v.fadeFrames = this.choke
    v.fadeAt = this.frameCount - Math.trunc(f(f(1 - g) * this.choke))
  }

  /** Adds [frames] of [v] to the mix from its frame [offset] (the output frame the count is at); false once it has ended. */
  private play(v: Voice, offset: number, frames: number): boolean {
    const last = v.end - 1
    const pcm = v.pcm
    const ch = v.channels
    const mix = this.mix
    for (let i = 0; i < frames; i++) {
      const p = v.pos
      if (p > last) return false
      const at = this.frameCount + i
      const fadeGain = gain(v, at)
      if (fadeGain <= 0) return false
      const g = f(f(ramp(v, at) * fadeGain) * v.level)
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
      const j = 2 * (offset + i)
      mix[j] = mix[j]! + f(f(l * g) * v.left)
      mix[j + 1] = mix[j + 1]! + f(f(r * g) * v.right)
      v.pos = p + v.step
    }
    return true
  }
}

/** The fade's level at output frame [at]: 1 until it starts, then down to 0. */
function gain(v: Voice, at: number): number {
  return at < v.fadeAt ? 1 : f(1 - f(f(at - v.fadeAt) / v.fadeFrames))
}

/** The attack's level at output frame [at]: up from 0 to 1 over the voice's attack frames. */
function ramp(v: Voice, at: number): number {
  const since = at - v.startFrame
  return since >= v.attack ? 1 : f(f(since) / f(v.attack))
}

/** Kotlin's coerceIn: [x] kept within [min]..[max]. */
function coerceIn(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x
}

function clip(x: number): number {
  return x < -32768 ? -32768 : x > 32767 ? 32767 : x
}
