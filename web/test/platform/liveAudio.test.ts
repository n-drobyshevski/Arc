// Tests for platform/audio/liveAudio.ts (port of LiveAudio.kt) and liveMixer.ts,
// with a fake backend whose mixer runs in-process.

import { describe, expect, it } from 'vitest'
import {
  LiveAudio,
  MixerHost,
  SLOW_OUTPUT_MS,
  describeOutput,
  heardAt,
  isSlowOutput,
  outputLatency,
  s16leToInt16,
  type FromMixer,
  type LiveBackend,
  type LiveContextLike,
  type MixerLink,
  type ToMixer,
} from '../../src/platform/audio/liveAudio'
import { VoiceMixer } from '../../src/core/formats/voiceMixer'
import { WebText } from '../../src/core/text/webText'
import type { LiveAudioDeps } from '../../src/state/deps'

const RATE = 48000

class FakeContext implements LiveContextLike {
  state = 'suspended'
  sampleRate = RATE
  currentTime = 0
  baseLatency: number | undefined = 0.005
  outputLatency: number | undefined = 0.02
  resumes = 0
  closed = false
  timestamp: { contextTime?: number; performanceTime?: number } | null = null
  private listeners: (() => void)[] = []
  resume(): Promise<void> {
    this.resumes++
    return Promise.resolve()
  }
  close(): Promise<void> {
    this.closed = true
    this.state = 'closed'
    return Promise.resolve()
  }
  getOutputTimestamp(): { contextTime?: number; performanceTime?: number } {
    return this.timestamp ?? { contextTime: 0, performanceTime: 0 }
  }
  addEventListener(_type: 'statechange', l: () => void): void {
    this.listeners.push(l)
  }
  setState(s: string): void {
    this.state = s
    for (const l of this.listeners) l()
  }
}

/** A mixer link: what the main thread sent, applied to an in-process MixerHost. */
class FakeLink implements MixerLink {
  readonly kind = 'FakeWorklet'
  readonly sent: ToMixer[] = []
  closed = false
  constructor(readonly host: MixerHost) {}
  send(m: ToMixer): void {
    this.sent.push(m)
    this.host.handle(m)
  }
  close(): void {
    this.closed = true
  }
  /** One render quantum (128 frames) starting at context time [time]. */
  render(time: number, frames = 128): { left: Float32Array; right: Float32Array } {
    const left = new Float32Array(frames)
    const right = new Float32Array(frames)
    this.host.render(left, right, frames, time)
    return { left, right }
  }
}

class FakeBackend implements LiveBackend {
  contexts: FakeContext[] = []
  links: FakeLink[] = []
  gesture = true
  hasAudio = true
  failConnect = false
  clock = 1000
  /** Connects resolve when [settle] is called, not at once. */
  deferred = false
  private waiting: (() => void)[] = []
  supported(): boolean {
    return this.hasAudio
  }
  rates: (number | undefined)[] = []
  createContext(rate?: number): LiveContextLike | null {
    if (!this.hasAudio) return null
    this.rates.push(rate)
    const c = new FakeContext()
    if (rate) c.sampleRate = rate
    this.contexts.push(c)
    return c
  }
  connect(ctx: LiveContextLike, onMessage: (m: FromMixer) => void): Promise<MixerLink> {
    if (this.failConnect) return Promise.reject(new Error('no worklet'))
    const make = () => {
      const l = new FakeLink(new MixerHost(ctx.sampleRate, onMessage))
      this.links.push(l)
      return l
    }
    if (!this.deferred) return Promise.resolve(make())
    return new Promise((resolve) => this.waiting.push(() => resolve(make())))
  }
  settle(): void {
    for (const w of this.waiting.splice(0)) w()
  }
  now(): number {
    return this.clock
  }
  gestureSeen(): boolean {
    return this.gesture
  }
  get ctx(): FakeContext {
    return this.contexts[this.contexts.length - 1]!
  }
  get link(): FakeLink {
    return this.links[this.links.length - 1]!
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

/** A loud mono sample, [frames] long. */
function tone(frames = 4800, level = 10000): Int16Array {
  return new Int16Array(frames).fill(level)
}

describe('s16leToInt16', () => {
  it('reads little-endian samples and drops a partial one', () => {
    const b = new Uint8Array([0x01, 0x00, 0xff, 0xff, 0x00, 0x80, 0x7f])
    expect([...s16leToInt16(b)]).toEqual([1, -1, -32768])
  })
  it('reads an unaligned view', () => {
    const buf = new Uint8Array([9, 0x34, 0x12])
    expect([...s16leToInt16(buf.subarray(1))]).toEqual([0x1234])
  })
})

describe('latency helpers', () => {
  it('outputLatency reads seconds as ms, unknown as 0', () => {
    expect(outputLatency({ baseLatency: 0.005, outputLatency: 0.02 })).toEqual({ baseMs: 5, outputMs: 20 })
    expect(outputLatency({})).toEqual({ baseMs: 0, outputMs: 0 })
    expect(outputLatency({ baseLatency: Number.NaN, outputLatency: -1 })).toEqual({ baseMs: 0, outputMs: 0 })
  })
  it('isSlowOutput takes a long output for Bluetooth', () => {
    expect(isSlowOutput({ baseMs: 5, outputMs: 30 })).toBe(false)
    expect(isSlowOutput({ baseMs: 10, outputMs: SLOW_OUTPUT_MS - 10 })).toBe(true)
    expect(isSlowOutput({ baseMs: 5, outputMs: 250 })).toBe(true)
  })
  it('heardAt uses the output timestamp when there is one', () => {
    const ctx = { currentTime: 2, getOutputTimestamp: () => ({ contextTime: 1.9, performanceTime: 5000 }) }
    // Frame at 2.0 s plays 100 ms after the one at 1.9 s.
    expect(heardAt(2, 4000, ctx)).toBeCloseTo(5100, 6)
  })
  it('heardAt falls back to currentTime plus the latency', () => {
    const ctx = { currentTime: 1, baseLatency: 0.005, outputLatency: 0.02, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) }
    expect(heardAt(0.99, 3000, ctx)).toBeCloseTo(3000 - 10 + 25, 6)
    expect(heardAt(1, 3000, { currentTime: 1 })).toBe(3000)
    const throwing = { currentTime: 1, getOutputTimestamp: () => { throw new Error('closed') } }
    expect(heardAt(1, 3000, throwing)).toBe(3000)
  })
  it('describeOutput names the rate, the mixer and the latency', () => {
    const c = new FakeContext()
    expect(describeOutput(c, 'AudioWorklet')).toBe('48000 Hz, AudioWorklet, base latency 5 ms, output latency 20 ms')
    c.outputLatency = 0
    expect(describeOutput(c, 'ScriptProcessor')).toBe('48000 Hz, ScriptProcessor, base latency 5 ms, output latency not known yet')
  })
})

describe('MixerHost', () => {
  it('plays a loaded sample and reports when it began and which keys sound', () => {
    const out: FromMixer[] = []
    const h = new MixerHost(RATE, (m) => out.push(m))
    h.handle({ t: 'load', id: 1, pcm: tone() })
    h.handle({ t: 'start', key: 'live:0:3', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 42 })
    const l = new Float32Array(128)
    const r = new Float32Array(128)
    h.render(l, r, 128, 2.5)
    expect(l[0]).toBeCloseTo(10000 / 32768, 6)
    expect(r[10]).toBeCloseTo(10000 / 32768, 6)
    expect(out).toEqual([
      { t: 'started', voices: [{ key: 'live:0:3', tag: 42, time: 2.5 }] },
      { t: 'keys', keys: ['live:0:3'] },
    ])
    out.length = 0
    h.render(l, r, 128, 2.5 + 128 / RATE)
    expect(out).toEqual([]) // nothing new
  })
  it('ignores a start for a sample it does not hold, and drops unloaded ones', () => {
    const out: FromMixer[] = []
    const h = new MixerHost(RATE, (m) => out.push(m))
    h.handle({ t: 'start', key: 'k', id: 9, channels: 1, sampleRate: RATE, semitones: 0, tag: 1 })
    h.handle({ t: 'load', id: 9, pcm: tone() })
    expect(h.loaded).toBe(1)
    h.handle({ t: 'unload', id: 9 })
    expect(h.loaded).toBe(0)
    h.handle({ t: 'start', key: 'k', id: 9, channels: 1, sampleRate: RATE, semitones: 0, tag: 1 })
    h.render(new Float32Array(128), new Float32Array(128), 128, 0)
    expect(out).toEqual([])
  })
  it('gates: a released voice fades out after the minimum gate', () => {
    const out: FromMixer[] = []
    const h = new MixerHost(RATE, (m) => out.push(m))
    h.handle({ t: 'load', id: 1, pcm: tone(RATE) })
    h.handle({ t: 'start', key: 'k', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0 })
    h.handle({ t: 'release', key: 'k' })
    const first = new Float32Array(128)
    h.render(first, new Float32Array(128), 128, 0)
    expect(first[100]).toBeGreaterThan(0)
    expect(out.at(-1)).toEqual({ t: 'keys', keys: ['k'] })
    const frames = Math.ceil(((VoiceMixer.MIN_GATE_MS + VoiceMixer.FADE_MS) * RATE) / 1000)
    const l = new Float32Array(frames)
    h.render(l, new Float32Array(frames), frames, 128 / RATE)
    expect(l[frames - 1]).toBe(0)
    expect(out.at(-1)).toEqual({ t: 'keys', keys: [] })
  })
  it('KEYS pitch: twelve semitones up reads the sample twice as fast', () => {
    const h = new MixerHost(RATE, () => undefined)
    const ramp = Int16Array.from({ length: 1000 }, (_, i) => i * 10)
    h.handle({ t: 'load', id: 1, pcm: ramp })
    h.handle({ t: 'start', key: 'key:60', id: 1, channels: 1, sampleRate: RATE, semitones: 12, tag: 0 })
    const l = new Float32Array(4)
    h.render(l, new Float32Array(4), 4, 0)
    expect([...l].map((x) => Math.round(x * 32768))).toEqual([0, 20, 40, 60])
  })
  it('keeps up to eight voices', () => {
    const out: FromMixer[] = []
    const h = new MixerHost(RATE, (m) => out.push(m))
    h.handle({ t: 'load', id: 1, pcm: tone() })
    for (let i = 0; i < 10; i++) h.handle({ t: 'start', key: `k${i}`, id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0 })
    h.render(new Float32Array(128), new Float32Array(128), 128, 0)
    const keys = out.find((m) => m.t === 'keys')
    expect(keys).toEqual({ t: 'keys', keys: ['k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9'] })
  })
  it('reports a voice starting mid-render at its own time', () => {
    const out: FromMixer[] = []
    const h = new MixerHost(RATE, (m) => out.push(m))
    h.handle({ t: 'load', id: 1, pcm: tone() })
    h.render(new Float32Array(128), new Float32Array(128), 128, 1)
    h.handle({ t: 'start', key: 'k', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 7 })
    h.render(new Float32Array(128), new Float32Array(128), 128, 1 + 128 / RATE)
    const s = out.find((m) => m.t === 'started')
    expect(s).toEqual({ t: 'started', voices: [{ key: 'k', tag: 7, time: 1 + 128 / RATE }] })
  })
})


async function opened(backend = new FakeBackend()) {
  const live = new LiveAudio(backend)
  const log: string[] = []
  const started: { id: string; ms: number; route: string }[] = []
  const slow: number[] = []
  live.onLog((l) => log.push(l))
  live.onStarted((id, ms, route) => started.push({ id, ms, route }))
  live.onSlowOutput((ms) => slow.push(ms))
  expect(live.open()).toBe(true)
  await flush()
  return { live, backend, log, started, slow }
}

const PAD = { pitch: 0, gate: true }

describe('LiveAudio', () => {
  it('is state/deps LiveAudioDeps', () => {
    const deps: LiveAudioDeps = new LiveAudio(new FakeBackend())
    expect(deps.description).toBe('')
    expect(deps.voices.value.size).toBe(0)
  })

  it('opens one output on Live when a tap has happened', async () => {
    const { live, backend, log } = await opened()
    expect(backend.contexts).toHaveLength(1)
    expect(backend.rates).toEqual([undefined]) // the device's own rate
    expect(live.isOpen).toBe(true)
    expect(live.description).toBe('48000 Hz, FakeWorklet, base latency 5 ms, output latency 20 ms')
    expect(log).toEqual(['live audio: 48000 Hz, FakeWorklet, base latency 5 ms, output latency 20 ms'])
    expect(live.latency()).toEqual({ baseMs: 5, outputMs: 20 })
    // Open again: the same output.
    expect(live.open()).toBe(true)
    expect(backend.contexts).toHaveLength(1)
  })

  it('asks for a sample rate when given one', async () => {
    const backend = new FakeBackend()
    const live = new LiveAudio(backend)
    live.open(44100)
    expect(backend.rates).toEqual([44100])
  })

  it('waits for a tap: open sets nothing up, the press does', () => {
    const backend = new FakeBackend()
    backend.gesture = false
    const live = new LiveAudio(backend)
    expect(live.open()).toBe(true)
    expect(backend.contexts).toHaveLength(0)
    expect(live.isOpen).toBe(false)
    live.resumeInGesture()
    expect(backend.contexts).toHaveLength(1)
    expect(backend.ctx.resumes).toBe(1)
  })

  it('a touch: the release (pointerup, which browsers count as the tap) wakes the output the press made', async () => {
    const backend = new FakeBackend()
    backend.gesture = false
    const live = new LiveAudio(backend)
    live.open()
    live.preload('s', tone(), 1, RATE)
    expect(live.press('live:0:0', 's', PAD)).toBe(true)
    await Promise.resolve()
    expect(backend.ctx.resumes).toBe(1) // refused on a touch's pointerdown: still suspended
    live.release('live:0:0')
    expect(backend.ctx.resumes).toBe(2)
    backend.ctx.state = 'running'
    live.release('live:0:0')
    expect(backend.ctx.resumes).toBe(2) // a running output is left alone
    live.close()
    live.release('live:0:0') // after Live closed: nothing made again
    expect(backend.contexts).toHaveLength(1)
  })

  it('is false with no audio output at all', () => {
    const backend = new FakeBackend()
    backend.hasAudio = false
    const live = new LiveAudio(backend)
    expect(live.open()).toBe(false)
    live.preload('s', tone(), 1, RATE)
    expect(live.press('live:0:0', 's', PAD)).toBe(false)
  })

  it('a press of a sample not loaded is false', async () => {
    const { live, backend } = await opened()
    expect(live.has('s')).toBe(false)
    expect(live.press('live:0:0', 's', PAD)).toBe(false)
    expect(backend.link.sent).toEqual([])
  })

  it('preload sends the sample over once; a press only names it', async () => {
    const { live, backend } = await opened()
    const pcm = tone()
    live.preload('3:kick', pcm, 1, 46875)
    live.preload('3:kick', pcm, 1, 46875) // the same sample again: nothing to send
    expect(live.has('3:kick')).toBe(true)
    expect(live.press('live:0:1', '3:kick', { pitch: 0, gate: true, pressedAt: 900 })).toBe(true)
    expect(live.press('live:0:1', '3:kick', { pitch: 0, gate: true, pressedAt: 950 })).toBe(true)
    const sent = backend.link.sent
    expect(sent.filter((m) => m.t === 'load')).toHaveLength(1)
    expect(sent.filter((m) => m.t === 'start')).toEqual([
      { t: 'start', key: 'live:0:1', id: 1, channels: 1, sampleRate: 46875, semitones: 0, tag: 900 },
      { t: 'start', key: 'live:0:1', id: 1, channels: 1, sampleRate: 46875, semitones: 0, tag: 950 },
    ])
    expect(backend.ctx.resumes).toBe(2) // each press wakes a suspended output
  })

  it('a new sample under the same key replaces the old one', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(), 1, RATE)
    live.preload('s', tone(), 1, RATE)
    expect(backend.link.sent.map((m) => m.t)).toEqual(['load', 'unload', 'load'])
    expect(backend.link.host.loaded).toBe(1)
  })

  it('KEYS: the pitch goes with the press, the press time defaults to now', async () => {
    const { live, backend } = await opened()
    backend.clock = 1234
    live.preload('s', tone(), 2, RATE)
    live.press('keys:4', 's', { pitch: -5, gate: true })
    expect(backend.link.sent.at(-1)).toEqual({ t: 'start', key: 'keys:4', id: 1, channels: 2, sampleRate: RATE, semitones: -5, tag: 1234 })
  })

  it('sends a view as just its samples', async () => {
    const { live, backend } = await opened()
    const big = new Int16Array(1000)
    live.preload('s', big.subarray(10, 20), 1, RATE)
    const load = backend.link.sent[0]
    expect(load?.t).toBe('load')
    if (load?.t === 'load') {
      expect(load.pcm.length).toBe(10)
      expect(load.pcm.buffer.byteLength).toBe(20)
    }
  })

  it('a sample loaded before the output opens goes over when it does', async () => {
    const backend = new FakeBackend()
    backend.gesture = false
    const live = new LiveAudio(backend)
    live.open()
    live.preload('s', tone(), 1, RATE)
    live.resumeInGesture()
    await flush()
    expect(backend.link.sent.map((m) => m.t)).toEqual(['load'])
  })

  it('queues what comes before the mixer is ready, in order', async () => {
    const backend = new FakeBackend()
    backend.deferred = true
    const live = new LiveAudio(backend)
    live.open()
    live.preload('s', tone(), 1, RATE)
    live.press('k', 's', PAD)
    live.release('k')
    expect(backend.links).toHaveLength(0)
    backend.settle()
    await flush()
    expect(backend.link.sent.map((m) => m.t)).toEqual(['load', 'start', 'release'])
  })

  it('gate: release fades a held voice; a gate-false press plays to the end', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(RATE), 1, RATE)
    live.press('a', 's', PAD)
    live.release('a')
    live.press('b', 's', { pitch: 0, gate: false })
    live.release('b')
    expect(backend.link.sent.filter((m) => m.t === 'release')).toEqual([{ t: 'release', key: 'a' }])
    // Pressed again with the gate: its release counts again.
    live.press('b', 's', PAD)
    live.release('b')
    expect(backend.link.sent.at(-1)).toEqual({ t: 'release', key: 'b' })
  })

  it('reports each voice heard and how long after the press', async () => {
    const { live, backend, started } = await opened()
    backend.ctx.state = 'running'
    backend.ctx.currentTime = 1
    live.preload('s', tone(), 1, RATE)
    live.press('live:1:2', 's', { pitch: 0, gate: true, pressedAt: 990 })
    backend.ctx.timestamp = { contextTime: 0.99, performanceTime: 1010 }
    backend.link.render(1)
    // The frame at 1.0 s is heard 10 ms after the one at 0.99 s (1010 ms): 1020 - 990.
    expect(started).toHaveLength(1)
    expect(started[0]?.id).toBe('live:1:2')
    expect(started[0]?.ms).toBeCloseTo(30, 6)
    expect(started[0]?.route).toBe(WebText.ROUTE)
  })

  it('a listener can be removed', async () => {
    const backend = new FakeBackend()
    const live = new LiveAudio(backend)
    const got: string[] = []
    const off = live.onStarted((id) => got.push(id))
    live.open()
    await flush()
    live.preload('s', tone(), 1, RATE)
    live.press('a', 's', { ...PAD, pressedAt: 1 })
    backend.link.render(0)
    off()
    live.press('b', 's', { ...PAD, pressedAt: 1 })
    backend.link.render(0.01)
    expect(got).toEqual(['a'])
  })

  it('voices follows what sounds, for the rings', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(RATE), 1, RATE)
    live.press('a', 's', PAD)
    live.press('b', 's', PAD)
    backend.link.render(0)
    expect([...live.voices.value]).toEqual(['a', 'b'])
    live.stopAll()
    backend.link.render(0.01, 1024)
    expect(live.voices.value.size).toBe(0)
  })

  it('up to eight voices sound at once', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(RATE), 1, RATE)
    for (let i = 0; i < 9; i++) live.press(`keys:${i}`, 's', PAD)
    backend.link.render(0)
    expect(live.voices.value.size).toBe(VoiceMixer.MAX_VOICES)
    expect(live.voices.value.has('keys:0')).toBe(false)
  })

  it('points out a slow (Bluetooth-like) output once', async () => {
    const backend = new FakeBackend()
    const { live, slow, log } = await opened(backend)
    expect(slow).toEqual([])
    backend.ctx.outputLatency = 0.25
    backend.ctx.setState('running')
    expect(slow).toEqual([255])
    expect(log.at(-1)).toBe('live audio running: 48000 Hz, FakeWorklet, base latency 5 ms, output latency 250 ms')
    live.close()
    live.open()
    await flush()
    backend.ctx.outputLatency = 0.3
    backend.ctx.setState('running')
    expect(slow).toEqual([255])
  })

  it('notices an output that turned slow at the next press', async () => {
    const { live, backend, slow } = await opened()
    backend.ctx.setState('running')
    expect(slow).toEqual([])
    backend.ctx.outputLatency = 0.2
    live.preload('s', tone(), 1, RATE)
    live.press('k', 's', PAD)
    backend.link.render(0)
    expect(slow).toEqual([205])
  })

  it('stops the sounds when the system takes the output', async () => {
    const { live, backend } = await opened()
    backend.ctx.setState('running')
    live.preload('s', tone(RATE), 1, RATE)
    live.press('k', 's', PAD)
    backend.link.render(0)
    backend.ctx.setState('interrupted')
    expect(backend.link.sent.at(-1)).toEqual({ t: 'stopAll' })
  })

  it('close lets the output go; the next press opens a new one with the samples again', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(), 1, RATE)
    live.press('k', 's', PAD)
    backend.link.render(0)
    expect(live.voices.value.size).toBe(1)
    const first = backend.link
    live.close()
    expect(first.closed).toBe(true)
    expect(backend.contexts[0]?.closed).toBe(true)
    expect(live.voices.value.size).toBe(0)
    expect(live.isOpen).toBe(false)
    // Reports from the old output are ignored.
    first.render(0.1)
    expect(live.voices.value.size).toBe(0)
    live.release('k') // nothing open: nothing happens
    expect(live.has('s')).toBe(true)
    live.resumeInGesture()
    await flush()
    expect(backend.contexts).toHaveLength(2)
    expect(backend.link.sent.map((m) => m.t)).toEqual(['load'])
    expect(backend.link.host.loaded).toBe(1)
  })

  it('a close while the mixer is still starting lets it go when it comes', async () => {
    const backend = new FakeBackend()
    backend.deferred = true
    const live = new LiveAudio(backend)
    live.open()
    live.close()
    backend.settle()
    await flush()
    expect(backend.link.closed).toBe(true)
    expect(live.description).toBe('')
  })

  it('unload drops one sample, or all, on the audio side', async () => {
    const { live, backend } = await opened()
    live.preload('a', tone(), 1, RATE)
    live.preload('b', tone(), 1, RATE)
    expect(backend.link.host.loaded).toBe(2)
    live.unload('a')
    expect(live.has('a')).toBe(false)
    expect(backend.link.sent.at(-1)).toEqual({ t: 'unload', id: 1 })
    live.unload('a') // twice: nothing more
    expect(backend.link.sent).toHaveLength(3)
    live.unload()
    expect(live.has('b')).toBe(false)
    expect(backend.link.host.loaded).toBe(0)
  })

  it('a mixer that fails to start leaves no output; the next press tries again', async () => {
    const backend = new FakeBackend()
    backend.failConnect = true
    const { live, log } = await opened(backend)
    expect(live.isOpen).toBe(false)
    expect(log).toEqual(['live audio: no output (no worklet)'])
    expect(backend.ctx.closed).toBe(true)
    backend.failConnect = false
    live.preload('s', tone(), 1, RATE)
    expect(live.press('k', 's', PAD)).toBe(true)
    await flush()
    expect(backend.contexts).toHaveLength(2)
    expect(backend.link.sent.map((m) => m.t)).toEqual(['load', 'start'])
  })

  it('a context that cannot be made is no output', () => {
    const backend = new FakeBackend()
    backend.createContext = () => {
      throw new Error('NotAllowedError')
    }
    const live = new LiveAudio(backend)
    const log: string[] = []
    live.onLog((l) => log.push(l))
    expect(live.open()).toBe(false)
    expect(log).toEqual(['live audio: no output (NotAllowedError)'])
  })

  it('refuses a channel count the mixer cannot play', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(), 3, RATE)
    backend.link.sent.length = 0
    expect(live.press('k', 's', PAD)).toBe(false)
    expect(backend.link.sent).toEqual([])
  })
})
