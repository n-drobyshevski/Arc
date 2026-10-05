// Port of app/src/main/kotlin/dev/arc/ep133/audio/SoundPlayer.kt
//
// Plays sounds (16-bit PCM, mono or stereo), one at a time: starting a sound
// stops the one before, as lists want. [playing] is the key of the sound
// playing, so lists can show a Stop key on the right row. Live's pads and keys
// play through LiveAudio (liveAudio.ts) instead.
//
// Web delta: Web Audio replaces AudioTrack. The whole sound goes into one
// AudioBuffer (s16 / 32768) and plays through an AudioBufferSourceNode, whose
// onended replaces the feeding thread's wait for the playback head. There is
// no audio focus, media volume or output route on the web: volumeOff() is
// always false and the route is "default output". Browsers only play audio
// after a tap, so resumeInGesture() must run synchronously in click handlers,
// before any await (playDeviceSound downloads first).
//
// Kotlin keeps its sounds in an ordered map (voices) since Live moved to its
// own output; play() still stops them all first, so there is only ever one,
// which [current] is. SoundPlayer.isBluetooth has no counterpart (the web
// can't see the route); Live guesses Bluetooth from the output latency
// (liveAudio.ts isSlowOutput).

import { signal, type ReadonlySignal } from '@preact/signals'
import { isSilent } from '../../core/formats/wav'
import { FeatureText } from '../../core/text/featureText'
import { WebText } from '../../core/text/webText'

/** What [SoundPlayer.play] did. */
export type PlayResult =
  /** Playing; [route] names the output (always "default output" on the web). */
  | { readonly kind: 'started'; readonly route: string }
  | { readonly kind: 'failed'; readonly reason: string }

export interface SoundPlayer {
  /** The key of the sound playing, or null. */
  readonly playing: ReadonlySignal<string | null>
  /** Creates or wakes the audio output. Call synchronously from a tap, before any await. */
  resumeInGesture(): void
  /** Stops whatever plays and starts [pcm] (s16le, interleaved) under [key]. */
  play(key: string, pcm: Uint8Array, channels: number, sampleRate: number): Promise<PlayResult>
  stop(): void
  /** SoundPlayer.volumeOff: the web can't read the media volume, so always false. */
  volumeOff(): boolean
}

/** SoundPlayer.canPlay: what [SoundPlayer.play] accepts; anything else is not played. */
export function canPlay(channels: number, sampleRate: number): boolean {
  return Number.isInteger(channels) && channels >= 1 && channels <= 2 && sampleRate >= 4000 && sampleRate <= 192000
}

/**
 * The checks SoundPlayer.play makes before touching the output: the reason it
 * fails, or null when the sound can be played. A partial last frame is ignored.
 */
export function checkPlayable(pcm: Uint8Array, channels: number, sampleRate: number): string | null {
  if (!canPlay(channels, sampleRate)) return FeatureText.unplayableFormat(channels, sampleRate)
  const frameBytes = 2 * channels
  const length = pcm.length - (pcm.length % frameBytes)
  if (length === 0 || isSilent(pcm)) return FeatureText.SILENT_SOUND
  return null
}

/**
 * s16le interleaved PCM to one Float32Array per channel (sample / 32768).
 * A partial last frame is dropped.
 */
export function pcmToFloat32(pcm: Uint8Array, channels: number): Float32Array[] {
  const frames = Math.floor(pcm.length / (2 * channels))
  const out: Float32Array[] = []
  for (let c = 0; c < channels; c++) out.push(new Float32Array(frames))
  fillChannels(pcm, channels, frames, (c) => out[c] as Float32Array)
  return out
}

/** Writes [frames] frames of s16le [pcm] into the per-channel arrays [target] gives. */
function fillChannels(pcm: Uint8Array, channels: number, frames: number, target: (channel: number) => Float32Array): void {
  const dv = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const step = channels * 2
  for (let c = 0; c < channels; c++) {
    const data = target(c)
    let off = c * 2
    for (let i = 0; i < frames; i++, off += step) data[i] = dv.getInt16(off, true) / 32768
  }
}

// ---------------------------------------------------------------------------
// Web Audio

/** The bits of an AudioBuffer used here. */
export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array
}

/** The bits of an AudioBufferSourceNode used here. */
export interface AudioSourceLike {
  buffer: AudioBufferLike | null
  onended: (() => void) | null
  connect(destination: unknown): unknown
  disconnect(): void
  start(when?: number): void
  stop(when?: number): void
}

/** The bits of an AudioContext used here. */
export interface AudioContextLike {
  readonly state: string
  readonly destination: unknown
  resume(): Promise<void>
  createBuffer(channels: number, frames: number, sampleRate: number): AudioBufferLike
  createBufferSource(): AudioSourceLike
  /** 'statechange': the output was suspended or interrupted (a call, another app), the focus-loss listener's stand-in. */
  addEventListener?(type: 'statechange', listener: () => void): void
}

/** The timers the player's stall guard uses. */
export interface PlayerTimers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

/**
 * SoundPlayer.feed: a playback head that stops moving ends the wait after two
 * seconds. On the web a context that never gets going (no tap woke it) plays
 * nothing and never ends, so after this long the sound is dropped.
 */
export const STALL_MS = 2000

const defaultTimers: PlayerTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
}

// Compile-time proof that the browser AudioContext fits AudioContextLike.
const _contextFits: (c: AudioContext) => AudioContextLike = (c) => ({
  get state() {
    return c.state
  },
  destination: c.destination,
  resume: () => c.resume(),
  createBuffer: (ch, frames, rate) => c.createBuffer(ch, frames, rate),
  createBufferSource: () => c.createBufferSource() as unknown as AudioSourceLike,
  addEventListener: (type, listener) => c.addEventListener(type, listener),
})
void _contextFits

/** The browser's AudioContext, or null when there is none. */
export function browserAudioContext(): AudioContextLike | null {
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContext
    webkitAudioContext?: new () => AudioContext
  }
  const Ctor = g.AudioContext ?? g.webkitAudioContext
  if (!Ctor) return null
  return new Ctor() as unknown as AudioContextLike
}

function message(e: unknown): string {
  return e instanceof Error && e.message.length !== 0 ? e.message : String(e)
}

/** One sound being played. */
interface Playback {
  readonly source: AudioSourceLike
  /** The stall guard's timer, while the context is not running. */
  stall: unknown
}

/**
 * [SoundPlayer] on Web Audio. [createContext] makes the single AudioContext,
 * lazily, the first time it is needed (it may return null or throw when the
 * browser has no audio output).
 */
export class WebAudioPlayer implements SoundPlayer {
  private ctx: AudioContextLike | null = null
  private current: Playback | null = null
  private readonly _playing = signal<string | null>(null)
  readonly playing: ReadonlySignal<string | null> = this._playing

  constructor(
    private readonly createContext: () => AudioContextLike | null = browserAudioContext,
    private readonly timers: PlayerTimers = defaultTimers,
  ) {}

  private context(): AudioContextLike | null {
    if (this.ctx && this.ctx.state !== 'closed') return this.ctx
    let ctx: AudioContextLike | null
    try {
      ctx = this.createContext()
    } catch {
      ctx = null
    }
    this.ctx = ctx
    if (ctx?.addEventListener) {
      // The focus listener's stand-in: an output taken over (a call, another
      // app, iOS interrupting) stops the sound instead of leaving it "playing".
      ctx.addEventListener('statechange', () => {
        if (ctx.state !== 'running' && this.ctx === ctx && this.current) this.stop()
      })
    }
    return ctx
  }

  private wake(ctx: AudioContextLike): void {
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      // Not awaited: outside a tap the promise may only settle on the next one.
      ctx.resume().catch(() => undefined)
    }
  }

  resumeInGesture(): void {
    const ctx = this.context()
    if (ctx) this.wake(ctx)
  }

  volumeOff(): boolean {
    return false
  }

  async play(key: string, pcm: Uint8Array, channels: number, sampleRate: number): Promise<PlayResult> {
    this.stop()
    const bad = checkPlayable(pcm, channels, sampleRate)
    if (bad !== null) return { kind: 'failed', reason: bad }
    const ctx = this.context()
    if (!ctx) return { kind: 'failed', reason: FeatureText.NO_AUDIO_OUTPUT }
    this.wake(ctx)
    const frames = Math.floor(pcm.length / (2 * channels))
    let buffer: AudioBufferLike
    try {
      buffer = ctx.createBuffer(channels, frames, sampleRate)
    } catch {
      // NotSupportedError / RangeError: the browser's sample-rate range is
      // narrower than canPlay's (Firefox starts at 8000 Hz).
      return { kind: 'failed', reason: WebText.unplayableHere(channels, sampleRate) }
    }
    let source: AudioSourceLike
    try {
      // Straight into the buffer: a sample can be tens of MB, so no float copy in between.
      fillChannels(pcm, channels, frames, (c) => buffer.getChannelData(c))
      source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
    } catch (e) {
      return { kind: 'failed', reason: e instanceof Error ? message(e) : FeatureText.NO_AUDIO_OUTPUT }
    }
    const p: Playback = { source, stall: null }
    source.onended = () => this.finish(p)
    try {
      source.start(0)
    } catch (e) {
      source.onended = null
      runQuietly(() => source.disconnect())
      return { kind: 'failed', reason: e instanceof Error ? message(e) : FeatureText.NO_AUDIO_OUTPUT }
    }
    this.current = p
    this._playing.value = key
    if (ctx.state !== 'running') {
      // Not woken by a tap (or still waking): if it never runs, nothing is heard
      // and onended never comes. Give up after STALL_MS, as feed() does.
      p.stall = this.timers.setTimeout(() => {
        p.stall = null
        if (this.current === p && ctx.state !== 'running') this.stop()
      }, STALL_MS)
    }
    return { kind: 'started', route: WebText.ROUTE }
  }

  private clearStall(p: Playback): void {
    if (p.stall !== null) {
      this.timers.clearTimeout(p.stall)
      p.stall = null
    }
  }

  /** The sound came to its end. */
  private finish(p: Playback): void {
    this.clearStall(p)
    p.source.onended = null
    runQuietly(() => p.source.disconnect())
    if (this.current === p) {
      this.current = null
      this._playing.value = null
    }
  }

  stop(): void {
    const p = this.current
    if (!p) return
    this.current = null
    this.clearStall(p)
    p.source.onended = null
    runQuietly(() => p.source.stop())
    runQuietly(() => p.source.disconnect())
    this._playing.value = null
  }
}

function runQuietly(fn: () => void): void {
  try {
    fn()
  } catch {
    // Already stopped or disconnected.
  }
}

// ---------------------------------------------------------------------------
// Tests

/** One call to [NullPlayer.play]. */
export interface NullPlay {
  key: string
  pcm: Uint8Array
  channels: number
  sampleRate: number
}

/**
 * A [SoundPlayer] that plays nothing, for tests. It makes the same checks as
 * the real player, records what it was asked to play, and keeps [playing]
 * until [stop] or [end] (the sound reaching its end).
 */
export class NullPlayer implements SoundPlayer {
  private readonly _playing = signal<string | null>(null)
  readonly playing: ReadonlySignal<string | null> = this._playing
  readonly plays: NullPlay[] = []
  resumed = 0
  stops = 0
  /** Set to make every play fail with this reason. */
  failWith: string | null = null

  resumeInGesture(): void {
    this.resumed++
  }

  volumeOff(): boolean {
    return false
  }

  play(key: string, pcm: Uint8Array, channels: number, sampleRate: number): Promise<PlayResult> {
    this.stop()
    const bad = this.failWith ?? checkPlayable(pcm, channels, sampleRate)
    if (bad !== null) return Promise.resolve({ kind: 'failed', reason: bad })
    this.plays.push({ key, pcm, channels, sampleRate })
    this._playing.value = key
    return Promise.resolve({ kind: 'started', route: WebText.ROUTE })
  }

  stop(): void {
    if (this._playing.value === null) return
    this.stops++
    this._playing.value = null
  }

  /** The sound playing reaches its end. */
  end(): void {
    this._playing.value = null
  }
}
