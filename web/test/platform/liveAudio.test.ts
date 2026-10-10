// Tests for platform/audio/liveAudio.ts (port of LiveAudio.kt) and liveMixer.ts,
// with a fake backend whose mixer runs in-process.

import { afterEach, describe, expect, it } from 'vitest'
import {
  LATE_OUTPUT_MS,
  LATE_STEP_MS,
  LATENCY_GLITCHES,
  CHOICE_KEY,
  HINT_KEY,
  LiveAudio,
  MixerHost,
  REPLACE_QUIET_MS,
  SLOW_OUTPUT_MS,
  TAKE_END_WAIT_MS,
  takeWav,
  type RecordedTake,
  browserLiveBackend,
  describeOutput,
  heardAt,
  isSlowOutput,
  choiceOf,
  hintOf,
  lateBy,
  outputEngine,
  outputLatency,
  s16leToInt16,
  transferable,
  underruns,
  type FromMixer,
  type LiveBackend,
  type LiveContextLike,
  type LiveLatencyHint,
  type MixerLink,
  type OutputEngine,
  type ToMixer,
} from '../../src/platform/audio/liveAudio'
import { WebLatencyHint } from '../../src/core/text/latencyText'
import { pattern, patternNote, projectPatterns } from '../../src/core/features/pattern'
import { PhaseAnchors } from '../../src/core/features/sequencer'
import { VoiceMixer, VoiceShape } from '../../src/core/formats/voiceMixer'
import { decodeWav } from '../../src/core/formats/wav'
import { FxControl } from '../../src/core/formats/fx/fxBus'
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
  suspends = 0
  closed = false
  timestamp: { contextTime?: number; performanceTime?: number } | null = null
  playbackStats: { underrunEvents?: number } | null = null
  private listeners: (() => void)[] = []
  resume(): Promise<void> {
    this.resumes++
    return Promise.resolve()
  }
  suspend(): Promise<void> {
    this.suspends++
    this.state = 'suspended'
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
  hints: LiveLatencyHint[] = []
  createContext(rate: number | undefined, hint: LiveLatencyHint): LiveContextLike | null {
    if (!this.hasAudio) return null
    this.rates.push(rate)
    this.hints.push(hint)
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
  savedHint?: () => LiveLatencyHint
  saveHint?: (hint: LiveLatencyHint) => void
  savedChoice?: () => WebLatencyHint
  saveChoice?: (choice: WebLatencyHint) => void
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

  it('lateBy is the whole delay once it can be heard, rounded', () => {
    expect(lateBy({ baseMs: 5, outputMs: 30 })).toBeNull()
    expect(lateBy({ baseMs: 3, outputMs: LATE_OUTPUT_MS - 3.4 })).toBeNull()
    expect(lateBy({ baseMs: 3, outputMs: LATE_OUTPUT_MS - 3 })).toBe(LATE_OUTPUT_MS)
    expect(lateBy({ baseMs: 2.6, outputMs: 140 })).toBe(143)
  })

  it('underruns reads playbackStats where the browser has it', () => {
    expect(underruns({})).toBeNull()
    expect(underruns({ playbackStats: null })).toBeNull()
    expect(underruns({ playbackStats: {} })).toBeNull()
    expect(underruns({ playbackStats: { underrunEvents: 4 } })).toBe(4)
    const throwing = {
      get playbackStats(): { underrunEvents: number } {
        throw new Error('not allowed')
      },
    }
    expect(underruns(throwing)).toBeNull()
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
  it('cut: a voice inside its minimum gate ends within the choke, the others play on', () => {
    const out: FromMixer[] = []
    const h = new MixerHost(RATE, (m) => out.push(m))
    h.handle({ t: 'load', id: 1, pcm: tone(RATE) })
    h.handle({ t: 'start', key: 'a', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0 })
    h.handle({ t: 'start', key: 'b', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0 })
    h.render(new Float32Array(128), new Float32Array(128), 128, 0)
    h.handle({ t: 'cut', key: 'a' })
    h.handle({ t: 'cut', key: 'nothing' })
    const frames = Math.ceil(((VoiceMixer.CHOKE_MS + 1) * RATE) / 1000)
    const l = new Float32Array(frames)
    h.render(l, new Float32Array(frames), frames, 128 / RATE)
    // Only b is left, at its own level.
    expect(l[frames - 1]).toBeCloseTo(10000 / 32768, 6)
    expect(out.at(-1)).toEqual({ t: 'keys', keys: ['b'] })
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


describe('MixerHost FX', () => {
  /** A square wave on [shape]'s bus, through a host given [setup] first: 2048 frames of the left channel. */
  function played(setup: ToMixer[], shape?: Partial<VoiceShape>): Float32Array {
    const h = new MixerHost(RATE, () => undefined)
    for (const m of setup) h.handle(m)
    h.handle({ t: 'load', id: 1, pcm: new Int16Array(4800).map((_, i) => (i % 40 < 20 ? 12000 : -12000)) })
    const start: ToMixer = { t: 'start', key: 'k', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0 }
    h.handle(shape === undefined ? start : { ...start, shape })
    const l = new Float32Array(2048)
    h.render(l, new Float32Array(2048), 2048, 0)
    return l
  }
  const wet: ToMixer[] = [
    { t: 'control', what: FxControl.SEND, index: 1, x: 1, y: 0 },
    { t: 'control', what: FxControl.FX_TYPE, index: FxControl.DISTORTION, x: 1, y: 0.5 },
  ]

  it("a control reaches the mixer's FX bus, heard by a voice on that group's bus", () => {
    const dry = played([])
    expect(played(wet, { bus: 1 })).not.toEqual(dry)
    // Another group's voice, or one on no bus, plays dry.
    expect(played(wet, { bus: 2 })).toEqual(dry)
    expect(played(wet)).toEqual(dry)
  })

  it('a start without a shape plays as VoiceShape.DEFAULT; one with a shape takes its fields over the defaults', () => {
    const plain = new VoiceMixer(RATE)
    const pcm = tone()
    plain.start('k', pcm, 1, RATE, 0, 0, VoiceShape.of({ gain: 0.5, pan: 16 }))
    const want = new Float32Array(128)
    plain.renderPlanar(want, new Float32Array(128), 128)
    const h = new MixerHost(RATE, () => undefined)
    h.handle({ t: 'load', id: 1, pcm })
    h.handle({ t: 'start', key: 'k', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0, shape: { gain: 0.5, pan: 16 } })
    const got = new Float32Array(128)
    h.render(got, new Float32Array(128), 128, 0)
    expect(got).toEqual(want)
    expect(played([], {})).toEqual(played([]))
  })

  it('a duck source ducks the sidechain\'s groups even through the message path', () => {
    const duck: ToMixer[] = [{ t: 'control', what: FxControl.SIDECHAIN, index: 0b0010, x: 0.5, y: 0.5 }]
    const h = new MixerHost(RATE, () => undefined)
    for (const m of duck) h.handle(m)
    h.handle({ t: 'load', id: 1, pcm: tone(RATE) })
    h.handle({ t: 'start', key: 'held', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0, shape: { bus: 1 } })
    const before = new Float32Array(128)
    h.render(before, new Float32Array(128), 128, 0)
    h.handle({ t: 'start', key: 'kick', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0, shape: { bus: 0, gain: 0, duckSource: true } })
    const after = new Float32Array(1024)
    h.render(after, new Float32Array(1024), 1024, 0)
    // The held voice dips toward the floor once the duck source starts.
    expect(after[1000]!).toBeLessThan(before[100]! * 0.5)
  })

  it('transferable posts a control as it is', () => {
    const m: ToMixer = { t: 'control', what: FxControl.FX_XY, index: 0, x: 0.25, y: 0.75 }
    expect(transferable(m)).toEqual([m, []])
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
    expect(backend.hints).toEqual([0]) // the smallest buffer the browser allows
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

  it('warms up before the first tap: open makes the output and sends the samples; the press only wakes it', async () => {
    const backend = new FakeBackend()
    backend.gesture = false
    const live = new LiveAudio(backend)
    live.preload('s', tone(), 1, RATE)
    expect(live.open()).toBe(true)
    expect(backend.contexts).toHaveLength(1)
    expect(live.isOpen).toBe(true)
    // Not woken outside a tap: it waits, suspended.
    expect(backend.ctx.resumes).toBe(0)
    expect(backend.ctx.state).toBe('suspended')
    await flush()
    // The worklet is running and holds the sample before anything is pressed.
    expect(backend.link.sent.map((m) => m.t)).toEqual(['load'])
    expect(backend.link.host.loaded).toBe(1)
    live.resumeInGesture()
    expect(backend.ctx.resumes).toBe(1)
    expect(live.press('live:0:0', 's', PAD)).toBe(true)
    // Nothing made or sent again: just the start.
    expect(backend.contexts).toHaveLength(1)
    expect(backend.link.sent.map((m) => m.t)).toEqual(['load', 'start'])
  })

  it('a page that has had a tap is woken at open', async () => {
    const { backend } = await opened()
    expect(backend.ctx.resumes).toBe(1)
  })

  it('suspend keeps the output, its worklet and samples; open wakes the same one', async () => {
    const { live, backend } = await opened()
    backend.ctx.state = 'running'
    live.preload('s', tone(RATE), 1, RATE)
    live.press('k', 's', PAD)
    backend.link.render(0)
    expect(live.voices.value.size).toBe(1)
    const resumes = backend.ctx.resumes
    live.suspend()
    expect(backend.ctx.suspends).toBe(1)
    expect(backend.ctx.closed).toBe(false)
    expect(backend.link.closed).toBe(false)
    expect(backend.link.sent.at(-1)).toEqual({ t: 'stopAll' })
    expect(live.voices.value.size).toBe(0)
    expect(live.isOpen).toBe(true)
    // A late pointerup doesn't wake an output Live left.
    live.release('k')
    expect(backend.ctx.resumes).toBe(resumes)
    expect(live.open()).toBe(true)
    expect(backend.contexts).toHaveLength(1)
    expect(backend.links).toHaveLength(1)
    expect(backend.ctx.resumes).toBe(resumes + 1)
    // The sample is still there: a press sends no load.
    live.press('k', 's', PAD)
    expect(backend.link.sent.filter((m) => m.t === 'load')).toHaveLength(1)
    // close, by contrast, lets everything go.
    live.close()
    expect(backend.ctx.closed).toBe(true)
    expect(backend.link.closed).toBe(true)
    expect(live.isOpen).toBe(false)
  })

  it('open right after suspend, before it settles, wakes the output once it has', async () => {
    const { live, backend } = await opened()
    backend.ctx.state = 'running'
    let settle = (): void => undefined
    backend.ctx.suspend = () => {
      backend.ctx.suspends++
      // The state changes only when the promise settles.
      return new Promise<void>((resolve) => {
        settle = () => {
          backend.ctx.state = 'suspended'
          resolve()
        }
      })
    }
    const resumes = backend.ctx.resumes
    live.suspend()
    live.open()
    expect(backend.ctx.resumes).toBe(resumes)
    settle()
    await flush()
    expect(backend.ctx.resumes).toBe(resumes + 1)
    // Still away when it settles: it stays suspended.
    backend.ctx.state = 'running'
    live.suspend()
    settle()
    await flush()
    expect(backend.ctx.resumes).toBe(resumes + 1)
  })

  it('suspend before any output, or after close, does nothing', () => {
    const backend = new FakeBackend()
    const live = new LiveAudio(backend)
    live.suspend()
    expect(backend.contexts).toHaveLength(0)
    live.open()
    live.close()
    live.suspend()
    expect(backend.ctx.suspends).toBe(0)
  })

  it('cut ends a voice at once, inside its minimum gate', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(RATE), 1, RATE)
    live.press('live:0:1', 's', PAD)
    live.press('live:0:2', 's', PAD)
    backend.link.render(0)
    live.cut('live:0:1')
    expect(backend.link.sent.at(-1)).toEqual({ t: 'cut', key: 'live:0:1' })
    const frames = Math.ceil(((VoiceMixer.CHOKE_MS + 1) * RATE) / 1000)
    backend.link.render(128 / RATE, frames)
    expect([...live.voices.value]).toEqual(['live:0:2'])
  })

  it("while the mixer starts, a press's own sample and its start go over before the others", async () => {
    const backend = new FakeBackend()
    backend.deferred = true
    const live = new LiveAudio(backend)
    live.preload('a', tone(), 1, RATE)
    live.preload('b', tone(), 1, RATE)
    live.preload('c', tone(), 1, RATE)
    live.open()
    live.press('k', 'c', PAD)
    backend.settle()
    await flush()
    const sent = backend.link.sent.map((m) => (m.t === 'load' ? `load ${m.id}` : m.t))
    expect(sent).toEqual(['load 3', 'start', 'load 1', 'load 2'])
  })

  it('while the mixer starts, the commands keep their order, and a sample dropped meanwhile never goes over', async () => {
    const backend = new FakeBackend()
    backend.deferred = true
    const live = new LiveAudio(backend)
    live.preload('a', tone(), 1, RATE)
    live.preload('b', tone(), 1, RATE)
    live.open()
    live.press('k', 'b', PAD)
    live.suspend()
    live.press('k', 'b', PAD)
    live.unload('a')
    backend.settle()
    await flush()
    const sent = backend.link.sent.map((m) => (m.t === 'load' ? `load ${m.id}` : m.t))
    expect(sent).toEqual(['load 2', 'start', 'stopAll', 'start'])
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
    expect(backend.ctx.resumes).toBe(3) // open, then each press, wakes a suspended output
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

  it('posts a copy of just the samples, moved, never the array the main thread keeps', () => {
    const big = Int16Array.from({ length: 1000 }, (_, i) => i)
    const view = big.subarray(10, 20)
    const [msg, transfer] = transferable({ t: 'load', id: 4, pcm: view })
    expect(msg.t).toBe('load')
    if (msg.t !== 'load') return
    expect(msg.id).toBe(4)
    expect([...msg.pcm]).toEqual([...view])
    expect(msg.pcm.buffer.byteLength).toBe(20)
    expect(msg.pcm.buffer).not.toBe(big.buffer)
    expect(transfer).toEqual([msg.pcm.buffer])
    // Other commands go as they are, nothing transferred.
    const start: ToMixer = { t: 'start', key: 'k', id: 4, channels: 1, sampleRate: RATE, semitones: 0, tag: 0 }
    expect(transferable(start)).toEqual([start, []])
    // A real transfer detaches only the copy.
    const ch = new MessageChannel()
    ch.port1.postMessage(msg, transfer)
    ch.port1.close()
    expect(msg.pcm.length).toBe(0)
    expect(view.length).toBe(10)
    expect(big.length).toBe(1000)
  })

  it("the link gets the main thread's own samples (the ScriptProcessor mixer shares them)", async () => {
    const { live, backend } = await opened()
    const pcm = tone()
    live.preload('s', pcm, 1, RATE)
    const load = backend.link.sent[0]
    expect(load?.t === 'load' && load.pcm).toBe(pcm)
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

  it('late follows a delay long enough to be heard, and clears when the output goes', async () => {
    const { live, backend } = await opened()
    expect(live.late.value).toBeNull()
    backend.ctx.outputLatency = 0.09
    backend.ctx.setState('running')
    expect(live.late.value).toBe(95)
    // Wired headphones plugged in: the next press finds it quick again.
    backend.ctx.outputLatency = 0.02
    live.preload('s', tone(), 1, RATE)
    live.press('k', 's', PAD)
    backend.link.render(0)
    expect(live.late.value).toBeNull()
    backend.ctx.outputLatency = 0.2
    live.press('k2', 's', PAD)
    backend.link.render(0.01)
    expect(live.late.value).toBe(205)
    live.close()
    expect(live.late.value).toBeNull()
  })

  it('late moves only by LATE_STEP_MS or more, or across LATE_OUTPUT_MS', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(), 1, RATE)
    backend.ctx.outputLatency = 0.135
    backend.ctx.setState('running')
    expect(live.late.value).toBe(140)
    // The estimate wanders a few ms: the line stays as it is.
    let t = 0
    const pressAt = (seconds: number) => {
      backend.ctx.outputLatency = seconds
      live.press('k', 's', PAD)
      t += 0.01
      backend.link.render(t)
    }
    pressAt(0.139)
    expect(live.late.value).toBe(140)
    pressAt(0.131)
    expect(live.late.value).toBe(140)
    pressAt(0.135 + (LATE_STEP_MS + 1) / 1000)
    expect(live.late.value).toBe(140 + LATE_STEP_MS + 1)
    // Quick enough again: cleared at once.
    pressAt(0.07)
    expect(live.late.value).toBeNull()
    pressAt(0.076)
    expect(live.late.value).toBe(LATE_OUTPUT_MS + 1)
  })

  it('glitches at latencyHint 0 make the next output ask for interactive, for good', async () => {
    const { live, backend, log } = await opened()
    backend.ctx.playbackStats = { underrunEvents: 2 } // from starting up: not counted
    backend.ctx.setState('running')
    live.preload('s', tone(), 1, RATE)
    backend.ctx.playbackStats = { underrunEvents: 2 + LATENCY_GLITCHES - 1 }
    live.press('k', 's', PAD)
    backend.link.render(0)
    live.close()
    live.open()
    await flush()
    expect(backend.hints).toEqual([0, 0])
    backend.ctx.playbackStats = { underrunEvents: 0 }
    backend.ctx.setState('running')
    backend.ctx.playbackStats = { underrunEvents: LATENCY_GLITCHES }
    live.press('k', 's', PAD)
    backend.link.render(0)
    expect(log.at(-1)).toBe(`live audio: ${LATENCY_GLITCHES} glitches at the lowest latency; the next output asks for 'interactive'`)
    // The open output plays on; the next one asks for 'interactive', and so does every one after.
    expect(live.isOpen).toBe(true)
    live.close()
    live.open()
    await flush()
    live.close()
    live.open()
    await flush()
    expect(backend.hints).toEqual([0, 0, 'interactive', 'interactive'])
  })

  it('glitches count from each wake, and are weighed when Live leaves', async () => {
    const { live, backend, log } = await opened()
    backend.ctx.playbackStats = { underrunEvents: 0 }
    backend.ctx.setState('running')
    // A glitch with each wake: many wakes don't add up.
    for (let i = 1; i <= LATENCY_GLITCHES + 1; i++) {
      live.suspend()
      await flush()
      backend.ctx.playbackStats = { underrunEvents: i }
      live.open()
      backend.ctx.setState('running')
    }
    live.close()
    live.open()
    await flush()
    expect(backend.hints).toEqual([0, 0])
    // Glitches while playing, then Live leaves: the next output steps back.
    backend.ctx.playbackStats = { underrunEvents: 0 }
    backend.ctx.setState('running')
    backend.ctx.playbackStats = { underrunEvents: LATENCY_GLITCHES }
    live.suspend()
    expect(log.at(-1)).toContain('glitches at the lowest latency')
    live.close()
    live.open()
    expect(backend.hints).toEqual([0, 0, 'interactive'])
  })

  it('after glitches, leaving Live and coming back brings an interactive output without a close', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(), 1, RATE)
    backend.ctx.playbackStats = { underrunEvents: 0 }
    backend.ctx.setState('running')
    backend.ctx.playbackStats = { underrunEvents: LATENCY_GLITCHES }
    const old = backend.ctx
    live.suspend()
    // Let go of rather than parked; coming back makes the next one, the samples sent again.
    expect(old.closed).toBe(true)
    expect(live.isOpen).toBe(false)
    expect(live.open()).toBe(true)
    await flush()
    expect(backend.hints).toEqual([0, 'interactive'])
    expect(backend.link.sent.map((m) => m.t)).toEqual(['load'])
    expect(backend.ctx.resumes).toBe(1)
    // Parked again later: an output at 'interactive' is kept as usual.
    backend.ctx.setState('running')
    live.suspend()
    expect(backend.ctx.closed).toBe(false)
  })

  it('while Live stays open, a glitching output is replaced once nothing sounds', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(256), 1, RATE)
    backend.ctx.playbackStats = { underrunEvents: 0 }
    backend.ctx.setState('running')
    backend.ctx.playbackStats = { underrunEvents: LATENCY_GLITCHES }
    live.press('k', 's', { pitch: 0, gate: false })
    backend.link.render(0)
    expect(live.voices.value.has('k')).toBe(true)
    const old = backend.ctx
    // The voice ends just after its press: too soon to be sure no press is on its way.
    backend.link.render(128 / RATE, 1024)
    expect(live.voices.value.size).toBe(0)
    expect(old.closed).toBe(false)
    // A while later, still quiet: the output makes way for one at 'interactive', woken at once.
    backend.clock += REPLACE_QUIET_MS
    await new Promise((r) => setTimeout(r, REPLACE_QUIET_MS + 20))
    expect(old.closed).toBe(true)
    expect(live.isOpen).toBe(true)
    expect(backend.hints).toEqual([0, 'interactive'])
    expect(backend.ctx.resumes).toBe(1)
    await flush()
    expect(backend.link.sent.map((m) => m.t)).toEqual(['load'])
    expect(live.press('k', 's', PAD)).toBe(true)
  })

  it('a quiet report long after the last press replaces the output at once', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(), 1, RATE)
    backend.ctx.playbackStats = { underrunEvents: 0 }
    backend.ctx.setState('running')
    backend.ctx.playbackStats = { underrunEvents: LATENCY_GLITCHES }
    live.press('k', 's', PAD)
    backend.link.render(0)
    const old = backend.ctx
    backend.clock += 1000
    live.release('k')
    backend.link.render(128 / RATE, RATE)
    expect(old.closed).toBe(true)
    expect(backend.hints).toEqual([0, 'interactive'])
  })

  it('the step back is kept for the tab, and a new LiveAudio starts from it', async () => {
    const saved: LiveLatencyHint[] = []
    const backend = new FakeBackend()
    backend.saveHint = (h: LiveLatencyHint) => saved.push(h)
    const { live } = await opened(backend)
    backend.ctx.playbackStats = { underrunEvents: 0 }
    backend.ctx.setState('running')
    backend.ctx.playbackStats = { underrunEvents: LATENCY_GLITCHES }
    live.suspend()
    expect(saved).toEqual(['interactive'])
    const reloaded = new FakeBackend()
    reloaded.savedHint = () => 'interactive'
    await opened(reloaded)
    expect(reloaded.hints).toEqual(['interactive'])
  })

  it('a browser that does not count glitches keeps latencyHint 0', async () => {
    const { live, backend } = await opened()
    backend.ctx.setState('running')
    live.close()
    live.open()
    expect(backend.hints).toEqual([0, 0])
  })

  it('refuses a channel count the mixer cannot play', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(), 3, RATE)
    backend.link.sent.length = 0
    expect(live.press('k', 's', PAD)).toBe(false)
    expect(backend.link.sent).toEqual([])
  })

  it('control reaches the open output; a press with a shape carries it', async () => {
    const { live, backend } = await opened()
    live.preload('s', tone(), 1, RATE)
    backend.link.sent.length = 0
    live.control(FxControl.SEND, 2, 0.5, 0)
    live.press('k', 's', { ...PAD, shape: { bus: 2, duckSource: true } })
    live.press('j', 's', PAD)
    expect(backend.link.sent).toEqual([
      { t: 'control', what: FxControl.SEND, index: 2, x: 0.5, y: 0 },
      { t: 'start', key: 'k', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 1000, shape: { bus: 2, duckSource: true } },
      { t: 'start', key: 'j', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 1000 },
    ])
    expect('shape' in backend.link.sent[2]!).toBe(false)
  })

  it('control with no output opens none; the next output gets every setting kept, before any press, punch-ins aside', async () => {
    const backend = new FakeBackend()
    backend.deferred = true
    const live = new LiveAudio(backend)
    live.control(FxControl.FX_TYPE, FxControl.REVERB, 0.5, 0.5)
    live.control(FxControl.FX_XY, 0, 0.2, 0.9)
    live.control(FxControl.SEND, 0, 0.3, 0)
    live.control(FxControl.SEND, 0, 0.4, 0)
    live.control(FxControl.PUNCH, FxControl.STUTTER, 1, 0)
    expect(backend.contexts).toHaveLength(0)
    live.preload('s', tone(), 1, RATE)
    live.press('k', 's', PAD)
    backend.settle()
    await flush()
    expect(backend.link.sent.map((m) => (m.t === 'control' ? [m.what, m.index, m.x, m.y] : m.t))).toEqual([
      'load',
      [FxControl.FX_TYPE, FxControl.REVERB, 0.2, 0.9],
      [FxControl.SEND, 0, 0.4, 0],
      'start',
    ])
  })

  it('a new output after a close gets the FX settings again; a suspended one keeps its own', async () => {
    const { live, backend } = await opened()
    live.control(FxControl.COMP, 1, 0.7, 0.2)
    live.control(FxControl.TEMPO, 0, 140, 0)
    live.suspend()
    live.open()
    await flush()
    expect(backend.links).toHaveLength(1)
    expect(backend.link.sent.filter((m) => m.t === 'control')).toHaveLength(2)
    live.close()
    live.open()
    await flush()
    expect(backend.links).toHaveLength(2)
    expect(backend.link.sent).toEqual([
      { t: 'control', what: FxControl.COMP, index: 1, x: 0.7, y: 0.2 },
      { t: 'control', what: FxControl.TEMPO, index: 0, x: 140, y: 0 },
    ])
  })
})

describe('browserLiveBackend', () => {
  const g = globalThis as unknown as { AudioContext?: unknown }
  const saved = g.AudioContext
  afterEach(() => {
    g.AudioContext = saved
  })

  it('asks for latencyHint 0 at the device\'s own rate, or the hint given', () => {
    const made: AudioContextOptions[] = []
    g.AudioContext = class {
      constructor(options?: AudioContextOptions) {
        made.push(options ?? {})
      }
    }
    const backend = browserLiveBackend()
    expect(backend.createContext(undefined, 0)).not.toBeNull()
    backend.createContext(44100, 'interactive')
    expect(made).toEqual([{ latencyHint: 0 }, { latencyHint: 'interactive', sampleRate: 44100 }])
  })

  it("falls back to 'interactive' where a number can't be made", () => {
    const made: AudioContextOptions[] = []
    g.AudioContext = class {
      constructor(options?: AudioContextOptions) {
        if (typeof options?.latencyHint === 'number') throw new TypeError('latencyHint')
        made.push(options ?? {})
      }
    }
    expect(browserLiveBackend().createContext(undefined, 0)).not.toBeNull()
    expect(made).toEqual([{ latencyHint: 'interactive' }])
  })

  it('keeps the step back in sessionStorage, and carries on where storage is blocked', () => {
    const store = globalThis as unknown as { sessionStorage?: unknown }
    const before = store.sessionStorage
    try {
      const items = new Map<string, string>()
      store.sessionStorage = {
        getItem: (k: string) => items.get(k) ?? null,
        setItem: (k: string, v: string) => items.set(k, v),
      }
      const backend = browserLiveBackend()
      expect(backend.savedHint?.()).toBe(0)
      backend.saveHint?.('interactive')
      expect(items.get(HINT_KEY)).toBe('interactive')
      expect(browserLiveBackend().savedHint?.()).toBe('interactive')
      store.sessionStorage = {
        getItem: () => {
          throw new Error('SecurityError')
        },
        setItem: () => {
          throw new Error('SecurityError')
        },
      }
      expect(backend.savedHint?.()).toBe(0)
      expect(() => backend.saveHint?.('interactive')).not.toThrow()
    } finally {
      store.sessionStorage = before
    }
  })
})

describe('LiveAudio latency test', () => {
  it('hintOf and choiceOf map the debug choice to the latencyHint and back', () => {
    expect(hintOf(WebLatencyHint.ZERO)).toBe(0)
    expect(hintOf(WebLatencyHint.INTERACTIVE)).toBe('interactive')
    expect(choiceOf(0)).toBe(WebLatencyHint.ZERO)
    expect(choiceOf('interactive')).toBe(WebLatencyHint.INTERACTIVE)
  })

  it("outputEngine names the row from the hint and rate, and carries the output's reported delay", () => {
    expect(outputEngine(0, { sampleRate: 48000, baseLatency: 0.0053, outputLatency: 0.021 })).toEqual({
      label: 'latencyHint 0, 48000 Hz',
      baseMs: 5.3,
      outputMs: 21,
    })
    // An output delay of 0 (or none) is one the browser hasn't reported; the row is the same.
    expect(outputEngine(0, { sampleRate: 48000, baseLatency: 0.0053, outputLatency: 0 })).toEqual({
      label: 'latencyHint 0, 48000 Hz',
      baseMs: 5.3,
      outputMs: null,
    })
    expect(outputEngine('interactive', { sampleRate: 44100 })).toEqual({
      label: "latencyHint 'interactive', 44100 Hz",
      baseMs: 0,
      outputMs: null,
    })
  })

  it('defaults to latencyHint 0, and a kept choice of interactive opens at it', async () => {
    const { live, backend } = await opened()
    expect(live.latencyHint.value).toBe(WebLatencyHint.ZERO)
    expect(backend.hints).toEqual([0])
    const kept = new FakeBackend()
    kept.savedChoice = () => WebLatencyHint.INTERACTIVE
    const other = await opened(kept)
    expect(other.live.latencyHint.value).toBe(WebLatencyHint.INTERACTIVE)
    expect(kept.hints).toEqual(['interactive'])
  })

  it('a new choice while Live is open is kept and reopens the output at once, the samples sent again', async () => {
    const chosen: WebLatencyHint[] = []
    const backend = new FakeBackend()
    backend.saveChoice = (c) => chosen.push(c)
    const { live, log } = await opened(backend)
    live.preload('s', tone(), 1, RATE)
    const old = backend.ctx
    live.setLatencyHint(WebLatencyHint.INTERACTIVE)
    expect(chosen).toEqual([WebLatencyHint.INTERACTIVE])
    expect(live.latencyHint.value).toBe(WebLatencyHint.INTERACTIVE)
    expect(log).toContain("live audio: latencyHint 'interactive' chosen")
    expect(old.closed).toBe(true)
    expect(live.isOpen).toBe(true)
    expect(backend.hints).toEqual([0, 'interactive'])
    expect(backend.ctx.resumes).toBe(1)
    await flush()
    expect(backend.link.sent.map((m) => m.t)).toEqual(['load'])
    expect(live.press('k', 's', PAD)).toBe(true)
    // The same choice again changes nothing.
    live.setLatencyHint(WebLatencyHint.INTERACTIVE)
    expect(chosen).toHaveLength(1)
    expect(backend.contexts).toHaveLength(2)
  })

  it('a new choice while Live is away lets the suspended output go; coming back opens one at the new hint', async () => {
    const { live, backend } = await opened()
    live.suspend()
    await flush()
    live.setLatencyHint(WebLatencyHint.INTERACTIVE)
    expect(backend.ctx.closed).toBe(true)
    expect(live.isOpen).toBe(false)
    expect(live.open()).toBe(true)
    expect(backend.hints).toEqual([0, 'interactive'])
    // Before any output, a choice only sets the next one's hint.
    const fresh = new LiveAudio(new FakeBackend())
    fresh.setLatencyHint(WebLatencyHint.INTERACTIVE)
    expect(fresh.isOpen).toBe(false)
  })

  it('choosing forgets a step back after glitches, so 0 is tried afresh; the step back applies to 0 only', async () => {
    const saved: LiveLatencyHint[] = []
    const backend = new FakeBackend()
    backend.savedHint = () => 'interactive'
    backend.saveHint = (h) => saved.push(h)
    const { live } = await opened(backend)
    expect(backend.hints).toEqual(['interactive'])
    live.setLatencyHint(WebLatencyHint.INTERACTIVE)
    expect(saved).toEqual([0])
    // Already at 'interactive': nothing to reopen.
    expect(backend.contexts).toHaveLength(1)
    live.setLatencyHint(WebLatencyHint.ZERO)
    expect(backend.hints).toEqual(['interactive', 0])
    // Glitches at the 'interactive' choice step nothing back.
    live.setLatencyHint(WebLatencyHint.INTERACTIVE)
    backend.ctx.playbackStats = { underrunEvents: 0 }
    backend.ctx.setState('running')
    backend.ctx.playbackStats = { underrunEvents: LATENCY_GLITCHES * 2 }
    live.suspend()
    expect(saved).toEqual([0])
    // At 0 they do, as before.
    live.setLatencyHint(WebLatencyHint.ZERO)
    live.open()
    await flush()
    backend.ctx.playbackStats = { underrunEvents: 0 }
    backend.ctx.setState('running')
    backend.ctx.playbackStats = { underrunEvents: LATENCY_GLITCHES }
    live.suspend()
    expect(saved).toEqual([0, 'interactive'])
    live.open()
    expect(backend.hints.at(-1)).toBe('interactive')
  })

  it("the output's row shows once it is set up, keeps its name as the reported delay wanders, and each heard voice carries it", async () => {
    const backend = new FakeBackend()
    const live = new LiveAudio(backend)
    const got: { ms: number; engine: OutputEngine }[] = []
    live.onStarted((_id, ms, _route, engine) => got.push({ ms, engine }))
    expect(live.engine.value).toBeNull()
    live.open()
    await flush()
    const label = `latencyHint 0, ${RATE} Hz`
    const first: OutputEngine = { label, baseMs: 5, outputMs: 20 }
    // Before any press.
    expect(live.engine.value).toEqual(first)
    live.preload('s', tone(), 1, RATE)
    backend.ctx.state = 'running'
    backend.ctx.timestamp = { contextTime: 1, performanceTime: 1020 }
    live.press('a', 's', { ...PAD, pressedAt: 1000 })
    backend.link.render(1)
    expect(got).toEqual([{ ms: 20, engine: first }])
    expect(got[0]?.engine).toBe(live.engine.value)
    // The output's delay wanders: the same row, with the latest delay for its estimate.
    backend.ctx.outputLatency = 0.023
    live.press('b', 's', { ...PAD, pressedAt: 1000 })
    backend.link.render(1)
    expect(got[1]?.engine).toEqual({ label, baseMs: 5, outputMs: 23 })
    expect(live.engine.value).toBe(got[1]?.engine)
    // Unchanged, the same value.
    live.press('c', 's', { ...PAD, pressedAt: 1000 })
    backend.link.render(1)
    expect(got[2]?.engine).toBe(got[1]?.engine)
    // None while closed; the same choice reopened is the same row, another choice another.
    live.close()
    expect(live.engine.value).toBeNull()
    live.open()
    await flush()
    expect(live.engine.value?.label).toBe(label)
    live.setLatencyHint(WebLatencyHint.INTERACTIVE)
    await flush()
    expect(live.engine.value?.label).toBe(`latencyHint 'interactive', ${RATE} Hz`)
  })
})

describe('browserLiveBackend latency choice', () => {
  it('keeps the choice in localStorage, and carries on where storage is blocked', () => {
    const store = globalThis as unknown as { localStorage?: unknown }
    const before = store.localStorage
    try {
      const items = new Map<string, string>()
      store.localStorage = {
        getItem: (k: string) => items.get(k) ?? null,
        setItem: (k: string, v: string) => items.set(k, v),
      }
      const backend = browserLiveBackend()
      expect(backend.savedChoice?.()).toBe(WebLatencyHint.ZERO)
      backend.saveChoice?.(WebLatencyHint.INTERACTIVE)
      expect(items.get(CHOICE_KEY)).toBe('INTERACTIVE')
      expect(browserLiveBackend().savedChoice?.()).toBe(WebLatencyHint.INTERACTIVE)
      items.set(CHOICE_KEY, 'something else')
      expect(backend.savedChoice?.()).toBe(WebLatencyHint.ZERO)
      store.localStorage = {
        getItem: () => {
          throw new Error('SecurityError')
        },
        setItem: () => {
          throw new Error('SecurityError')
        },
      }
      expect(backend.savedChoice?.()).toBe(WebLatencyHint.ZERO)
      expect(() => backend.saveChoice?.(WebLatencyHint.INTERACTIVE)).not.toThrow()
    } finally {
      store.localStorage = before
    }
  })
})

describe('MixerHost REC (LiveAudio.kt takes)', () => {
  const recHost = () => {
    const out: FromMixer[] = []
    const h = new MixerHost(RATE, (m) => out.push(m))
    h.handle({ t: 'load', id: 1, pcm: tone(300) })
    return { h, out, render: (n = 128) => h.render(new Float32Array(n), new Float32Array(n), n, 0) }
  }
  const takeFrames = (out: FromMixer[]) => out.reduce((n, m) => n + (m.t === 'take' ? m.pcm.length / 2 : 0), 0)
  const recs = (out: FromMixer[]) => out.flatMap((m) => (m.t === 'rec' ? [m.state.kind] : []))

  it('arms, starts with the first sound, and keeps up to its last sound', () => {
    const { h, out, render } = recHost()
    h.handle({ t: 'arm' })
    render()
    expect(takeFrames(out)).toBe(0)
    h.handle({ t: 'start', key: 'k', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0 })
    render()
    render()
    render()
    h.handle({ t: 'stopRec' })
    const end = out.find((m) => m.t === 'takeEnd')
    // The tone's 300 frames are kept; the silence after it is sent but not kept.
    expect(end).toEqual({ t: 'takeEnd', keep: 300, limit: false })
    expect(takeFrames(out)).toBe(384)
    expect(recs(out)).toEqual(['armed', 'recording', 'idle'])
    const first = out.find((m) => m.t === 'take')
    expect(first?.t === 'take' && first.pcm[0]).toBe(10000)
  })

  it('a take with nothing played keeps nothing', () => {
    const { h, out, render } = recHost()
    h.handle({ t: 'arm' })
    render()
    h.handle({ t: 'stopRec' })
    expect(out.filter((m) => m.t === 'takeEnd')).toEqual([{ t: 'takeEnd', keep: 0, limit: false }])
  })

  it("the device's PLAY starts an armed take and its STOP ends it", () => {
    const { h, out, render } = recHost()
    h.handle({ t: 'arm' })
    h.handle({ t: 'transport', playing: true })
    render()
    h.handle({ t: 'start', key: 'k', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0 })
    render(512)
    h.handle({ t: 'transport', playing: false })
    // 128 silent frames in front, then the tone.
    expect(out.find((m) => m.t === 'takeEnd')).toEqual({ t: 'takeEnd', keep: 128 + 300, limit: false })
  })

  it("the device stopping doesn't end a take a sound started", () => {
    const { h, out, render } = recHost()
    h.handle({ t: 'arm' })
    h.handle({ t: 'start', key: 'k', id: 1, channels: 1, sampleRate: RATE, semitones: 0, tag: 0 })
    render()
    h.handle({ t: 'transport', playing: false })
    expect(out.some((m) => m.t === 'takeEnd')).toBe(false)
    h.handle({ t: 'stopRec' })
    expect(out.some((m) => m.t === 'takeEnd')).toBe(true)
  })

  it('stops by itself at the limit, sending long takes in chunks', () => {
    const { h, out, render } = recHost()
    h.maxTakeFrames = MixerHost.TAKE_CHUNK_FRAMES + 100
    h.handle({ t: 'arm' })
    h.handle({ t: 'transport', playing: true })
    for (let i = 0; i < 80; i++) render()
    const chunks = out.filter((m) => m.t === 'take')
    expect(chunks.map((m) => (m.t === 'take' ? m.pcm.length / 2 : 0))).toEqual([MixerHost.TAKE_CHUNK_FRAMES, 100])
    expect(out.filter((m) => m.t === 'takeEnd')).toEqual([{ t: 'takeEnd', keep: 0, limit: true }])
    expect(recs(out).at(-1)).toBe('idle')
  })
})

describe('LiveAudio REC', () => {
  async function recording() {
    const b = new FakeBackend()
    const live = new LiveAudio(b)
    const takes: { take: RecordedTake | null; limit: boolean }[] = []
    live.onTake((take, limit) => takes.push({ take, limit }))
    live.preload('kick', tone(300), 1, RATE)
    expect(live.arm()).toBe(true)
    await flush()
    return { b, live, takes }
  }
  const wavOf = async (t: RecordedTake) => decodeWav(new Uint8Array(await t.wav.arrayBuffer()))

  it('arms, records the pads played and hands over a WAV of them', async () => {
    const { b, live, takes } = await recording()
    expect(live.rec.value).toEqual({ kind: 'armed' })
    live.press('live:0:9', 'kick', { pitch: 0, gate: false })
    b.link.render(0)
    expect(live.rec.value).toEqual({ kind: 'recording', seconds: 0 })
    b.link.render(128 / RATE)
    b.link.render(256 / RATE)
    live.stopRecording()
    expect(live.rec.value).toEqual({ kind: 'idle' })
    expect(takes).toHaveLength(1)
    const t = takes[0]!.take!
    expect(t.frames).toBe(300)
    expect(t.seconds).toBeCloseTo(300 / RATE, 9)
    const w = await wavOf(t)
    expect(w.channels).toBe(2)
    expect(w.sampleRate).toBe(RATE)
    expect(w.pcm.length).toBe(300 * 4)
    expect(new DataView(w.pcm.buffer, w.pcm.byteOffset).getInt16(0, true)).toBe(10000)
  })

  it('nothing played: no take', async () => {
    const { b, live, takes } = await recording()
    b.link.render(0)
    live.stopRecording()
    expect(takes).toEqual([{ take: null, limit: false }])
  })

  it("follows the EP-133's PLAY and STOP", async () => {
    const { b, live, takes } = await recording()
    live.transportStarted()
    b.link.render(0)
    expect(live.rec.value.kind).toBe('recording')
    live.press('live:0:9', 'kick', { pitch: 0, gate: false })
    b.link.render(128 / RATE, 512)
    live.transportStopped()
    expect(takes[0]!.take!.frames).toBe(128 + 300)
    expect(live.rec.value.kind).toBe('idle')
  })

  it('Live closing mid-take saves it before the output goes', async () => {
    const { b, live, takes } = await recording()
    live.press('live:0:9', 'kick', { pitch: 0, gate: false })
    b.link.render(0)
    const link = b.link
    live.close()
    // The fake mixer ends the take as the stop arrives, so the output closes at once.
    expect(takes[0]!.take!.frames).toBe(128)
    expect(link.closed).toBe(true)
    expect(b.ctx.closed).toBe(true)
    expect(live.rec.value.kind).toBe('idle')
  })

  it('a mixer that never answers: the take is cut where it is', async () => {
    const { b, live, takes } = await recording()
    live.press('live:0:9', 'kick', { pitch: 0, gate: false })
    b.link.render(0)
    b.link.host.handle = () => undefined
    const link = b.link
    const real = globalThis.setTimeout
    let later: (() => void) | null = null
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      if (ms === TAKE_END_WAIT_MS) later = fn
      return 0
    }) as typeof setTimeout
    try {
      live.close()
    } finally {
      globalThis.setTimeout = real
    }
    expect(link.closed).toBe(false)
    // Nothing reached the main thread yet: the chunk is still on the audio side.
    later!()
    expect(takes).toEqual([{ take: null, limit: false }])
    expect(link.closed).toBe(true)
  })

  it('takeWav cuts the chunks to the frames kept', async () => {
    const a = Int16Array.from([1, 2, 3, 4])
    const c = Int16Array.from([5, 6, 7, 8])
    const w = decodeWav(new Uint8Array(await takeWav([a, c], 3, 1000).arrayBuffer()))
    expect([...new Int16Array(w.pcm.slice().buffer)]).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('LiveAudio PATTERN', () => {
  const plan = (voices: Map<number, string>) => ({
    patterns: projectPatterns([pattern(1, [patternNote(0, 0, 24)]), pattern(), pattern(), pattern()]),
    voices,
    skip: new Map<number, number>(),
    bpm: 120,
    phase: PhaseAnchors.ZERO,
  })

  it('sends the plan with its sounds, plays it and follows its clock', async () => {
    const b = new FakeBackend()
    const live = new LiveAudio(b)
    live.preload('kick', tone(300), 1, RATE)
    live.seqPlan(plan(new Map([[0, 'kick'], [1, 'nothing']])))
    expect(live.seqPlay(0, 0, null)).toBe(true)
    await flush()
    const sent = b.link.sent.find((m) => m.t === 'plan')
    expect(sent).toMatchObject({ t: 'plan', voices: [{ pad: 0, id: 1, channels: 1, sampleRate: RATE }], bpm: 120 })
    b.ctx.timestamp = { contextTime: 1, performanceTime: 5000 }
    for (let i = 0; i < 20; i++) b.link.render(1 + (i * 128) / RATE)
    const tl = live.timeline.value
    expect(tl?.clock).toEqual({ anchorFrame: 2400, rate: RATE, bpm: 120 })
    expect(tl?.frames).toEqual({ frame: 0, ms: 5000, rate: RATE })
    // The note's voice sounds from tick 0 on.
    expect(live.voices.value.has('live:0:0')).toBe(true)
    live.seqStop()
    expect(live.timeline.value).toBeNull()
    expect(b.link.sent.at(-1)).toEqual({ t: 'stopSeq' })
  })

  it("armed, a press's frame comes from the mix's stamp", async () => {
    const b = new FakeBackend()
    const live = new LiveAudio(b)
    live.open()
    await flush()
    live.seqArm(true)
    b.ctx.timestamp = { contextTime: 1, performanceTime: 5000 }
    b.link.render(1)
    expect(live.seqPlay(0, 0, 5010)).toBe(true)
    expect(b.link.sent.at(-1)).toEqual({ t: 'play', countInBars: 0, leadMs: 0, atFrame: 480, atPress: true })
  })

  it('a new output is told RECORD waits', async () => {
    const b = new FakeBackend()
    const live = new LiveAudio(b)
    live.seqArm(true)
    live.open()
    await flush()
    expect(b.link.sent.map((m) => m.t)).toContain('seqArmed')
  })
})
