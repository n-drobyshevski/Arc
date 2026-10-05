// Tests for platform/audio/player.ts (port of SoundPlayer.kt) with a fake AudioContext.

import { describe, expect, it } from 'vitest'
import {
  NullPlayer,
  WebAudioPlayer,
  STALL_MS,
  canPlay,
  checkPlayable,
  pcmToFloat32,
  type AudioBufferLike,
  type AudioContextLike,
  type AudioSourceLike,
  type PlayerTimers,
} from '../../src/platform/audio/player'
import { FeatureText } from '../../src/core/text/featureText'
import { WebText } from '../../src/core/text/webText'

/** s16le bytes for [samples]. */
function s16(...samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length * 2)
  const dv = new DataView(out.buffer)
  samples.forEach((s, i) => dv.setInt16(i * 2, s, true))
  return out
}

class FakeBuffer implements AudioBufferLike {
  readonly data: Float32Array[]
  constructor(
    readonly channels: number,
    readonly frames: number,
    readonly rate: number,
  ) {
    this.data = Array.from({ length: channels }, () => new Float32Array(frames))
  }
  getChannelData(c: number): Float32Array {
    const d = this.data[c]
    if (!d) throw new RangeError('IndexSizeError')
    return d
  }
}

class FakeSource implements AudioSourceLike {
  buffer: AudioBufferLike | null = null
  onended: (() => void) | null = null
  connectedTo: unknown = null
  started = false
  stopped = false
  disconnected = false
  failStart = false
  connect(d: unknown): unknown {
    this.connectedTo = d
    return d
  }
  disconnect(): void {
    this.disconnected = true
  }
  start(): void {
    if (this.failStart) throw new Error('InvalidStateError')
    this.started = true
  }
  stop(): void {
    this.stopped = true
  }
  /** The sound reaches its end. */
  end(): void {
    this.onended?.()
  }
}

class FakeContext implements AudioContextLike {
  state = 'suspended'
  readonly destination = { kind: 'destination' }
  resumes = 0
  buffers: FakeBuffer[] = []
  sources: FakeSource[] = []
  /** Lowest and highest rate createBuffer takes (Firefox: 8000..192000). */
  minRate = 3000
  maxRate = 768000
  failStart = false
  /** When true, resume() never gets the context going (no user activation). */
  stuck = false
  listeners: (() => void)[] = []
  resume(): Promise<void> {
    this.resumes++
    if (this.stuck) return new Promise(() => undefined)
    this.setState('running')
    return Promise.resolve()
  }
  setState(s: string): void {
    if (this.state === s) return
    this.state = s
    for (const l of this.listeners) l()
  }
  addEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.push(listener)
  }
  createBuffer(channels: number, frames: number, rate: number): AudioBufferLike {
    if (rate < this.minRate || rate > this.maxRate) {
      const e = new Error(`The sample rate provided (${rate}) is outside the range`)
      e.name = 'NotSupportedError'
      throw e
    }
    const b = new FakeBuffer(channels, frames, rate)
    this.buffers.push(b)
    return b
  }
  createBufferSource(): AudioSourceLike {
    const s = new FakeSource()
    s.failStart = this.failStart
    this.sources.push(s)
    return s
  }
}

function player(ctx: FakeContext = new FakeContext()): { p: WebAudioPlayer; ctx: FakeContext; made: () => number } {
  let made = 0
  const p = new WebAudioPlayer(() => {
    made++
    return ctx
  })
  return { p, ctx, made: () => made }
}

describe('checks from SoundPlayer.kt', () => {
  it('canPlay: 1..2 channels at 4000..192000 Hz', () => {
    expect(canPlay(1, 46875)).toBe(true)
    expect(canPlay(2, 4000)).toBe(true)
    expect(canPlay(2, 192000)).toBe(true)
    expect(canPlay(0, 46875)).toBe(false)
    expect(canPlay(3, 46875)).toBe(false)
    expect(canPlay(1, 3999)).toBe(false)
    expect(canPlay(1, 192001)).toBe(false)
  })

  it('checkPlayable: format, empty, partial frame and silence', () => {
    expect(checkPlayable(s16(1), 3, 46875)).toBe(FeatureText.unplayableFormat(3, 46875))
    expect(checkPlayable(new Uint8Array(0), 1, 46875)).toBe(FeatureText.SILENT_SOUND)
    expect(checkPlayable(s16(5), 2, 46875)).toBe(FeatureText.SILENT_SOUND) // half a stereo frame
    expect(checkPlayable(s16(0, 0, 0, 0), 1, 46875)).toBe(FeatureText.SILENT_SOUND)
    expect(checkPlayable(s16(0, 1), 1, 46875)).toBeNull()
  })
})

describe('pcmToFloat32', () => {
  it('converts s16le to floats / 32768 and splits channels', () => {
    const [l, r] = pcmToFloat32(s16(-32768, 32767, 16384, -16384, 0, 1), 2)
    expect(Array.from(l as Float32Array)).toEqual([-1, 0.5, 0])
    expect(Array.from(r as Float32Array)).toEqual([32767 / 32768, -0.5, 1 / 32768].map((v) => Math.fround(v)))
  })

  it('drops a partial frame and reads from an odd byte offset', () => {
    const backing = new Uint8Array(1 + 6)
    backing.set(s16(16384, -32768, 99).subarray(0, 5), 1)
    const view = backing.subarray(1, 6) // two whole samples and one stray byte
    const [m] = pcmToFloat32(view, 1)
    expect(Array.from(m as Float32Array)).toEqual([0.5, -1])
  })
})

describe('WebAudioPlayer', () => {
  it('creates the context lazily and wakes it from a tap', () => {
    const { p, ctx, made } = player()
    expect(made()).toBe(0)
    p.resumeInGesture()
    expect(made()).toBe(1)
    expect(ctx.resumes).toBe(1)
    p.resumeInGesture()
    expect(made()).toBe(1)
    expect(ctx.resumes).toBe(1) // already running
    expect(p.volumeOff()).toBe(false)
  })

  it('plays: buffer filled from the PCM, source connected and started, playing set', async () => {
    const { p, ctx } = player()
    const r = await p.play('device:3', s16(16384, -16384, 32767, 0), 2, 46875)
    expect(r).toEqual({ kind: 'started', route: 'default output' })
    const b = ctx.buffers[0] as FakeBuffer
    expect([b.channels, b.frames, b.rate]).toEqual([2, 2, 46875])
    expect(Array.from(b.data[0] as Float32Array)).toEqual([0.5, Math.fround(32767 / 32768)])
    expect(Array.from(b.data[1] as Float32Array)).toEqual([-0.5, 0])
    const s = ctx.sources[0] as FakeSource
    expect(s.buffer).toBe(b)
    expect(s.connectedTo).toBe(ctx.destination)
    expect(s.started).toBe(true)
    expect(p.playing.value).toBe('device:3')
    expect(ctx.resumes).toBe(1)
  })

  it('onended clears playing', async () => {
    const { p, ctx } = player()
    await p.play('backup:x:1', s16(1, 2), 1, 46875)
    ;(ctx.sources[0] as FakeSource).end()
    expect(p.playing.value).toBeNull()
    expect((ctx.sources[0] as FakeSource).disconnected).toBe(true)
  })

  it('starting a sound stops the previous one; its late onended changes nothing', async () => {
    const { p, ctx } = player()
    await p.play('a', s16(1, 2), 1, 46875)
    await p.play('b', s16(3, 4), 1, 46875)
    const [first, second] = ctx.sources as [FakeSource, FakeSource]
    expect(first.stopped).toBe(true)
    expect(first.onended).toBeNull()
    expect(p.playing.value).toBe('b')
    first.end()
    expect(p.playing.value).toBe('b')
    second.end()
    expect(p.playing.value).toBeNull()
  })

  it('stop() silences now and clears playing', async () => {
    const { p, ctx } = player()
    await p.play('a', s16(1, 2), 1, 46875)
    p.stop()
    expect((ctx.sources[0] as FakeSource).stopped).toBe(true)
    expect(p.playing.value).toBeNull()
    p.stop() // nothing playing: no error
  })

  it('refuses what SoundPlayer refuses, before touching the output', async () => {
    const { p, ctx, made } = player()
    expect(await p.play('a', s16(1), 3, 46875)).toEqual({ kind: 'failed', reason: FeatureText.unplayableFormat(3, 46875) })
    expect(await p.play('a', s16(0, 0), 1, 46875)).toEqual({ kind: 'failed', reason: FeatureText.SILENT_SOUND })
    expect(await p.play('a', s16(1), 1, 2000)).toEqual({ kind: 'failed', reason: FeatureText.unplayableFormat(1, 2000) })
    expect(made()).toBe(0)
    expect(ctx.buffers).toHaveLength(0)
    expect(p.playing.value).toBeNull()
  })

  it('maps a createBuffer range error to the cantPlay reason', async () => {
    const ctx = new FakeContext()
    ctx.minRate = 8000 // Firefox
    const { p } = player(ctx)
    const r = await p.play('a', s16(1, 2), 1, 4000)
    expect(r).toEqual({ kind: 'failed', reason: WebText.unplayableHere(1, 4000) })
    expect(FeatureText.cantPlay(WebText.unplayableHere(1, 4000))).toBe(
      "Can't play this sound: 1 channels at 4000 Hz can't be played in this browser.",
    )
    expect(p.playing.value).toBeNull()
  })

  it('no audio output: no context, or one that throws', async () => {
    const none = new WebAudioPlayer(() => null)
    expect(await none.play('a', s16(1), 1, 46875)).toEqual({ kind: 'failed', reason: FeatureText.NO_AUDIO_OUTPUT })
    none.resumeInGesture()
    const throwing = new WebAudioPlayer(() => {
      throw new Error('no device')
    })
    expect(await throwing.play('a', s16(1), 1, 46875)).toEqual({ kind: 'failed', reason: FeatureText.NO_AUDIO_OUTPUT })
  })

  it('a start that throws fails with its message and leaves nothing playing', async () => {
    const ctx = new FakeContext()
    ctx.failStart = true
    const { p } = player(ctx)
    expect(await p.play('a', s16(1), 1, 46875)).toEqual({ kind: 'failed', reason: 'InvalidStateError' })
    expect(p.playing.value).toBeNull()
  })
})

class FakeTimers implements PlayerTimers {
  pending = new Map<number, { fn: () => void; ms: number }>()
  private next = 0
  setTimeout(fn: () => void, ms: number): unknown {
    this.pending.set(++this.next, { fn, ms })
    return this.next
  }
  clearTimeout(h: unknown): void {
    this.pending.delete(h as number)
  }
  runAll(): void {
    const all = [...this.pending.values()]
    this.pending.clear()
    for (const t of all) t.fn()
  }
}

describe('WebAudioPlayer lifecycle (audio focus and the stalled head)', () => {
  it('an interrupted or suspended output stops the sound, like losing audio focus', async () => {
    const { p, ctx } = player()
    p.resumeInGesture()
    await p.play('a', s16(1, 2), 1, 46875)
    expect(p.playing.value).toBe('a')
    ctx.setState('interrupted')
    expect(p.playing.value).toBeNull()
    expect((ctx.sources[0] as FakeSource).stopped).toBe(true)
    ctx.setState('running')
    await p.play('b', s16(1, 2), 1, 46875)
    ctx.setState('suspended')
    expect(p.playing.value).toBeNull()
  })

  it('a context that wakes after play() keeps playing', async () => {
    const ctx = new FakeContext()
    ctx.stuck = true
    const timers = new FakeTimers()
    const p = new WebAudioPlayer(() => ctx, timers)
    const r = await p.play('a', s16(1, 2), 1, 46875)
    expect(r.kind).toBe('started')
    expect([...timers.pending.values()].map((t) => t.ms)).toEqual([STALL_MS])
    ctx.setState('running') // the resume went through after all
    expect(p.playing.value).toBe('a')
    timers.runAll()
    expect(p.playing.value).toBe('a')
  })

  it('a context that never runs gives up after STALL_MS (nothing heard, no onended)', async () => {
    const ctx = new FakeContext()
    ctx.stuck = true
    const timers = new FakeTimers()
    const p = new WebAudioPlayer(() => ctx, timers)
    await p.play('a', s16(1, 2), 1, 46875)
    expect(STALL_MS).toBe(2000)
    timers.runAll()
    expect(p.playing.value).toBeNull()
    expect((ctx.sources[0] as FakeSource).stopped).toBe(true)
  })

  it('stop and end clear the stall timer; a stale timer does not stop the next sound', async () => {
    const ctx = new FakeContext()
    ctx.stuck = true
    const timers = new FakeTimers()
    const p = new WebAudioPlayer(() => ctx, timers)
    await p.play('a', s16(1, 2), 1, 46875)
    p.stop()
    expect(timers.pending.size).toBe(0)
    await p.play('b', s16(1, 2), 1, 46875)
    ;(ctx.sources[1] as FakeSource).end()
    expect(timers.pending.size).toBe(0)
    await p.play('c', s16(1, 2), 1, 46875)
    await p.play('d', s16(1, 2), 1, 46875) // replaces c, clearing its timer
    expect(timers.pending.size).toBe(1)
    expect(p.playing.value).toBe('d')
  })

  it('a closed context is replaced by a new one', async () => {
    const contexts: FakeContext[] = []
    const p = new WebAudioPlayer(() => {
      const c = new FakeContext()
      contexts.push(c)
      return c
    })
    p.resumeInGesture()
    ;(contexts[0] as FakeContext).state = 'closed'
    await p.play('a', s16(1, 2), 1, 46875)
    expect(contexts).toHaveLength(2)
    expect((contexts[1] as FakeContext).sources).toHaveLength(1)
    // The old context's late state change does not touch the new sound.
    ;(contexts[0] as FakeContext).setState('suspended')
    expect(p.playing.value).toBe('a')
  })
})

describe('NullPlayer', () => {
  it('records plays, makes the same checks and keeps playing until stop or end', async () => {
    const p = new NullPlayer()
    p.resumeInGesture()
    expect(p.resumed).toBe(1)
    expect(await p.play('a', s16(0), 1, 46875)).toEqual({ kind: 'failed', reason: FeatureText.SILENT_SOUND })
    expect(await p.play('a', s16(1), 1, 46875)).toEqual({ kind: 'started', route: 'default output' })
    expect(p.playing.value).toBe('a')
    expect(p.plays.map((x) => x.key)).toEqual(['a'])
    await p.play('b', s16(1), 1, 46875)
    expect(p.stops).toBe(1)
    p.end()
    expect(p.playing.value).toBeNull()
    p.failWith = 'nope'
    expect(await p.play('c', s16(1), 1, 46875)).toEqual({ kind: 'failed', reason: 'nope' })
  })
})
