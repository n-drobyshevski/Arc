// Port of app/src/test/kotlin/dev/arc/ep133/audio/SampleRecorderTest.kt (its
// RSP side: SampleTap, platform/audio/sampleTap.ts), and SAMPLE's RSP in
// Live's mix (MixerHost).
//
// SAMPLE's recorder with a fake Live mix fed by hand: a press or release at a
// mix frame lands on that frame, the threshold keeps its pre-roll, latched and
// capped takes end as they should, and closing or losing the mix keeps what
// was recorded.
//
// Web deltas in the tests (see sampleTap.ts's header):
// - Kotlin feeds a mono MIC input with frames whose samples are their own
//   frame numbers; here the mix is always stereo, so each frame carries its
//   number on both channels and a mono take (mixed down, (l + r) >> 1) reads it
//   back unchanged.
// - Kotlin's presses are nanos turned into frames by a FrameClock at 1000 Hz
//   (FrameClock(0, 0, rate): ms(n) is frame n); here a press comes as the mix
//   frame itself (`at`; LiveAudio's stamp turns the press's time into it), and
//   null where Kotlin had no clock yet.
// - Pads are pad keys: PhysicalPad(0, 7) is 7, PhysicalPad(1, 3) is 15.
// - Gain and threshold are linear: Kotlin's dB go through PeakMeter.fromDb. The
//   threshold rides on the arm ask (LiveAudio takes it from SAMPLE's setting
//   as Kotlin's arm takes its own at the press).
// - Kotlin's `going` is true as soon as a take is asked (counted on the
//   caller's thread); the tap takes its asks with the next block, so its
//   `going` is true from that block on.
// - What Kotlin's StateFlow `phase` holds is the last phase the tap posted;
//   Kotlin's level() is the last level the tap posted.
//
// Skipped (they don't apply to RSP on the web):
// - "a take straight after another, before the first is copied, loses
//   nothing": Kotlin's two take buffers and the copy on a queued scope; the
//   web has one buffer and copies a take out as it ends.
// - "a stereo input the phone opens mono records a mono take, as long as a
//   mono one": MIC only (an input that opens with fewer channels than asked).
// - "an input that won't open says why": MIC/USB only (Input.start throwing);
//   RSP always opens.
// - "a silenced input is shown until it closes": MIC only (Android silencing
//   the mic for another app).
// - "a take at a mix frame still waiting as Live's output reopens is over":
//   reopen/hand-over; a new output is a new MixerHost and a new tap.
// - "RSP opens again at the new rate when Live's output reopens":
//   reopen/hand-over (and onReopened/onLost), as above.
// - "a press as Live's output opens at another rate still records, at that
//   rate": reopen/hand-over, as above.
// - "a take waiting for sound as Live's output reopens waits on, at the new
//   rate": reopen/hand-over, as above.
// - "opening the same input again keeps it, another replaces it": MIC → RSP
//   input switching on the recorder; the web's tap is RSP only, and its gain
//   changes through 'sampleSet', not a second open.
// Adapted: "a take at a mix frame is RSP's only" keeps its first half (no
// take with RSP closed) as a MixerHost test below; its MIC half is skipped.
// "a take ended by closing is handed over after close, not inside it" keeps
// its take and its phase (Ready before the take comes); the web posts the take
// from inside close(), which the main thread hears only after it anyway.

import { describe, expect, it } from 'vitest'
import { PeakMeter } from '../../src/core/features/peakMeter'
import { SampleCapture } from '../../src/core/features/sampleCapture'
import { MixerHost, type FromMixer } from '../../src/platform/audio/liveMixer'
import { SampleTap, type TapAsk, type TapPhase, type TapTake } from '../../src/platform/audio/sampleTap'

// 1000 frames a second: a frame a millisecond, as Kotlin's times read.
const RATE = 1000
const PAD = 7 // PhysicalPad(0, 7)
const OTHER = 15 // PhysicalPad(1, 3)
const INT_MAX = 2 ** 31 - 1
const READY: TapPhase = { kind: 'ready' }

const ramp = (from: number, until: number) => Int16Array.from({ length: until - from }, (_, i) => from + i)
const frames = (t: TapTake) => t.pcm.length / t.channels
const waiting = (pad: number, latched = false): TapPhase => ({ kind: 'waiting', pad, latched })
const recording = (pad: number, seconds: number, maxSeconds: number, latched: boolean): TapPhase => ({ kind: 'recording', pad, seconds, maxSeconds, latched })

/** A tap on a fake mix fed by hand, with what it said. */
class Rig {
  readonly tap: SampleTap
  readonly phases: TapPhase[] = []
  readonly levels: { level: number; clip: boolean }[] = []
  readonly takes: TapTake[] = []
  /** The phase shown as each take came. */
  readonly seen: TapPhase[] = []
  fed = 0

  constructor(stereo = false, rate = RATE) {
    this.tap = new SampleTap(rate, stereo, {
      phase: (p) => this.phases.push(p),
      level: (level, clip) => this.levels.push({ level, clip }),
      take: (t) => {
        this.seen.push(this.phase)
        this.takes.push(t)
      },
    })
  }

  /** The phase shown now: the last one posted. */
  get phase(): TapPhase {
    return this.phases.at(-1) ?? READY
  }

  /** [n] stereo frames whose samples are their own frame numbers (on both channels), or [value]. */
  feed(n: number, value?: number): void {
    const pcm = new Int16Array(n * 2)
    for (let i = 0; i < n; i++) pcm[2 * i] = pcm[2 * i + 1] = value ?? this.fed + i
    this.tap.mixed(pcm, n, this.fed)
    this.fed += n
  }

  arm(pad: number, at: number | null, latched: boolean, maxFrames: number, threshold: number | null = null): void {
    this.tap.ask({ kind: 'arm', pad, at, latched, maxFrames, threshold })
  }

  schedule(pad: number, start: number, length: number, maxFrames = INT_MAX): void {
    this.tap.ask({ kind: 'schedule', pad, start, length, maxFrames })
  }

  stop(at: number | null): void {
    this.tap.ask({ kind: 'stop', at })
  }

  cancel(): void {
    this.tap.ask({ kind: 'cancel' })
  }
}

describe('SampleTap', () => {
  it('a held pad records from its press to its release', () => {
    const r = new Rig()
    r.feed(50)
    r.arm(PAD, 100, false, 40_000)
    r.feed(150)
    expect(r.phase).toEqual(recording(PAD, 0, 40, false))
    r.stop(300)
    r.feed(200)
    expect(r.takes).toHaveLength(1)
    const t = r.takes[0]!
    expect(t.end).toBe(SampleCapture.End.STOPPED)
    expect(t.pcm).toEqual(ramp(100, 300))
    expect(t.channels).toBe(1)
    expect(t.rate).toBe(RATE)
    expect(t.pad).toBe(PAD)
    expect(t.latched).toBe(false)
    expect(r.phase).toEqual(READY)
  })

  // Kotlin: "the press and release are found through the input's clock" (frame 5000 captured at 1 s, the
  // press at 1.05 s is frame 5050). The clock is the main thread's here: the tap gets the frames.
  it('the press and release land on their mix frames, however far the mix has counted', () => {
    const r = new Rig()
    r.fed = 5000
    r.feed(20)
    r.arm(PAD, 5050, false, 40_000)
    r.stop(5080)
    r.feed(100)
    expect(r.takes).toHaveLength(1)
    expect(r.takes[0]!.pcm).toEqual(ramp(5050, 5080))
  })

  // Kotlin: "with no clock yet a press starts at the next frame to come". No stamp yet: LiveAudio sends null.
  it('with no frame for it a press starts at the next frame to come', () => {
    const r = new Rig()
    r.feed(30)
    r.arm(PAD, null, false, 40_000)
    r.feed(20)
    r.stop(null)
    r.feed(10)
    // The stop also has no frame: it lands on the frame after the last fed.
    expect(r.takes).toHaveLength(1)
    expect(r.takes[0]!.pcm).toEqual(ramp(30, 50))
  })

  it('a threshold waits for the sound and keeps the 20 ms before it', () => {
    const r = new Rig()
    r.arm(PAD, 0, false, 40_000, PeakMeter.fromDb(-6))
    r.feed(100, 100)
    expect(r.phase).toEqual(waiting(PAD))
    // Loud from frame 100 on: the take starts 20 frames (20 ms) before it.
    r.feed(50, 30_000)
    r.stop(150)
    r.feed(10)
    expect(r.takes).toHaveLength(1)
    const pcm = r.takes[0]!.pcm
    expect(pcm.length).toBe(50 + 20)
    expect(pcm.subarray(0, 20).every((s) => s === 100)).toBe(true)
    expect(pcm.subarray(20).every((s) => s === 30_000)).toBe(true)
  })

  it('the level is applied before the threshold and the take', () => {
    const r = new Rig()
    r.tap.gain = PeakMeter.fromDb(6.0206)
    r.arm(PAD, 0, false, 40_000, PeakMeter.fromDb(-6))
    // 10000 doubled crosses −6 dBFS (about 16423); alone it wouldn't.
    r.feed(40, 10_000)
    r.stop(40)
    r.feed(10)
    expect(r.takes).toHaveLength(1)
    expect(r.takes[0]!.pcm.every((s) => s === 20_000)).toBe(true)
    expect(r.levels.at(-1)!.level).toBeGreaterThan(0.9)
  })

  it('a latched take runs until stopped and says so', () => {
    const r = new Rig()
    r.arm(PAD, 0, true, 40_000)
    for (let i = 0; i < 25; i++) r.feed(100)
    expect(r.phase).toEqual(recording(PAD, 2, 40, true))
    r.stop(2500)
    r.feed(10)
    expect(r.takes).toHaveLength(1)
    const t = r.takes[0]!
    expect(t.latched).toBe(true)
    expect(frames(t)).toBe(2500)
    // Each second was shown as it came.
    const shown = [...new Set(r.phases.flatMap((p) => (p.kind === 'recording' ? [p.seconds] : [])))]
    expect(shown).toEqual([0, 1, 2])
  })

  it('a cap below the longest take ends it there, at the limit', () => {
    const r = new Rig()
    r.arm(PAD, 10, true, 1234)
    for (let i = 0; i < 20; i++) r.feed(100)
    expect(r.takes).toHaveLength(1)
    const t = r.takes[0]!
    expect(t.end).toBe(SampleCapture.End.LIMIT)
    expect(t.pcm).toEqual(ramp(10, 1244))
    expect(r.phase).toEqual(READY)
    // No room at all: nothing is armed.
    const shown = r.phases.length
    r.arm(PAD, 2000, false, 0)
    r.feed(10)
    expect(r.tap.going).toBe(false)
    expect(r.phases.length).toBe(shown)
    expect(r.takes).toHaveLength(1)
  })

  it('the longest take ends at the limit', () => {
    const r = new Rig()
    expect(r.tap.maxFrames).toBe(40 * RATE)
    r.arm(PAD, 0, true, INT_MAX)
    for (let i = 0; i < 41; i++) r.feed(1000, 1)
    expect(r.takes).toHaveLength(1)
    const t = r.takes[0]!
    expect(t.end).toBe(SampleCapture.End.LIMIT)
    expect(frames(t)).toBe(40 * RATE)
  })

  it('a cancelled take never comes', () => {
    const r = new Rig()
    r.arm(PAD, 0, false, 40_000)
    r.feed(100)
    r.cancel()
    r.feed(100)
    expect(r.takes).toEqual([])
    expect(r.phase).toEqual(READY)
  })

  it('a press while a take goes ends it there, then starts its own', () => {
    const r = new Rig()
    r.arm(PAD, 0, true, 40_000)
    r.feed(100)
    r.arm(OTHER, 100, false, 40_000)
    r.feed(50)
    r.stop(150)
    r.feed(10)
    expect(r.takes).toHaveLength(2)
    expect(r.takes[0]!.pcm).toEqual(ramp(0, 100))
    expect(r.takes[1]!.pad).toBe(OTHER)
    expect(r.takes[1]!.pcm).toEqual(ramp(100, 150))
  })

  // Kotlin: "stereo input goes into a mono take mixed down, and mono into stereo doubled". RSP's mix is
  // always stereo: a mono take mixes it down, a stereo one keeps it (the mono-input half is MIC's).
  it("RSP's stereo mix goes into a mono take mixed down, and into a stereo one as it is", () => {
    const lr = new Int16Array(20).map((_, i) => (i % 2 === 0 ? 100 : 300))
    const r = new Rig(false)
    r.arm(PAD, 0, false, 40_000)
    r.tap.mixed(lr, 10, 0)
    r.stop(10)
    r.tap.mixed(new Int16Array(20), 10, 10)
    expect(r.takes).toHaveLength(1)
    expect(r.takes[0]!.channels).toBe(1)
    expect(r.takes[0]!.pcm.every((s) => s === 200)).toBe(true)

    const m = new Rig(true)
    m.arm(PAD, 0, false, 40_000)
    m.tap.mixed(lr, 10, 0)
    m.stop(10)
    m.tap.mixed(new Int16Array(20), 10, 10)
    expect(m.takes).toHaveLength(1)
    const t = m.takes[0]!
    expect(t.channels).toBe(2)
    expect(frames(t)).toBe(10)
    expect(t.pcm[0]).toBe(100)
    expect(t.pcm[1]).toBe(300)
  })

  // The second half's "first buffer, home again" is Kotlin's two buffers; the web's one keeps the latest
  // frames in its ring all the same.
  it('a press straight after a take records from its frame, already fed', () => {
    const r = new Rig()
    r.arm(PAD, 0, true, 40_000)
    r.feed(100)
    // Pressed at frame 80, which reached the tap after frames up to 100 had.
    r.arm(OTHER, 80, false, 40_000)
    r.feed(50)
    r.stop(150)
    r.feed(10)
    expect(r.takes).toHaveLength(2)
    expect(r.takes[0]!.pcm).toEqual(ramp(0, 80))
    expect(r.takes[1]!.pcm).toEqual(ramp(80, 150))

    // A third take straight after the second has its frames too.
    r.arm(PAD, 160, true, 40_000)
    r.feed(100)
    r.arm(OTHER, 200, false, 40_000)
    r.feed(100)
    r.stop(300)
    r.feed(10)
    expect(r.takes).toHaveLength(4)
    expect(r.takes[2]!.pcm).toEqual(ramp(160, 200))
    expect(r.takes[3]!.pcm).toEqual(ramp(200, 300))
  })

  it("RSP finds a press the mix was fed past, by the output's latency", () => {
    const r = new Rig()
    // Mixed 300 ms ahead of what is heard: the press at 100 ms (mix frame 100) comes as frame 300 is fed.
    r.feed(300)
    r.arm(PAD, 100, false, 40_000)
    r.stop(200)
    r.feed(100, 0)
    expect(r.takes).toHaveLength(1)
    expect(r.takes[0]!.pcm).toEqual(ramp(100, 200))

    // With a threshold, a crossing at frame 450 already fed is found, with its 20 ms.
    r.tap.mixed(new Int16Array(400).map((_, i) => (Math.trunc(i / 2) >= 50 && Math.trunc(i / 2) < 100 ? 30_000 : 0)), 200, 400)
    r.fed = 600
    r.arm(PAD, 420, false, 40_000, PeakMeter.fromDb(-6))
    r.feed(100, 0)
    r.stop(700)
    r.feed(100, 0)
    expect(r.takes).toHaveLength(2)
    const t = r.takes[1]!
    expect(frames(t)).toBe(700 - 430)
    expect(t.pcm.subarray(0, 20).every((s) => s === 0)).toBe(true)
    expect(t.pcm[20]).toBe(30_000)
  })

  // Kotlin: "a take ended by closing is handed over after close, not inside it". The web posts the take
  // from close() (the main thread hears it after, by message); what holds is the take and the phase it sees.
  it('a take ended by closing comes whole, with the phase ready before it', () => {
    const r = new Rig()
    r.arm(PAD, 0, true, 40_000)
    r.feed(100)
    r.tap.close()
    expect(r.takes).toHaveLength(1)
    expect(r.takes[0]!.pcm).toEqual(ramp(0, 100))
    expect(r.seen).toEqual([READY])
    expect(r.phase).toEqual(READY)
  })

  it('closing keeps the take going up to the last block', () => {
    const r = new Rig()
    r.arm(PAD, 20, true, 40_000)
    r.feed(100)
    r.stop(500)
    r.tap.close()
    expect(r.takes).toHaveLength(1)
    expect(r.takes[0]!.end).toBe(SampleCapture.End.STOPPED)
    expect(r.takes[0]!.pcm).toEqual(ramp(20, 100))
    expect(r.phase).toEqual(READY)
    // Blocks still on their way are dropped (Kotlin's closed input: nothing more is metered or taken).
    const said = r.phases.length + r.levels.length
    r.feed(100)
    expect(r.takes).toHaveLength(1)
    expect(r.phases.length + r.levels.length).toBe(said)
  })

  it('closing while waiting for the threshold keeps nothing', () => {
    const r = new Rig()
    r.arm(PAD, 0, false, 40_000, PeakMeter.fromDb(-6))
    r.feed(100, 10)
    r.tap.close()
    expect(r.takes).toEqual([])
    expect(r.phase).toEqual(READY)
  })

  // Kotlin: "a lost input keeps what was recorded and says why". Why it went (and onLost) is LiveAudio's.
  it('a lost mix keeps what was recorded', () => {
    const r = new Rig()
    r.arm(PAD, 0, true, 40_000)
    r.feed(100)
    r.tap.lost()
    expect(r.takes).toHaveLength(1)
    const t = r.takes[0]!
    expect(t.end).toBe(SampleCapture.End.LOST)
    expect(frames(t)).toBe(100)
    expect(r.phase).toEqual(READY)
    r.feed(100)
    expect(r.takes).toHaveLength(1)
  })

  it('a scheduled take is exact whatever the threshold', () => {
    const r = new Rig()
    // A schedule carries no threshold: the level never holds it up.
    r.schedule(PAD, 100, 250)
    for (let i = 0; i < 5; i++) r.feed(100, 5)
    expect(r.takes).toHaveLength(1)
    const t = r.takes[0]!
    expect(t.end).toBe(SampleCapture.End.BARS)
    expect(frames(t)).toBe(250)
    expect(t.latched).toBe(true)
  })

  it('a take scheduled at a mix frame is exact, with no clock', () => {
    const r = new Rig(true, 2000)
    // Mix frame 1200 for 300 frames: no stamp says when it is heard, none is needed.
    r.schedule(PAD, 1200, 300, 40_000)
    let wasGoing = false
    for (let at = 1000; at < 2000; at += 250) {
      r.tap.mixed(new Int16Array(500).map((_, i) => at + Math.trunc(i / 2)), 250, at)
      // Kotlin's going is true from the ask; the tap's from the block that takes it.
      if (at === 1000) wasGoing = r.tap.going
    }
    expect(wasGoing).toBe(true)
    expect(r.takes).toHaveLength(1)
    const t = r.takes[0]!
    expect(t.end).toBe(SampleCapture.End.BARS)
    expect(frames(t)).toBe(300)
    expect(t.pcm[0]).toBe(1200)
    expect(t.pcm[t.pcm.length - 1]).toBe(1499)
    expect(t.latched).toBe(true)
    expect(r.tap.going).toBe(false)
  })

  // Kotlin: "RSP taps Live's mix at its rate and lets go on close". Mix frame 1000 heard at 1 s: the press at
  // 1.1 s is mix frame 1200, the release at 1.2 s mix frame 1400 (LiveAudio's stamp turns them so).
  it("RSP takes Live's mix at its rate and lets go on close", () => {
    const r = new Rig(true, 2000)
    expect(r.tap.rate).toBe(2000)
    r.arm(PAD, 1200, false, 40_000)
    r.tap.mixed(new Int16Array(1000).map((_, i) => Math.trunc(i / 2)), 500, 1000)
    r.stop(1400)
    r.tap.mixed(new Int16Array(1000), 500, 1500)
    expect(r.takes).toHaveLength(1)
    const t = r.takes[0]!
    expect(t.channels).toBe(2)
    expect(t.rate).toBe(2000)
    expect(frames(t)).toBe(200)
    expect(t.pcm[0]).toBe(200)
    r.tap.close()
    const said = r.phases.length + r.levels.length
    r.tap.mixed(new Int16Array(1000), 500, 2000)
    expect(r.phases.length + r.levels.length).toBe(said)
  })

  it('a take is going from its press until it ends, however it ends', () => {
    const r = new Rig()
    expect(r.tap.going).toBe(false)
    // Kept: going from the block that takes the press, until the tap picks up the release.
    r.arm(PAD, 0, false, 40_000)
    r.feed(50)
    expect(r.tap.going).toBe(true)
    r.stop(40)
    expect(r.tap.going).toBe(true)
    r.feed(10)
    expect(r.tap.going).toBe(false)
    expect(r.takes).toHaveLength(1)
    // Cancelled.
    r.arm(PAD, 60, false, 40_000)
    r.feed(10)
    expect(r.tap.going).toBe(true)
    r.cancel()
    r.feed(10)
    expect(r.tap.going).toBe(false)
    // Stopped before the threshold was reached: nothing comes, and it is over all the same.
    r.arm(PAD, 80, true, 40_000, PeakMeter.fromDb(-6))
    r.feed(10, 10)
    expect(r.tap.going).toBe(true)
    r.stop(90)
    r.feed(10, 10)
    expect(r.tap.going).toBe(false)
    expect(r.takes).toHaveLength(1)
  })

  // Kotlin: "a hands-free take waiting for sound is over when its input is let go of" (−/+ to another
  // input). The web lets go of RSP by closing it ('sampleClose').
  it('a hands-free take waiting for sound is over when RSP is let go of', () => {
    const r = new Rig()
    r.arm(PAD, 0, true, 40_000, PeakMeter.fromDb(-6))
    r.feed(100, 10)
    expect(r.tap.going).toBe(true)
    r.tap.close()
    expect(r.tap.going).toBe(false)
    expect(r.takes).toEqual([])
  })

  it('a take asked of a mix that goes before it starts is over', () => {
    const r = new Rig()
    // Asked, and the mix gone before a block came to pick it up.
    r.arm(PAD, 0, true, 40_000)
    r.tap.lost()
    expect(r.tap.going).toBe(false)
    expect(r.takes).toEqual([])
    expect(r.phase).toEqual(READY)
    // Waiting for the threshold when it went: the same.
    const w = new Rig()
    w.arm(PAD, 0, true, 40_000, PeakMeter.fromDb(-6))
    w.feed(100, 10)
    expect(w.phase).toEqual(waiting(PAD, true))
    w.tap.lost()
    expect(w.tap.going).toBe(false)
    expect(w.takes).toEqual([])
    expect(w.phase).toEqual(READY)
  })
})

describe('MixerHost SAMPLE', () => {
  const HOST_RATE = 48000
  const BLOCK = 128

  /** A host at [HOST_RATE] with a loud mono tone sounding from frame 0, and what it posted. */
  function host(): { h: MixerHost; out: FromMixer[]; render: (blocks: number) => void } {
    const out: FromMixer[] = []
    const h = new MixerHost(HOST_RATE, (m) => out.push(m))
    h.handle({ t: 'load', id: 1, pcm: new Int16Array(HOST_RATE).fill(10_000) })
    h.handle({ t: 'start', key: 'live:0:7', id: 1, channels: 1, sampleRate: HOST_RATE, semitones: 0, tag: 0 })
    let block = 0
    const l = new Float32Array(BLOCK)
    const r = new Float32Array(BLOCK)
    const render = (blocks: number) => {
      for (let i = 0; i < blocks; i++, block++) h.render(l, r, BLOCK, (block * BLOCK) / HOST_RATE)
    }
    return { h, out, render }
  }
  const ask = (a: TapAsk): { t: 'sampleAsk'; ask: TapAsk } => ({ t: 'sampleAsk', ask: a })
  const phases = (out: FromMixer[]) => out.flatMap((m) => (m.t === 'samplePhase' ? [m.phase] : []))
  const takes = (out: FromMixer[]) => out.flatMap((m) => (m.t === 'sampleTake' ? [m.take] : []))
  const stamps = (out: FromMixer[]) => out.flatMap((m) => (m.t === 'stamp' ? [m.frame] : []))

  it("'sampleOpen' and an arm then a stop over a few renders post the phases and the take, to the frame", () => {
    const { h, out, render } = host()
    h.handle({ t: 'sampleOpen', stereo: false, gain: 1 })
    h.handle(ask({ kind: 'arm', pad: PAD, at: BLOCK, latched: false, maxFrames: 40 * HOST_RATE, threshold: null }))
    render(4)
    // Pressed at mix frame 128, released at 384: 256 frames of the tone, mixed down to mono.
    h.handle(ask({ kind: 'stop', at: 3 * BLOCK }))
    render(1)
    expect(phases(out)).toEqual([waiting(PAD), recording(PAD, 0, 40, false), READY])
    const [t, ...more] = takes(out)
    expect(more).toEqual([])
    expect(t).toMatchObject({ pad: PAD, channels: 1, rate: HOST_RATE, end: SampleCapture.End.STOPPED, latched: false })
    expect(t!.pcm.length).toBe(2 * BLOCK)
    expect(t!.pcm.every((s) => s === 10_000)).toBe(true)
  })

  it("stamps go while SAMPLE is open, with its level, and stop when it closes", () => {
    const { h, out, render } = host()
    render(10)
    expect(stamps(out)).toEqual([])
    h.handle({ t: 'sampleOpen', stereo: true, gain: 1 })
    // A stamp at once, then every quarter second (12000 frames: the first block at or past it).
    render(100)
    expect(stamps(out)).toEqual([10 * BLOCK, 10 * BLOCK + 94 * BLOCK])
    const level = out.filter((m) => m.t === 'sampleLevel')
    // A level every 50 ms (2400 frames: every 19th block), the tone's −10.3 dBFS.
    expect(level.length).toBe(Math.floor(100 / 19))
    expect(level.at(-1)).toMatchObject({ t: 'sampleLevel', clip: false })
    expect((level.at(-1) as { level: number }).level).toBeCloseTo(PeakMeter.markOf(PeakMeter.toDb(10_000 / 32768)), 5)
    h.handle({ t: 'sampleClose' })
    out.length = 0
    render(200)
    expect(stamps(out)).toEqual([])
    expect(out.some((m) => m.t === 'sampleLevel' || m.t === 'samplePhase' || m.t === 'sampleTake')).toBe(false)
  })

  // Kotlin: "a take at a mix frame is RSP's only" (its first half: nothing open, nothing taken).
  it('a take asked with SAMPLE closed is dropped', () => {
    const { h, out, render } = host()
    h.handle(ask({ kind: 'schedule', pad: PAD, start: 0, length: 100, maxFrames: INT_MAX }))
    h.handle({ t: 'sampleSet', gain: 2 })
    render(4)
    // Opened after: the ask before it is gone.
    h.handle({ t: 'sampleOpen', stereo: false, gain: 1 })
    render(4)
    expect(phases(out)).toEqual([])
    expect(takes(out)).toEqual([])
  })
})
