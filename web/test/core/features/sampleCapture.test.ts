// Port of core/src/test/kotlin/dev/arc/ep133/features/SampleCaptureTest.kt
import { describe, expect, it } from 'vitest'
import { End, Ended, SampleCapture, Started, State } from '../../../src/core/features/sampleCapture'

// [n] mono frames from frame [at], each sample its own frame number, so a
// take shows exactly which frames it kept; [loud] frames are 20000, over
// a 0.5 threshold that the frame numbers (all under 16384) stay below.
const ramp = (at: number, n: number, ...loud: number[]): Int16Array =>
  Int16Array.from({ length: n }, (_, i) => (loud.includes(at + i) ? 20000 : at + i))

const feed = (c: SampleCapture, at: number, n: number, ...loud: number[]) => c.feed(ramp(at, n, ...loud), n, 1, at)

const shorts = (...v: number[]): Int16Array => Int16Array.from(v)

const capture = (preRoll = 20) => new SampleCapture(1000, 1, 1000, preRoll)

const first = (a: Int16Array): number => a[0]!
const last = (a: Int16Array): number => a[a.length - 1]!

describe('SampleCaptureTest', () => {
  it('nothing is kept while idle', () => {
    const c = capture()
    expect(feed(c, 0, 100, 50)).toBeNull()
    expect(c.state).toBe(State.IDLE)
    expect(c.frames).toBe(0)
    expect(c.started).toBeNull()
  })

  it('armed without a threshold, the take starts at its frame inside a block', () => {
    const c = capture()
    c.arm(130, null)
    expect(feed(c, 0, 100)).toBeNull()
    expect(c.state).toBe(State.ARMED)
    expect(feed(c, 100, 100)).toEqual(Started(130))
    expect(c.state).toBe(State.RECORDING)
    expect(c.frames).toBe(70)
    expect(first(c.take())).toBe(130)
    expect(last(c.take())).toBe(199)
  })

  it('armed late, the take reaches back through the ring as far as it goes', () => {
    const c = capture()
    feed(c, 0, 100)
    // Frame 50 has gone by, and only 80..99 are still in the ring.
    c.arm(50, null)
    expect(feed(c, 100, 100)).toEqual(Started(80))
    expect(c.frames).toBe(120)
    expect(first(c.take())).toBe(80)

    const d = capture()
    feed(d, 0, 100)
    d.arm(95, null)
    expect(feed(d, 100, 10)).toEqual(Started(95))
    expect(d.take().slice(0, 6)).toEqual(shorts(95, 96, 97, 98, 99, 100))
  })

  it('quiet blocks keep nothing and stay armed', () => {
    const c = capture()
    c.arm(0, 0.5)
    for (let i = 0; i < 3; i++) expect(feed(c, i * 100, 100)).toBeNull()
    expect(c.state).toBe(State.ARMED)
    expect(c.frames).toBe(0)
    expect(c.started).toBeNull()
  })

  it('the take starts the pre-roll before the frame that crosses the threshold', () => {
    const c = capture()
    feed(c, 0, 100)
    c.arm(100, 0.5)
    expect(feed(c, 100, 100, 150)).toEqual(Started(130))
    expect(c.take()[0]).toBe(130)
    expect(c.take()[20]).toBe(20000)
    expect(c.frames).toBe(70)
  })

  it('the pre-roll reaches back into the block before', () => {
    const c = capture()
    c.arm(0, 0.5)
    expect(feed(c, 0, 100)).toBeNull()
    expect(feed(c, 100, 100, 105)).toEqual(Started(85))
    expect(c.take().slice(0, 3)).toEqual(shorts(85, 86, 87))
    expect(c.take()[14]).toBe(99)
    expect(c.take()[20]).toBe(20000)
    expect(c.frames).toBe(115)
  })

  it('the pre-roll goes back no further than what was fed, preRollFrames or the armed frame', () => {
    // Nothing fed before the crossing's block.
    const fed = capture()
    fed.arm(0, 0.5)
    expect(feed(fed, 1000, 100, 1005)).toEqual(Started(1000))
    expect(fed.take()[5]).toBe(20000)

    // A shorter pre-roll.
    const short = capture(5)
    short.arm(0, 0.5)
    expect(feed(short, 100, 100, 150)).toEqual(Started(145))

    // Not before the frame it was armed at, and a crossing before that doesn't count.
    const from = capture()
    feed(from, 0, 100)
    from.arm(140, 0.5)
    expect(feed(from, 100, 100, 120, 150)).toEqual(Started(140))
    expect(from.take()[0]).toBe(140)
    expect(from.take()[10]).toBe(20000)
  })

  it('a stop inside a later block keeps exactly the frames before it', () => {
    const c = capture()
    c.arm(0, null)
    expect(feed(c, 0, 100)).toEqual(Started(0))
    c.stop(250)
    expect(c.state).toBe(State.RECORDING)
    expect(feed(c, 100, 100)).toBeNull()
    expect(feed(c, 200, 100)).toEqual(Ended(End.STOPPED))
    expect(c.state).toBe(State.DONE)
    expect(c.frames).toBe(250)
    expect(last(c.take())).toBe(249)
    expect(feed(c, 300, 100)).toBeNull()
    expect(c.frames).toBe(250)

    // A stop at a frame already fed cuts the take back at once.
    const d = capture()
    d.arm(0, null)
    feed(d, 0, 100)
    feed(d, 100, 100)
    d.stop(150)
    expect(d.state).toBe(State.DONE)
    expect(d.end).toBe(End.STOPPED)
    expect(d.frames).toBe(150)
    expect(last(d.take())).toBe(149)
  })

  it('a stop before the threshold is crossed keeps nothing', () => {
    const c = capture()
    c.arm(0, 0.5)
    feed(c, 0, 100)
    c.stop(50)
    expect(c.state).toBe(State.DONE)
    expect(c.end).toBe(End.STOPPED)
    expect(c.frames).toBe(0)

    // A stop the input hasn't reached: a crossing after it doesn't start the take.
    const d = capture()
    d.arm(0, 0.5)
    feed(d, 0, 100)
    d.stop(150)
    expect(d.state).toBe(State.ARMED)
    expect(feed(d, 100, 100, 160)).toEqual(Ended(End.STOPPED))
    expect(d.frames).toBe(0)
    expect(d.started).toBeNull()
  })

  it('armed late with a threshold, frames already fed that crossed it start the take', () => {
    // The crossing at 95 was fed before the arm: the take starts its
    // pre-roll before it (75), no further back than the ring (80).
    const c = capture()
    feed(c, 0, 100, 95)
    c.arm(50, 0.5)
    expect(feed(c, 100, 100)).toEqual(Started(80))
    expect(c.frames).toBe(120)
    expect(first(c.take())).toBe(80)
    expect(c.take()[15]).toBe(20000)

    // ...or the armed frame.
    const d = capture()
    feed(d, 0, 100, 95)
    d.arm(90, 0.5)
    expect(feed(d, 100, 100)).toEqual(Started(90))
    expect(d.frames).toBe(110)
    expect(d.take()[5]).toBe(20000)

    // A crossing before the armed frame doesn't count.
    const e = capture()
    feed(e, 0, 100, 85)
    e.arm(90, 0.5)
    expect(feed(e, 100, 100)).toBeNull()
    expect(e.state).toBe(State.ARMED)

    // A stop with nothing fed since the arm keeps the frames up to it...
    const f = capture()
    feed(f, 0, 100, 95)
    f.arm(90, 0.5)
    f.stop(98)
    expect(f.end).toBe(End.STOPPED)
    expect(f.started).toBe(90)
    expect(f.frames).toBe(8)
    expect(f.take()[5]).toBe(20000)

    // ...unless it comes before the crossing.
    const g = capture()
    feed(g, 0, 100, 95)
    g.arm(90, 0.5)
    g.stop(95)
    expect(g.end).toBe(End.STOPPED)
    expect(g.frames).toBe(0)
    expect(g.started).toBeNull()

    // The threshold is checked before stereo mixes down, as it is live.
    const h = capture()
    const stereo = new Int16Array(200)
    stereo[190] = 20000
    stereo[191] = -20000
    h.feed(stereo, 100, 2, 0)
    h.arm(90, 0.5)
    expect(feed(h, 100, 100)).toEqual(Started(90))
    expect(h.take()[5]).toBe(0)
  })

  it('stereo mixes down to a mono take, and mono doubles for a stereo one', () => {
    const mono = new SampleCapture(1000, 1, 100)
    mono.arm(0, null)
    mono.feed(shorts(3, 4, -3, -4, 32767, 32767, -32768, -32767), 4, 2, 0)
    expect(mono.take()).toEqual(shorts(3, -4, 32767, -32768))

    const stereo = new SampleCapture(1000, 2, 100)
    stereo.arm(0, null)
    stereo.feed(shorts(5, -6), 2, 1, 0)
    expect(stereo.take()).toEqual(shorts(5, 5, -6, -6))
    expect(stereo.frames).toBe(2)
  })

  it('gain rounds half up and clips to 16 bits', () => {
    const c = new SampleCapture(1000, 1, 100)
    c.gain = 2
    c.arm(0, null)
    c.feed(shorts(100, 20000, -20000, -3), 4, 1, 0)
    expect(c.take()).toEqual(shorts(200, 32767, -32768, -6))
    expect(c.blockPeak).toBe(1)

    const d = new SampleCapture(1000, 1, 100)
    d.gain = 0.5
    d.arm(0, null)
    d.feed(shorts(3, -3, 1, -1, 16384), 5, 1, 0)
    expect(d.take()).toEqual(shorts(2, -1, 1, 0, 8192))
    expect(d.blockPeak).toBe(0.25)
  })

  it('20 s stereo and 40 s mono end at their limit exactly', () => {
    for (const [channels, seconds] of [
      [2, 20],
      [1, 40],
    ] as const) {
      const rate = 48000
      const c = new SampleCapture(rate, channels, seconds * rate)
      c.arm(0, null)
      const block = new Int16Array(1000 * channels).fill(7)
      let at = 0
      let ended = null
      while (ended === null) {
        const e = c.feed(block, 1000, channels, at)
        if (e?.type === 'Ended') ended = e
        at += 1000
      }
      expect(ended).toEqual(Ended(End.LIMIT))
      expect(c.frames).toBe(seconds * rate)
      expect(c.seconds).toBe(seconds)
      expect(c.take().length).toBe(seconds * rate * channels)
      expect(c.feed(block, 1000, channels, at)).toBeNull()
    }
  })

  it('a schedule ignores the threshold and starts exactly inside a block', () => {
    const c = capture()
    c.arm(0, 0.9)
    c.schedule(150, 200)
    expect(feed(c, 0, 100)).toBeNull()
    expect(c.state).toBe(State.SCHEDULED)
    expect(feed(c, 100, 100)).toEqual(Started(150))
    expect(feed(c, 200, 100)).toBeNull()
    expect(feed(c, 300, 100)).toEqual(Ended(End.BARS))
    expect(c.frames).toBe(200)
    expect(first(c.take())).toBe(150)
    expect(last(c.take())).toBe(349)
  })

  it('a schedule starts in a later block, or starts and ends in one', () => {
    const c = capture()
    c.schedule(450, 100)
    for (let i = 0; i < 4; i++) expect(feed(c, i * 100, 100)).toBeNull()
    expect(feed(c, 400, 100)).toEqual(Started(450))
    expect(feed(c, 500, 100)).toEqual(Ended(End.BARS))
    expect(c.frames).toBe(100)
    expect(first(c.take())).toBe(450)
    expect(last(c.take())).toBe(549)

    const d = capture()
    d.schedule(110, 30)
    expect(feed(d, 100, 100)).toEqual(Ended(End.BARS))
    expect(d.started).toBe(110)
    expect(d.frames).toBe(30)
    expect(last(d.take())).toBe(139)
  })

  it('a gap in the input is filled with silence', () => {
    const c = capture()
    c.arm(0, null)
    feed(c, 1, 99)
    // Frames 100..149 never came.
    feed(c, 150, 100)
    expect(c.frames).toBe(249)
    expect(c.take()[98]).toBe(99)
    expect(c.take().slice(99, 149)).toEqual(new Int16Array(50))
    expect(c.take()[149]).toBe(150)

    // Inside a schedule too, even when the take starts in the gap.
    const d = capture()
    d.schedule(120, 100)
    expect(feed(d, 0, 100)).toBeNull()
    expect(feed(d, 200, 100)).toEqual(Ended(End.BARS))
    expect(d.started).toBe(120)
    expect(d.frames).toBe(100)
    expect(d.take().slice(0, 80)).toEqual(new Int16Array(80))
    expect(d.take()[80]).toBe(200)
  })

  it('seconds count the recorded frames', () => {
    const c = new SampleCapture(10, 1, 100)
    c.arm(0, null)
    for (let i = 0; i < 3; i++) feed(c, i * 10, 10)
    expect(c.seconds).toBe(3)
    feed(c, 30, 5)
    expect(c.frames).toBe(35)
    expect(c.seconds).toBe(3)
  })

  it('cancel throws the take away', () => {
    const c = capture()
    c.arm(0, null)
    feed(c, 0, 100)
    c.cancel()
    expect(c.state).toBe(State.DONE)
    expect(c.end).toBe(End.CANCELLED)
    expect(c.frames).toBe(0)
    expect(c.take().length).toBe(0)
    expect(feed(c, 100, 100)).toBeNull()
    expect(c.frames).toBe(0)
  })

  it('a lost input keeps what was recorded', () => {
    const c = capture()
    c.arm(0, null)
    feed(c, 0, 100)
    c.lost()
    expect(c.state).toBe(State.DONE)
    expect(c.end).toBe(End.LOST)
    expect(c.frames).toBe(100)
    expect(feed(c, 100, 100)).toBeNull()
    expect(c.frames).toBe(100)

    const d = capture()
    d.arm(0, 0.5)
    feed(d, 0, 100)
    d.lost()
    expect(d.end).toBe(End.LOST)
    expect(d.frames).toBe(0)
  })

  it('feed reports when the take starts and ends', () => {
    const c = capture()
    c.arm(0, null)
    expect(feed(c, 0, 100)).toEqual(Started(0))
    c.stop(150)
    expect(feed(c, 100, 100)).toEqual(Ended(End.STOPPED))
    expect(feed(c, 200, 100)).toBeNull()

    // Started and stopped in one block: the end is reported, the start is still there to read.
    const d = capture()
    d.arm(10, null)
    d.stop(30)
    expect(feed(d, 0, 100)).toEqual(Ended(End.STOPPED))
    expect(d.started).toBe(10)
    expect(d.frames).toBe(20)
    expect(d.take().slice(0, 2)).toEqual(shorts(10, 11))
  })
})
